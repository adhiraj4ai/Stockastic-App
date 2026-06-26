from decimal import Decimal
from django.db.models import Avg
from ..models.portfolio import PortfolioItem
from ..models.market import DailyStockPrice, Company
from django.utils import timezone
from datetime import timedelta
import pandas as pd
from stocks.services.risk.market_risk_service import MarketRiskService

_LIQUIDITY_WINDOW_DAYS = 30
_VOLATILITY_WINDOW_DAYS = 60
_SYSTEMIC_BETA_SCALE = 5
_SYSTEMIC_MIN = 1.0
_SYSTEMIC_MAX = 10.0
_DEFAULT_WINDOW = 180
_STOCK_WEIGHT_ALERT_THRESHOLD = 20
_STOCK_WEIGHT_HIGH_THRESHOLD = 35
_SECTOR_WEIGHT_ALERT_THRESHOLD = 30
_SECTOR_WEIGHT_HIGH_THRESHOLD = 50
_DAYS_LIQUIDATE_SENTINEL = 99
_DAYS_LIQUIDATE_MEDIUM = 5
_DAYS_LIQUIDATE_HIGH = 15


class RiskAnalysisService:
    @staticmethod
    def get_risk_analysis(user, account_id=None, window=_DEFAULT_WINDOW):
        """Calculates concentrations, liquidity, market-relative risk, and radar scores."""
        items_qs = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            items_qs = items_qs.filter(account_id=account_id)
        if not items_qs.exists():
            return RiskAnalysisService._empty_response()

        tickers = list(items_qs.values_list('ticker', flat=True).distinct())
        price_map = RiskAnalysisService._fetch_price_map(tickers)
        sector_map = RiskAnalysisService._fetch_sector_map(tickers)
        holdings, total_value, sector_values = RiskAnalysisService._build_holdings(
            items_qs, price_map, sector_map
        )
        if total_value == 0:
            return RiskAnalysisService._empty_response()

        c_score, _, c_alerts = RiskAnalysisService._score_concentration(
            holdings, total_value, sector_values
        )
        l_score, l_alerts = RiskAnalysisService._score_liquidity(holdings, tickers)
        v_score = RiskAnalysisService._score_volatility(holdings, tickers)
        market = MarketRiskService.compute(holdings, window=window)
        systemic = RiskAnalysisService._systemic_score(market["market_risk"]["portfolio_beta"])
        alerts = c_alerts + l_alerts + market["alerts"]
        return RiskAnalysisService._build_response(
            holdings, total_value, c_score, l_score, v_score, systemic, alerts,
            market["market_risk"],
        )

    @staticmethod
    def _systemic_score(portfolio_beta):
        if portfolio_beta is None:
            return 5.0
        scaled = portfolio_beta * _SYSTEMIC_BETA_SCALE
        return float(min(_SYSTEMIC_MAX, max(_SYSTEMIC_MIN, scaled)))

    @staticmethod
    def _fetch_price_map(tickers):
        price_qs = (
            DailyStockPrice.objects
            .filter(ticker__in=tickers)
            .order_by('ticker', '-date')
            .distinct('ticker')
        )
        return {p.ticker: Decimal(str(p.close)) for p in price_qs}

    @staticmethod
    def _fetch_sector_map(tickers):
        companies = Company.objects.filter(symbol__in=tickers)
        return {c.symbol: c.sector or 'Unknown' for c in companies}

    @staticmethod
    def _build_holdings(items_qs, price_map, sector_map):
        holdings = []
        total_value = Decimal('0')
        sector_values = {}
        for item in items_qs:
            price = price_map.get(item.ticker, item.buy_price)
            value = Decimal(item.quantity) * price
            sector = sector_map.get(item.ticker, 'Unknown')
            holdings.append({
                'ticker': item.ticker,
                'quantity': item.quantity,
                'value': value,
                'sector': sector,
            })
            total_value += value
            sector_values[sector] = sector_values.get(sector, Decimal('0')) + value
        return holdings, total_value, sector_values

    @staticmethod
    def _score_concentration(holdings, total_value, sector_values):
        alerts = []
        max_stock_weight = 0
        for h in holdings:
            weight = float((h['value'] / total_value) * 100)
            h['weight'] = round(weight, 2)
            max_stock_weight = max(max_stock_weight, weight)
            if weight > _STOCK_WEIGHT_ALERT_THRESHOLD:
                alerts.append({
                    'type': 'CONCENTRATION',
                    'level': 'HIGH' if weight >= _STOCK_WEIGHT_HIGH_THRESHOLD else 'MEDIUM',
                    'message': f"High concentration in {h['ticker']} ({h['weight']}% of portfolio).",
                })
        for sector, s_val in sector_values.items():
            s_weight = float((s_val / total_value) * 100)
            if s_weight > _SECTOR_WEIGHT_ALERT_THRESHOLD:
                alerts.append({
                    'type': 'SECTOR_RISK',
                    'level': 'HIGH' if s_weight > _SECTOR_WEIGHT_HIGH_THRESHOLD else 'MEDIUM',
                    'message': f"Sector '{sector}' exceeds 30% of portfolio.",
                })
        score = min(10, max(1.0, max_stock_weight / 10))
        return score, max_stock_weight, alerts

    @staticmethod
    def _fetch_adv_map(tickers):
        cutoff = timezone.now().date() - timedelta(days=_LIQUIDITY_WINDOW_DAYS)
        adv_qs = (
            DailyStockPrice.objects
            .filter(ticker__in=tickers, date__gte=cutoff)
            .values('ticker')
            .annotate(adv=Avg('volume'))
        )
        return {row['ticker']: row['adv'] for row in adv_qs}

    @staticmethod
    def _apply_holding_liquidity(h, adv):
        """Mutates h with days_to_liquidate; returns (days, alert_or_None)."""
        if not adv:
            h['days_to_liquidate'] = _DAYS_LIQUIDATE_SENTINEL
            return 0, {
                'type': 'LIQUIDITY', 'level': 'HIGH',
                'message': f"No recent volume data for {h['ticker']}. Liquidity risk high.",
            }
        days = float(h['quantity']) / (float(adv) * 0.1)
        h['days_to_liquidate'] = round(days, 2)
        if days > _DAYS_LIQUIDATE_MEDIUM:
            return days, {
                'type': 'LIQUIDITY',
                'level': 'HIGH' if days > _DAYS_LIQUIDATE_HIGH else 'MEDIUM',
                'message': (
                    f"Liquidity Warning: It might take ~{h['days_to_liquidate']} days "
                    f"to exit {h['ticker']} safely."
                ),
            }
        return days, None

    @staticmethod
    def _score_liquidity(holdings, tickers):
        alerts = []
        max_days = 0
        adv_map = RiskAnalysisService._fetch_adv_map(tickers)
        for h in holdings:
            days, alert = RiskAnalysisService._apply_holding_liquidity(
                h, adv_map.get(h['ticker'], 0)
            )
            max_days = max(max_days, days)
            if alert:
                alerts.append(alert)
        return min(10, max(1.0, max_days)), alerts

    @staticmethod
    def _score_volatility(holdings, tickers):
        try:
            cutoff = timezone.now().date() - timedelta(days=_VOLATILITY_WINDOW_DAYS)
            hist_qs = (
                DailyStockPrice.objects
                .filter(ticker__in=tickers, date__gte=cutoff)
                .values('ticker', 'date', 'close')
                .order_by('date')
            )
            df = pd.DataFrame.from_records(hist_qs)
            if df.empty:
                return 5.0
            df['close'] = df['close'].astype(float)
            return RiskAnalysisService._compute_weighted_volatility(df, holdings)
        except Exception:
            return 5.0

    @staticmethod
    def _compute_weighted_volatility(df, holdings):
        weighted_vol = 0.0
        for h in holdings:
            df_t = df[df['ticker'] == h['ticker']]
            if len(df_t) > 5:
                vol = df_t['close'].pct_change().std() * (252 ** 0.5) * 100
                weighted_vol += vol * float(h.get('weight', 0) / 100)
        return min(10, max(1.0, weighted_vol / 6))

    @staticmethod
    def _build_response(holdings, total_value, c_score, l_score, v_score, systemic_score, alerts, market_risk):
        risk_level = (
            'HIGH' if (c_score > 7 or l_score > 7)
            else 'MEDIUM' if (c_score > 4 or l_score > 4)
            else 'LOW'
        )
        return {
            'radar_data': [
                {'axis': 'Concentration', 'value': round(c_score, 1), 'fullMark': 10},
                {'axis': 'Liquidity', 'value': round(l_score, 1), 'fullMark': 10},
                {'axis': 'Volatility', 'value': round(v_score, 1), 'fullMark': 10},
                {'axis': 'Sector Diversification', 'value': round(max(1, 10 - c_score), 1), 'fullMark': 10},
                {'axis': 'Systemic Risk', 'value': round(systemic_score, 1), 'fullMark': 10},
            ],
            'alerts': alerts,
            'holdings_metrics': holdings,
            'market_risk': market_risk,
            'summary': {
                'total_value': float(total_value),
                'risk_level': risk_level,
            },
        }

    @staticmethod
    def _empty_response():
        return {
            'radar_data': [],
            'alerts': [],
            'holdings_metrics': [],
            'summary': {'total_value': 0, 'risk_level': 'LOW'},
        }
