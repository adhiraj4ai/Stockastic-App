from __future__ import annotations
from datetime import date
from ..base import Alert, IAlertChecker
from ...notification_service import SEVERITY_MAP
from ....models import Notification, DailyStockPrice
from django.contrib.auth.models import User


class ActiveSignalChecker:
    """Monitors ACTIVE strategy signal episodes; alerts when TP or SL is hit."""

    def check(self, user: User) -> list[Alert]:
        from ....models import SignalEpisode
        today = date.today()
        hits: dict[str, list] = {'WON': [], 'LOST': []}
        self._check_active(hits, today)
        self._collect_closed_today(hits, today)
        return self._build_alerts(hits)

    # ------------------------------------------------------------------ helpers

    def _check_active(self, hits: dict, today: date) -> None:
        from ....models import SignalEpisode
        for sig in SignalEpisode.objects.filter(status='ACTIVE'):
            price = self._fetch_price(sig.symbol)
            if not price:
                continue
            hit_type = self._classify(sig, price)
            if hit_type:
                sig.status = hit_type
                sig.end_date = today
                sig.save()
                hits[hit_type].append(sig)

    def _collect_closed_today(self, hits: dict, today: date) -> None:
        from ....models import SignalEpisode
        for sig in SignalEpisode.objects.filter(end_date=today, status__in=['WON', 'LOST']):
            if sig not in hits[sig.status]:
                hits[sig.status].append(sig)

    def _classify(self, sig, price: float) -> str | None:
        if sig.direction == 'BUY':
            if sig.target_price and price >= float(sig.target_price):
                return 'WON'
            if sig.stop_loss_price and price <= float(sig.stop_loss_price):
                return 'LOST'
        elif sig.direction == 'SELL':
            if sig.target_price and price <= float(sig.target_price):
                return 'WON'
            if sig.stop_loss_price and price >= float(sig.stop_loss_price):
                return 'LOST'
        return None

    def _fetch_price(self, ticker: str) -> float | None:
        row = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').values('close').first()
        return float(row['close']) if row else None

    def _build_alerts(self, hits: dict) -> list[Alert]:
        alerts = []
        for hit_type, signals in hits.items():
            if not signals:
                continue
            n_type = (Notification.NotificationType.TARGET_REACHED
                      if hit_type == 'WON'
                      else Notification.NotificationType.STOP_LOSS_HIT)
            status_text = "Target (TP) Reached" if hit_type == 'WON' else "Stop Loss (SL) Triggered"
            alert = (self._single_alert(n_type, hit_type, status_text, signals[0])
                     if len(signals) == 1
                     else self._aggregate_alert(n_type, hit_type, status_text, signals))
            alerts.append(alert)
        return alerts

    def _single_alert(self, n_type, hit_type: str, status_text: str, sig) -> Alert:
        price = self._fetch_price(sig.symbol)
        level = (float(sig.target_price) if hit_type == 'WON' and sig.target_price
                 else float(sig.stop_loss_price) if hit_type == 'LOST' and sig.stop_loss_price
                 else None)
        level_type = ('target' if hit_type == 'WON' and sig.target_price
                      else 'stop' if hit_type == 'LOST' and sig.stop_loss_price
                      else None)
        return Alert(
            notification_type=n_type,
            title=f"SIGNAL {hit_type}: {sig.symbol}",
            message=f"Strategy Signal for {sig.symbol} ({sig.source}) was closed as {hit_type}. {status_text}.",
            ticker=sig.symbol,
            redirect_url='/recommendations',
            metadata={'signal_id': sig.id, 'hit_type': hit_type, 'source': sig.source,
                      'price': price, 'symbol': sig.symbol, 'level': level, 'level_type': level_type},
            severity=SEVERITY_MAP.get(str(n_type), 'normal'),
        )

    def _aggregate_alert(self, n_type, hit_type: str, status_text: str, signals: list) -> Alert:
        symbols = list({s.symbol for s in signals})
        items_data = [{'symbol': s.symbol, 'detail': f"{hit_type} ({s.source})",
                       'price': self._fetch_price(s.symbol),
                       'target': float(s.target_price) if s.target_price else None,
                       'stop': float(s.stop_loss_price) if s.stop_loss_price else None}
                      for s in signals]
        return Alert(
            notification_type=n_type,
            title=f"{len(signals)} Signals reached {hit_type}",
            message=(f"{len(signals)} Strategy Signals ({', '.join(symbols[:3])}"
                     f"{'...' if len(symbols) > 3 else ''}) reached their objective today as "
                     f"{hit_type} ({status_text})."),
            ticker='SUMMARY',
            redirect_url='/recommendations',
            metadata={'symbols': symbols, 'hit_type': hit_type, 'count': len(signals), 'items': items_data},
            severity=SEVERITY_MAP.get(str(n_type), 'normal'),
        )
