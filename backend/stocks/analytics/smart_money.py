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

    def find_rallies(self):
        """
        Identify stocks that had a >`rally_threshold` rally within `rally_window` days
        during the `lookback_days` period.
        """
        end_date = DailyStockPrice.objects.order_by('-date').first().date
        start_date = end_date - timedelta(days=self.lookback_days)

        # We need daily prices. To be efficient, we might iterate over tickers
        # that are active. For now, let's just fetch all daily data for the period.
        # tailored to be memory efficient if possible.
        
        # Optimization: Filter for stocks that have at least min volatility
        # But simple approach: Fetch all, pandas it? Or pure SQL?
        # A 10% rally in 5 days is significant.
        
        # Let's use a simplified heuristic:
        # Find stocks where (Max High in Window - Min Low in Window) / Min Low > 10%?
        # No, specifically PRICE RISE.
        
        # Let's grab all prices for the last 90 days.
        prices = DailyStockPrice.objects.filter(
            date__gte=start_date
        ).values('ticker', 'date', 'close').order_by('ticker', 'date')
        
        rallies = []
        
        # Simple Python loop (could be slow for massive data, but okay for ~200 stocks * 90 days = 18k rows)
        from collections import defaultdict
        grouped = defaultdict(list)
        for p in prices:
            grouped[p['ticker']].append(p)
            
        for ticker, data in grouped.items():
            if len(data) < self.rally_window + 1:
                continue
                
            # Sliding window to check for % gain
            for i in range(len(data) - self.rally_window):
                window_start_price = float(data[i]['close'] or 0)
                window_end_price = float(data[i + self.rally_window]['close'] or 0)
                
                if window_start_price > 0:
                    pct_change = (window_end_price - window_start_price) / window_start_price
                    
                    if pct_change >= self.rally_threshold:
                        # Found a rally!
                        # The "Accumulation Zone" is the period BEFORE this rally starts.
                        # Let's say 7-14 days before data[i]['date']
                        rally_date = data[i]['date']
                        rallies.append({
                            'ticker': ticker,
                            'rally_date': rally_date, # Date rally STARTED (approx)
                            'pct_gain': pct_change
                        })
                        
                        # Skip ahead to avoid duplicate signals for same rally
                        # (simple optimization, not strictly necessary but good)
                        # i += self.rally_window 
                        # We can't modify loop var easily in python for loop, but break/continue logic applies
                        break 
                        
        return rallies

    def identify_smart_brokers(self):
        """
        Score brokers based on their buying volume in the 'Accumulation Zone'
        preceding identified rallies.
        """
        rallies = self.find_rallies()
        broker_scores = defaultdict(float) # broker_id -> score
        
        for rally in rallies:
            ticker = rally['ticker']
            rally_date = rally['rally_date']
            
            # Accumulation Zone: 14 days before rally start
            acc_end = rally_date
            acc_start = rally_date - timedelta(days=14)
            
            # Find top buyers in this window
            top_buyers = DailyFloorsheet.objects.filter(
                symbol=ticker,
                transaction_date__gte=acc_start,
                transaction_date__lt=acc_end
            ).values('buyer_id').annotate(
                bought_qty=Sum('transaction_quantity'),
                bought_amount=Sum(F('transaction_quantity') * F('transaction_rate'))
            ).order_by('-bought_amount')[:5] # Top 5 accumulators get credit
            
            # Scoring:
            # Rank 1: 10 pts, Rank 2: 7, Rank 3: 5, Rank 4: 3, Rank 5: 1
            points = [10, 7, 5, 3, 1]
            
            for idx, buyer in enumerate(top_buyers):
                if idx < len(points):
                    broker_id = buyer['buyer_id']
                    # Weighted by the magnitude of the rally? Maybe later.
                    broker_scores[broker_id] += points[idx]
                    
        # Sort brokers by score
        sorted_brokers = sorted(broker_scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_brokers[:20] # Return Top 20 Smart Brokers

    def get_whale_signals(self):
        """
        Get current buying activity of the identified Smart Brokers.
        Returns:
            - Leaderboard (Top Brokers)
            - Signals (What they are buying NOW - last 3 days)
        """
        smart_brokers_list = self.identify_smart_brokers() # [(broker_id, score), ...]
        
        if not smart_brokers_list:
            return {'leaderboard': [], 'signals': []}
            
        top_broker_ids = [b[0] for b in smart_brokers_list[:10]] # Focus on Top 10
        
        # Leaderboard with details
        leaderboard = []
        for b_id, score in smart_brokers_list[:10]:
            leaderboard.append({
                'broker_id': b_id,
                'score': score,
                'rank': 'Elite' if score > 50 else 'Pro'
            })
            
        # Whale Signals (Last 3 Days)
        latest_date = DailyFloorsheet.objects.aggregate(Max('transaction_date'))['transaction_date__max']
        if not latest_date:
            return {'leaderboard': leaderboard, 'signals': []}
            
        signal_start = latest_date - timedelta(days=3)
        
        # For each smart broker, find what they are heavily buying recently
        signals = []
        
        recent_activity = DailyFloorsheet.objects.filter(
            buyer_id__in=top_broker_ids,
            transaction_date__gte=signal_start
        ).values('buyer_id', 'symbol').annotate(
            qty=Sum('transaction_quantity'),
            amount=Sum(F('transaction_quantity') * F('transaction_rate')),
            avg_rate=Sum(F('transaction_quantity') * F('transaction_rate')) / Sum('transaction_quantity')
        ).order_by('buyer_id', '-amount')
        
        # Group by Broker to pick their Top 1 conviction buy
        from itertools import groupby
        
        # We need to sort by buyer_id first for groupby
        recent_activity = sorted(recent_activity, key=lambda x: x['buyer_id'])
        
        for broker_id, group in groupby(recent_activity, key=lambda x: x['buyer_id']):
            # Get top stock for this broker
            txs = list(group)
            txs.sort(key=lambda x: x['amount'], reverse=True)
            top_pick = txs[0]
            
            # Only signal if significant amount (e.g. > 10 Lakhs? dependent on market capp, but let's keep simple)
            # Or just return it.
            
            # Fetch current LTP for comparison
            ltp = 0
            latest_price = DailyStockPrice.objects.filter(ticker=top_pick['symbol']).order_by('-date').first()
            if latest_price:
                ltp = latest_price.close
                
            signals.append({
                'broker_id': broker_id,
                'symbol': top_pick['symbol'],
                'avg_buy_price': round(top_pick['avg_rate'], 2),
                'ltp': ltp,
                'qty': top_pick['qty'],
                'amount': top_pick['amount'],
                'date': latest_date # Just labeling with latest date
            })
            
        return {
            'leaderboard': leaderboard,
            'signals': sorted(signals, key=lambda x: x['amount'], reverse=True)
        }
