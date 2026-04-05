"""
Signal Generation Service

Orchestrates generation of all signal types and persists them to GeneratedSignal model.
Called by the `generate_all_signals` management command, which is triggered via pipeline.
"""

import logging
from datetime import date, timedelta
from django.db import connections

logger = logging.getLogger(__name__)


class SignalGenerationService:
    """Generates and stores signals from all sources."""

    @staticmethod
    def generate_all(progress_callback=None):
        """Run all signal generators and persist results."""
        from ..models import GeneratedSignal

        total_saved = 0
        sources = [
            ('SMART_MONEY', SignalGenerationService._generate_smart_money_signals),
            ('BROKER_ACCUMULATION', SignalGenerationService._generate_broker_accumulation_signals),
            ('SMART_CROSSOVER', SignalGenerationService._generate_smart_crossover_signals),
            ('ICHIMOKU', SignalGenerationService._generate_ichimoku_signals),
            ('INSTITUTIONAL_ALERTS', SignalGenerationService._generate_institutional_alerts),
        ]

        for i, (source_key, generator_fn) in enumerate(sources):
            if progress_callback:
                progress_callback(i + 1, len(sources), source_key)
            try:
                signals = generator_fn()
                if source_key == 'INSTITUTIONAL_ALERTS':
                    # Special case: multi-source generator returns list of dicts with 'source' included
                    for sub_source, sub_signals in signals.items():
                        saved = SignalGenerationService._persist_signals(sub_source, sub_signals)
                        total_saved += saved
                        logger.info(f"[{sub_source}] Generated and saved {saved} signals via institutional scanner")
                else:
                    saved = SignalGenerationService._persist_signals(source_key, signals)
                    total_saved += saved
                    logger.info(f"[{source_key}] Generated and saved {saved} signals")
            except Exception as e:
                logger.error(f"[{source_key}] Failed to generate signals: {e}")

        return total_saved

    @staticmethod
    def _persist_signals(source, signals):
        """Persist a list of signal dicts to GeneratedSignal model."""
        from ..models import GeneratedSignal

        if not signals:
            return 0

        today = date.today()
        saved = 0

        for sig in signals:
            try:
                ltp = float(sig.get('ltp', 0))
                
                # Default SL/TP
                tp2 = sig.get('target_price')
                sl = sig.get('stop_loss_price')
                
                # Calculate Detailed Trade Plan
                metadata = sig.get('metadata', {})
                if ltp > 0:
                    if sig['signal'] == 'BUY':
                        tp1 = round(ltp * 1.05, 2)
                        tp2 = round(ltp * 1.10, 2)
                        tp3 = round(ltp * 1.15, 2)
                        wac = metadata.get('top_broker_wac', 0)
                        # SL is institutional cost - 2% if cost is below LTP, else 5% below LTP
                        sl = round(wac * 0.98, 2) if (wac > 0 and wac < ltp) else round(ltp * 0.95, 2)
                        metadata.update({'tp1': tp1, 'tp2': tp2, 'tp3': tp3, 'sl': sl})
                    elif sig['signal'] == 'SELL':
                        tp1 = round(ltp * 0.95, 2)
                        tp2 = round(ltp * 0.90, 2)
                        tp3 = round(ltp * 0.85, 2)
                        sl = round(ltp * 1.05, 2)
                        metadata.update({'tp1': tp1, 'tp2': tp2, 'tp3': tp3, 'sl': sl})

                obj, created = GeneratedSignal.objects.update_or_create(
                    source=source,
                    symbol=sig['symbol'],
                    generated_date=sig.get('generated_date', today),
                    defaults={
                        'signal': sig['signal'],
                        'signal_tier': sig.get('signal_tier', ''),
                        'strength': sig.get('strength', 0),
                        'ltp': ltp,
                        'rationale': sig.get('rationale', ''),
                        'metadata': metadata,
                        'target_price': tp2,
                        'stop_loss_price': sl,
                    }
                )
                
                saved += 1
            except Exception as e:
                logger.error(f"Failed to save signal for {sig.get('symbol')}: {e}")

        return saved

    @staticmethod
    def _generate_smart_money_signals():
        """
        Generate Smart Money signals using the same SQL logic as broker.py signals() action.
        Returns list of dicts with: symbol, signal, signal_tier, strength, ltp, rationale, metadata
        """
        query = """
        WITH accumulation_ref AS (
            SELECT transaction_date as latest_acc_date 
            FROM daily_cumulative_accumulation 
            GROUP BY transaction_date 
            HAVING COUNT(*) > 100 
            ORDER BY transaction_date DESC 
            LIMIT 1
        ),
        ranked_holders AS (
            SELECT 
                symbol, entity_id, cumulative_net,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, accumulation_ref
            WHERE transaction_date = accumulation_ref.latest_acc_date
            AND cumulative_net > 0 
        ),
        smart_money AS (
            SELECT symbol, entity_id as broker 
            FROM ranked_holders 
            WHERE rank <= 15
        ),
        broker_delta AS (
            SELECT 
                ca.symbol, ca.entity_id as broker,
                ca.cumulative_net as current_net,
                (ca.cumulative_net - LAG(ca.cumulative_net, 5) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date)) as net_5d,
                (ca.cumulative_net - LAG(ca.cumulative_net, 20) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date)) as net_20d,
                ROUND(ca.cumulative_buy_amount / NULLIF(ca.cumulative_buy, 0), 2) as wac,
                ca.transaction_date
            FROM daily_cumulative_accumulation ca
        ),
        latest_broker_delta AS (
            SELECT bd.* FROM broker_delta bd, accumulation_ref
            WHERE bd.transaction_date = accumulation_ref.latest_acc_date
        ),
        symbol_clustering AS (
            SELECT 
                bd.symbol,
                COUNT(DISTINCT bd.broker) FILTER (WHERE sm.broker IS NOT NULL AND bd.net_5d > 0) as cluster_count,
                SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_5d ELSE 0 END) as inst_net_5d,
                SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_20d ELSE 0 END) as inst_net_20d,
                MAX(bd.wac) as top_broker_wac
            FROM latest_broker_delta bd
            LEFT JOIN smart_money sm ON bd.symbol = sm.symbol AND bd.broker = sm.broker
            GROUP BY bd.symbol
        ),
        price_ref AS (
            SELECT 
                symbol, close, 
                LAG(close, 5) OVER (PARTITION BY symbol ORDER BY transaction_date) as close_5d,
                transaction_date,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
            FROM daily_stock_price
        ),
        latest_price AS (
            SELECT * FROM price_ref WHERE rn = 1
        )
        SELECT 
            sc.symbol, c."companyName" as name, c."sectorName" as sector,
            sc.cluster_count, sc.inst_net_5d, sc.inst_net_20d, sc.top_broker_wac,
            lp.close as ltp, lp.close_5d
        FROM symbol_clustering sc
        INNER JOIN companies c ON sc.symbol = c.symbol
        INNER JOIN latest_price lp ON sc.symbol = lp.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND (sc.cluster_count >= 1 OR sc.inst_net_5d > 50000)
        ORDER BY sc.cluster_count DESC, sc.inst_net_5d DESC;
        """

        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                raw_results = [dict(zip(columns, row)) for row in cursor.fetchall()]

            today = date.today()

            for row in raw_results:
                ltp = float(row['ltp'] or 0)
                wac = float(row['top_broker_wac'] or 0)
                net_5d = float(row['inst_net_5d'] or 0)
                clusters = row['cluster_count']
                price_5d = float(row['close_5d'] or ltp)

                price_change = ((ltp - price_5d) / price_5d) * 100 if price_5d > 0 else 0
                markup = ((ltp - wac) / wac) * 100 if wac > 0 else 0

                signal_type = None
                signal_tier = ''
                rationale = ""
                strength = 0

                # Platinum (Optimal Entry)
                if clusters >= 2 and -5 <= markup <= 5:
                    signal_type = "BUY"
                    signal_tier = "Platinum Buy"
                    rationale = f"Institutional Clustering ({clusters} brokers) near average cost (WAC)."
                    strength = 95

                # Gold (Strong Momentum or Heavy Cluster)
                elif clusters >= 4 or (net_5d > 200000 and price_change > 2):
                    signal_type = "BUY"
                    signal_tier = "Gold Signal"
                    if clusters >= 4:
                        rationale = f"High Institutional Clustering ({clusters} brokers) identified."
                    else:
                        rationale = f"Aggressive institutional accumulation with price momentum."
                    strength = 80

                # Silver (Early Entry)
                elif clusters >= 2:
                    signal_type = "BUY"
                    signal_tier = "Silver Signal"
                    rationale = f"Early institutional interest detected from {clusters} smart-money brokers."
                    strength = 60

                # Divergence (Contrarian)
                elif price_change < -3 and net_5d > 100000:
                    signal_type = "BUY"
                    signal_tier = "Bullish Divergence"
                    rationale = "Institutional accumulation increasing despite price correction."
                    strength = 75

                if signal_type:
                    signals.append({
                        'symbol': row['symbol'],
                        'signal': signal_type,
                        'signal_tier': signal_tier,
                        'strength': strength,
                        'ltp': ltp,
                        'rationale': rationale,
                        'generated_date': today,
                        'metadata': {
                            'name': row.get('name', ''),
                            'sector': row.get('sector', ''),
                            'cluster_count': clusters,
                            'inst_net_5d': net_5d,
                            'top_broker_wac': wac,
                            'markup_percent': round(markup, 2),
                            'price_change_5d': round(price_change, 2),
                        }
                    })
        except Exception as e:
            logger.error(f"Smart Money signal generation error: {e}")

        return signals

    @staticmethod
    def _generate_broker_accumulation_signals():
        """Generate signals from BrokerAccumulationRecommendationEngine."""
        from ..views.recommendations import BrokerAccumulationRecommendationEngine

        signals = []
        try:
            engine = BrokerAccumulationRecommendationEngine()
            recommendations = engine.execute()
            today = date.today()

            for rec in recommendations:
                signals.append({
                    'symbol': rec['symbol'],
                    'signal': rec['signal'],
                    'signal_tier': rec.get('trend_direction', ''),
                    'strength': rec.get('strength', 0),
                    'ltp': rec.get('close', 0),
                    'rationale': rec.get('reason', ''),
                    'generated_date': today,
                    'metadata': {
                        'rsi': rec.get('rsi'),
                        'macd': rec.get('macd'),
                        'trend_direction': rec.get('trend_direction', ''),
                    }
                })
        except Exception as e:
            logger.error(f"Broker Accumulation signal generation error: {e}")

        return signals

    @staticmethod
    def _generate_smart_crossover_signals():
        """Generate signals from SmartAccumulatedCrossoverRecommendationEngine."""
        from ..views.recommendations import SmartAccumulatedCrossoverRecommendationEngine

        signals = []
        try:
            engine = SmartAccumulatedCrossoverRecommendationEngine()
            recommendations = engine.execute()
            today = date.today()

            for rec in recommendations:
                signals.append({
                    'symbol': rec['symbol'],
                    'signal': rec['signal'],
                    'signal_tier': 'Smart Crossover',
                    'strength': rec.get('strength', 0),
                    'ltp': rec.get('close', 0),
                    'rationale': rec.get('reason', ''),
                    'generated_date': today,
                    'metadata': {
                        'rsi': rec.get('rsi'),
                        'macd_hist': rec.get('macd_hist'),
                        'crossover_date': rec.get('crossover_date', ''),
                        'crossover_price': rec.get('crossover_price', 0),
                    }
                })
        except Exception as e:
            logger.error(f"Smart Crossover signal generation error: {e}")

        return signals

    @staticmethod
    def _generate_ichimoku_signals():
        """Generate signals from IchimokuAccumulationRecommendationEngine."""
        from ..views.recommendations import IchimokuAccumulationRecommendationEngine

        signals = []
        try:
            engine = IchimokuAccumulationRecommendationEngine()
            recommendations = engine.execute()
            today = date.today()

            for rec in recommendations:
                signals.append({
                    'symbol': rec['symbol'],
                    'signal': rec['signal'],
                    'signal_tier': rec.get('cloud_status', 'Ichimoku'),
                    'strength': rec.get('strength', 0),
                    'ltp': rec.get('close', 0),
                    'rationale': rec.get('reason', ''),
                    'generated_date': today,
                    'metadata': {
                        'rsi': rec.get('rsi'),
                        'macd_hist': rec.get('macd_hist'),
                        'cloud_status': rec.get('cloud_status', ''),
                    }
                })
        except Exception as e:
            logger.error(f"Ichimoku signal generation error: {e}")

        return signals

    @staticmethod
    def _generate_institutional_alerts():
        """
        Consolidated scanner for 10 institutional signal types (Price Action, Mean Reversal, Divg, Dow).
        Returns a dictionary mapping source keys to lists of signal dicts.
        """
        from ..models import Company
        from ..analytics.signal_scanner import MarketSignalScanner
        
        # Mapping for result keys to model sources
        SOURCE_MAP = {
            "pa_buy": "PRICE_ACTION", "pa_sell": "PRICE_ACTION",
            "mr_buy": "MEAN_REVERSAL", "mr_sell": "MEAN_REVERSAL",
            "rsi_bull_div": "RSI_DIVERGENCE", "rsi_bear_div": "RSI_DIVERGENCE",
            "macd_bull_div": "MACD_DIVERGENCE", "macd_bear_div": "MACD_DIVERGENCE",
            "dow_buy": "DOW_SIGNAL", "dow_sell": "DOW_SIGNAL"
        }
        
        # Final grouped results
        grouped_results = {src: [] for src in set(SOURCE_MAP.values())}
        
        try:
            # Fetch symbols to scan
            tickers = list(Company.objects.values_list('symbol', flat=True))
            if not tickers:
                tickers = list(Company.all_objects.values_list('symbol', flat=True))
            
            # Use the optimized MarketSignalScanner logic (reusing existing utility)
            # We limit to top 250 for pipeline performance; could be increased.
            scanner = MarketSignalScanner(tickers[:250])
            all_scan_results = scanner.scan_all()
            
            today = date.today()
            
            for key, symbols in all_scan_results.items():
                source = SOURCE_MAP.get(key)
                if not source: continue
                
                signal_type = "BUY" if "buy" in key or "bull" in key or "long" in key else "SELL"
                
                for symbol in symbols:
                    grouped_results[source].append({
                        'symbol': symbol,
                        'signal': signal_type,
                        'signal_tier': key.replace('_', ' ').title(),
                        'strength': 75, # Default strength for alerts
                        'rationale': f"Institutional {key.replace('_', ' ')} detected via automated scanner.",
                        'generated_date': today,
                        'metadata': {'scan_key': key}
                    })
                    
        except Exception as e:
            logger.error(f"Institutional alerts generation error: {e}")
            
        return grouped_results
