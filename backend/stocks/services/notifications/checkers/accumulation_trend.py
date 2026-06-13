from __future__ import annotations
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import PortfolioItem, WatchlistItem, Notification
from django.contrib.auth.models import User


_TREND_QUERY = """
WITH valid_dates AS (
    SELECT transaction_date
    FROM daily_floorsheet
    GROUP BY transaction_date
    HAVING COUNT(*) > 100
    ORDER BY transaction_date DESC
    LIMIT 6
),
date_milestones AS (
    SELECT (SELECT transaction_date FROM valid_dates OFFSET 5 LIMIT 1) as date_5d
),
floorsheet_net AS (
    SELECT symbol, buyer_id as broker, transaction_quantity as qty
    FROM daily_floorsheet
    WHERE symbol IN ({placeholders})
      AND transaction_date > (SELECT date_5d FROM date_milestones)
    UNION ALL
    SELECT symbol, seller_id as broker, -transaction_quantity as qty
    FROM daily_floorsheet
    WHERE symbol IN ({placeholders})
      AND transaction_date > (SELECT date_5d FROM date_milestones)
),
trend_stats AS (
    SELECT fn.symbol, fn.broker, SUM(fn.qty) as net_5d
    FROM floorsheet_net fn
    GROUP BY fn.symbol, fn.broker
),
latest_accumulation AS (
    SELECT DISTINCT ON (symbol, entity_id)
        symbol, entity_id, cumulative_net, cumulative_buy, cumulative_buy_amount
    FROM daily_cumulative_accumulation
    WHERE symbol IN ({placeholders})
    ORDER BY symbol, entity_id, transaction_date DESC
),
wac_data AS (
    SELECT la.symbol, la.entity_id as broker,
           ROUND(la.cumulative_buy_amount / NULLIF(la.cumulative_buy, 0), 2) as wac
    FROM latest_accumulation la
    WHERE la.cumulative_net > 10000
)
SELECT wd.symbol, wd.broker, ts.net_5d, wd.wac, dsp.close as ltp
FROM wac_data wd
INNER JOIN trend_stats ts ON wd.symbol = ts.symbol AND wd.broker = CAST(ts.broker AS VARCHAR)
LEFT JOIN (
    SELECT DISTINCT ON (symbol) symbol, close
    FROM daily_stock_price
    WHERE symbol IN ({placeholders})
    ORDER BY symbol, transaction_date DESC
) dsp ON wd.symbol = dsp.symbol
WHERE dsp.close < wd.wac AND wd.wac > 0 AND ts.net_5d > 0
"""


class AccumulationTrendChecker:
    """Alerts when brokers show a 5-day buying trend on stocks below their WAC."""

    def check(self, user: User) -> list[Alert]:
        tickers = self._user_tickers(user)
        if not tickers:
            return []
        symbols_map = self._run_query(tickers)
        return self._build_alerts(symbols_map)

    def _user_tickers(self, user) -> set[str]:
        p = set(PortfolioItem.objects.filter(user=user).values_list('ticker', flat=True))
        w = set(WatchlistItem.objects.filter(user=user).values_list('ticker', flat=True))
        return p | w

    def _run_query(self, tickers: set) -> dict[str, list]:
        from django.db import connections
        ticker_list = list(tickers)
        placeholders = ', '.join(['%s'] * len(ticker_list))
        query = _TREND_QUERY.replace('{placeholders}', placeholders)
        params = ticker_list * 4  # query has 4 IN clauses
        with connections['default'].cursor() as cursor:
            cursor.execute(query, params)
            cols = [c[0] for c in cursor.description]
            rows = [dict(zip(cols, row)) for row in cursor.fetchall()]
        result: dict[str, list] = {}
        for row in rows:
            result.setdefault(row['symbol'], []).append(row)
        return result

    def _build_alerts(self, symbols_map: dict) -> list[Alert]:
        alerts = []
        n_type = Notification.NotificationType.TREND_BUY_5D
        for symbol, brokers in symbols_map.items():
            top = max(brokers, key=lambda x: x['net_5d'])
            title = f"{symbol} - 5D Buying Trend"
            if len(brokers) == 1:
                message = (f"Broker {top['broker']} is accumulating {symbol} "
                           f"(Below Cost) with an increasing 5-day trend.")
            else:
                message = (f"Broker {top['broker']} and {len(brokers)-1} others are accumulating "
                           f"{symbol} (Below Cost) with an increasing 5-day trend.")
            try:
                net_5d_val = float(top['net_5d'])
            except (TypeError, ValueError):
                net_5d_val = 0.0
            alerts.append(Alert(
                notification_type=n_type,
                title=title,
                message=message,
                ticker=symbol,
                redirect_url=f"/accumulation/below-cost?search={symbol}",
                metadata={
                    'brokers': [b['broker'] for b in brokers],
                    'top_broker': top['broker'] if top else 'Unknown',
                    'net_5d': net_5d_val,
                    'price': float(top['ltp']) if top and top.get('ltp') is not None else None,
                    'symbol': symbol,
                },
                severity=SEVERITY_MAP.get(str(n_type), 'normal'),
            ))
        return alerts
