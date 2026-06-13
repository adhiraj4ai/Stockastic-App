import logging
from datetime import timedelta, date
from django.db.models import Sum, F, Max, Min
from django.db.models.functions import TruncDate
from ..models import DailyStockPrice, DailyFloorsheet

logger = logging.getLogger(__name__)

class SmartMoneyAnalyzer:
    """
    Identifies 'Smart Money' brokers who consistently accumulate stocks
    before significant price rallies.
    """

    def __init__(self, lookback_days=180, rally_threshold=0.08, rally_window=10):
        """
        Initialize the analyzer with configurable parameters.
        :param lookback_days: Days to look back for historical rallies (default 6 months to catch more cycles)
        :param rally_threshold: Minimum percentage gain to classify as a 'rally' (default 8%)
        :param rally_window: Number of days within which the rally must occur (default 10 days)
        """
        self.lookback_days = lookback_days
        self.rally_threshold = rally_threshold
        self.rally_window = rally_window

    def _group_prices_by_ticker(self, start_date):
        """Fetch prices since start_date and group them by ticker."""
        from collections import defaultdict
        prices = DailyStockPrice.objects.filter(
            date__gte=start_date
        ).values('ticker', 'date', 'close').order_by('ticker', 'date')
        grouped = defaultdict(list)
        for p in prices:
            grouped[p['ticker']].append(p)
        return grouped

    def _first_rally_for_ticker(self, data):
        """Return the first rally dict for a ticker's price data, or None."""
        for i in range(len(data) - self.rally_window):
            window_start = float(data[i]['close'] or 0)
            window_end = float(data[i + self.rally_window]['close'] or 0)
            if window_start <= 0:
                continue
            pct_change = (window_end - window_start) / window_start
            if pct_change >= self.rally_threshold:
                return {'ticker': data[i]['ticker'], 'rally_date': data[i]['date'], 'pct_gain': pct_change}
        return None

    def find_rallies(self):
        """Identify stocks with a >`rally_threshold` rally within `rally_window` days
        during the `lookback_days` period."""
        end_date = DailyStockPrice.objects.order_by('-date').first().date
        start_date = end_date - timedelta(days=self.lookback_days)
        grouped = self._group_prices_by_ticker(start_date)
        rallies = []
        for ticker, data in grouped.items():
            if len(data) < self.rally_window + 1:
                continue
            rally = self._first_rally_for_ticker(data)
            if rally:
                rallies.append(rally)
        return rallies

    _ACCUMULATION_DAYS = 14
    _RANK_POINTS = [10, 7, 5, 3, 1]

    def _score_brokers_for_rally(self, broker_scores, ticker, rally_date):
        """Credit top 5 accumulating brokers ahead of a rally with ranked points."""
        acc_start = rally_date - timedelta(days=self._ACCUMULATION_DAYS)
        top_buyers = DailyFloorsheet.objects.filter(
            symbol=ticker,
            transaction_date__gte=acc_start,
            transaction_date__lt=rally_date,
        ).values('buyer_id').annotate(
            bought_amount=Sum(F('transaction_quantity') * F('transaction_rate'))
        ).order_by('-bought_amount')[:5]
        for idx, buyer in enumerate(top_buyers):
            if idx < len(self._RANK_POINTS):
                broker_scores[buyer['buyer_id']] += self._RANK_POINTS[idx]

    def identify_smart_brokers(self):
        """Score brokers by buying volume in the accumulation zone preceding rallies."""
        rallies = self.find_rallies()
        broker_scores = defaultdict(float)
        for rally in rallies:
            self._score_brokers_for_rally(broker_scores, rally['ticker'], rally['rally_date'])
        sorted_brokers = sorted(broker_scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_brokers[:20]

    @staticmethod
    def _build_leaderboard(smart_brokers_list):
        """Build a ranked leaderboard dict from the top-10 smart broker tuples."""
        return [
            {'broker_id': b_id, 'score': score, 'rank': 'Elite' if score > 50 else 'Pro'}
            for b_id, score in smart_brokers_list[:10]
        ]

    @staticmethod
    def _fetch_recent_activity(top_broker_ids, signal_start):
        """Return recent buy activity rows grouped by broker and symbol."""
        from itertools import groupby
        rows = DailyFloorsheet.objects.filter(
            buyer_id__in=top_broker_ids,
            transaction_date__gte=signal_start,
        ).values('buyer_id', 'symbol').annotate(
            qty=Sum('transaction_quantity'),
            amount=Sum(F('transaction_quantity') * F('transaction_rate')),
            avg_rate=Sum(F('transaction_quantity') * F('transaction_rate')) / Sum('transaction_quantity'),
        ).order_by('buyer_id', '-amount')
        return sorted(rows, key=lambda x: x['buyer_id'])

    @staticmethod
    def _top_pick_signal(broker_id, group_rows, latest_date):
        """Return the highest-amount buy signal row for a single broker."""
        txs = sorted(group_rows, key=lambda x: x['amount'], reverse=True)
        top = txs[0]
        latest_price = DailyStockPrice.objects.filter(ticker=top['symbol']).order_by('-date').first()
        return {
            'broker_id': broker_id, 'symbol': top['symbol'],
            'avg_buy_price': round(top['avg_rate'], 2),
            'ltp': latest_price.close if latest_price else 0,
            'qty': top['qty'], 'amount': top['amount'], 'date': latest_date,
        }

    def get_whale_signals(self):
        """Return the Smart Broker leaderboard and their top conviction buys (last 3 days)."""
        from itertools import groupby
        smart_brokers_list = self.identify_smart_brokers()
        if not smart_brokers_list:
            return {'leaderboard': [], 'signals': []}

        leaderboard = self._build_leaderboard(smart_brokers_list)
        latest_date = DailyFloorsheet.objects.aggregate(Max('transaction_date'))['transaction_date__max']
        if not latest_date:
            return {'leaderboard': leaderboard, 'signals': []}

        top_broker_ids = [b[0] for b in smart_brokers_list[:10]]
        recent = self._fetch_recent_activity(top_broker_ids, latest_date - timedelta(days=3))
        signals = [
            self._top_pick_signal(broker_id, list(grp), latest_date)
            for broker_id, grp in groupby(recent, key=lambda x: x['buyer_id'])
        ]
        return {'leaderboard': leaderboard, 'signals': sorted(signals, key=lambda x: x['amount'], reverse=True)}
