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
            ('DISTRIBUTION_ALERT', SignalGenerationService._generate_distribution_alert_signals),
            ('BELOW_COST_REVERSAL', SignalGenerationService._generate_below_cost_reversal_signals),
            ('VOLUME_BREAKOUT', SignalGenerationService._generate_volume_breakout_signals),
            ('CONCENTRATION_SHIFT', SignalGenerationService._generate_concentration_shift_signals),
            ('ACC_MOMENTUM', SignalGenerationService._generate_accumulation_momentum_signals),
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

    # ─── NEW ACCUMULATION-BASED STRATEGIES ──────────────────────────────────

    @staticmethod
    def _generate_distribution_alert_signals():
        """
        SELL signals when top holders are aggressively offloading.
        Detects institutional profit-taking: price near/above WAC + negative net accumulation.
        """
        query = """
        WITH accumulation_ref AS (
            SELECT transaction_date as latest_acc_date
            FROM daily_cumulative_accumulation
            GROUP BY transaction_date HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC LIMIT 1
        ),
        ranked_holders AS (
            SELECT symbol, entity_id, cumulative_net,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, accumulation_ref
            WHERE transaction_date = accumulation_ref.latest_acc_date AND cumulative_net > 0
        ),
        smart_money AS (
            SELECT symbol, entity_id as broker FROM ranked_holders WHERE rank <= 15
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
        symbol_distribution AS (
            SELECT
                bd.symbol,
                COUNT(DISTINCT bd.broker) FILTER (WHERE sm.broker IS NOT NULL AND bd.net_5d < 0) as dist_count,
                SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_5d ELSE 0 END) as inst_net_5d,
                SUM(CASE WHEN sm.broker IS NOT NULL THEN bd.net_20d ELSE 0 END) as inst_net_20d,
                MAX(bd.wac) as top_broker_wac
            FROM latest_broker_delta bd
            LEFT JOIN smart_money sm ON bd.symbol = sm.symbol AND bd.broker = sm.broker
            GROUP BY bd.symbol
        ),
        latest_price AS (
            SELECT DISTINCT ON (symbol) symbol, close,
                   LAG(close, 5) OVER (PARTITION BY symbol ORDER BY transaction_date) as close_5d
            FROM daily_stock_price
            ORDER BY symbol, transaction_date DESC
        )
        SELECT
            sd.symbol, c."companyName" as name, c."sectorName" as sector,
            sd.dist_count, sd.inst_net_5d, sd.inst_net_20d, sd.top_broker_wac,
            lp.close as ltp, lp.close_5d
        FROM symbol_distribution sd
        INNER JOIN companies c ON sd.symbol = c.symbol
        INNER JOIN latest_price lp ON sd.symbol = lp.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND c.status = 'A'
        AND sd.dist_count >= 2
        AND sd.inst_net_5d < -50000
        ORDER BY sd.inst_net_5d ASC;
        """

        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                raw = [dict(zip(columns, row)) for row in cursor.fetchall()]

            today = date.today()
            for row in raw:
                ltp = float(row['ltp'] or 0)
                wac = float(row['top_broker_wac'] or 0)
                net_5d = float(row['inst_net_5d'] or 0)
                dist_count = row['dist_count']
                price_5d = float(row['close_5d'] or ltp)
                price_change = ((ltp - price_5d) / price_5d) * 100 if price_5d > 0 else 0
                markup = ((ltp - wac) / wac) * 100 if wac > 0 else 0

                if ltp <= 0:
                    continue

                # Heavy distribution with price above cost → profit-taking
                if dist_count >= 3 and markup >= 0:
                    tier = 'Heavy Distribution'
                    strength = 90
                    rationale = f"{dist_count} institutional brokers offloading above their cost basis. Profit-taking detected."
                elif dist_count >= 2 and net_5d < -100000:
                    tier = 'Accelerating Sell-off'
                    strength = 80
                    rationale = f"Aggressive institutional selling ({dist_count} brokers, {abs(int(net_5d)):,} shares net sold in 5D)."
                else:
                    tier = 'Distribution Warning'
                    strength = 65
                    rationale = f"Institutional distribution pattern: {dist_count} smart-money brokers reducing positions."

                signals.append({
                    'symbol': row['symbol'],
                    'signal': 'SELL',
                    'signal_tier': tier,
                    'strength': strength,
                    'ltp': ltp,
                    'rationale': rationale,
                    'generated_date': today,
                    'metadata': {
                        'name': row.get('name', ''),
                        'sector': row.get('sector', ''),
                        'dist_count': dist_count,
                        'inst_net_5d': net_5d,
                        'top_broker_wac': wac,
                        'markup_percent': round(markup, 2),
                        'price_change_5d': round(price_change, 2),
                    }
                })
        except Exception as e:
            logger.error(f"Distribution Alert signal generation error: {e}")
        return signals

    @staticmethod
    def _generate_below_cost_reversal_signals():
        """
        BUY signals when price is below institutional WAC but brokers are still accumulating.
        Institutions averaging down = high conviction in the stock.
        """
        query = """
        WITH accumulation_ref AS (
            SELECT transaction_date as latest_acc_date
            FROM daily_cumulative_accumulation
            GROUP BY transaction_date HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC LIMIT 1
        ),
        ranked_holders AS (
            SELECT symbol, entity_id, cumulative_net,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, accumulation_ref
            WHERE transaction_date = accumulation_ref.latest_acc_date AND cumulative_net > 0
        ),
        smart_money AS (
            SELECT symbol, entity_id as broker FROM ranked_holders WHERE rank <= 15
        ),
        broker_positions AS (
            SELECT
                ca.symbol, ca.entity_id as broker,
                ca.cumulative_net,
                ROUND(ca.cumulative_buy_amount / NULLIF(ca.cumulative_buy, 0), 2) as wac,
                (ca.cumulative_net - LAG(ca.cumulative_net, 5) OVER (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date)) as net_5d,
                ca.transaction_date
            FROM daily_cumulative_accumulation ca
        ),
        latest_positions AS (
            SELECT bp.* FROM broker_positions bp, accumulation_ref
            WHERE bp.transaction_date = accumulation_ref.latest_acc_date
        ),
        below_cost_accumulators AS (
            SELECT
                lp.symbol,
                COUNT(DISTINCT lp.broker) FILTER (WHERE sm.broker IS NOT NULL AND lp.net_5d > 0) as accum_count,
                SUM(CASE WHEN sm.broker IS NOT NULL AND lp.net_5d > 0 THEN lp.net_5d ELSE 0 END) as accum_net_5d,
                AVG(lp.wac) FILTER (WHERE sm.broker IS NOT NULL AND lp.wac > 0) as avg_wac,
                SUM(lp.cumulative_net) FILTER (WHERE sm.broker IS NOT NULL) as total_inst_holding
            FROM latest_positions lp
            LEFT JOIN smart_money sm ON lp.symbol = sm.symbol AND lp.broker = sm.broker
            WHERE lp.cumulative_net > 10000
            GROUP BY lp.symbol
        ),
        latest_price AS (
            SELECT DISTINCT ON (symbol) symbol, close
            FROM daily_stock_price ORDER BY symbol, transaction_date DESC
        )
        SELECT
            bca.symbol, c."companyName" as name, c."sectorName" as sector,
            bca.accum_count, bca.accum_net_5d, bca.avg_wac, bca.total_inst_holding,
            lp.close as ltp
        FROM below_cost_accumulators bca
        INNER JOIN companies c ON bca.symbol = c.symbol
        INNER JOIN latest_price lp ON bca.symbol = lp.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND c.status = 'A'
        AND bca.avg_wac > 0
        AND lp.close < bca.avg_wac
        AND bca.accum_count >= 1
        AND bca.accum_net_5d > 10000
        ORDER BY bca.accum_count DESC, bca.accum_net_5d DESC;
        """

        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                raw = [dict(zip(columns, row)) for row in cursor.fetchall()]

            today = date.today()
            for row in raw:
                ltp = float(row['ltp'] or 0)
                wac = float(row['avg_wac'] or 0)
                accum_count = row['accum_count']
                net_5d = float(row['accum_net_5d'] or 0)
                discount = ((wac - ltp) / wac) * 100 if wac > 0 else 0

                if ltp <= 0:
                    continue

                if accum_count >= 3 and discount >= 5:
                    tier = 'Deep Value Accumulation'
                    strength = 92
                    rationale = f"{accum_count} institutional brokers averaging down at {discount:.1f}% below cost. Strong conviction."
                elif accum_count >= 2:
                    tier = 'Institutional Averaging'
                    strength = 78
                    rationale = f"{accum_count} smart-money brokers buying below WAC. Institutions see value at current levels."
                else:
                    tier = 'Below-Cost Buying'
                    strength = 65
                    rationale = f"Institutional accumulation continues despite price being {discount:.1f}% below avg cost."

                signals.append({
                    'symbol': row['symbol'],
                    'signal': 'BUY',
                    'signal_tier': tier,
                    'strength': strength,
                    'ltp': ltp,
                    'rationale': rationale,
                    'generated_date': today,
                    'metadata': {
                        'name': row.get('name', ''),
                        'sector': row.get('sector', ''),
                        'accum_count': accum_count,
                        'accum_net_5d': net_5d,
                        'avg_wac': wac,
                        'discount_pct': round(discount, 2),
                        'total_inst_holding': float(row.get('total_inst_holding', 0)),
                        'top_broker_wac': wac,
                    }
                })
        except Exception as e:
            logger.error(f"Below Cost Reversal signal generation error: {e}")
        return signals

    @staticmethod
    def _generate_volume_breakout_signals():
        """
        BUY/SELL when institutional volume exceeds 2x its 20-day average
        AND the accumulation direction aligns with price movement.
        """
        query = """
        WITH accumulation_ref AS (
            SELECT transaction_date as latest_acc_date
            FROM daily_cumulative_accumulation
            GROUP BY transaction_date HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC LIMIT 1
        ),
        floorsheet_ref AS (
            SELECT transaction_date as latest_fs_date
            FROM daily_floorsheet
            GROUP BY transaction_date HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC LIMIT 1
        ),
        ranked_holders AS (
            SELECT symbol, entity_id,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, accumulation_ref
            WHERE transaction_date = accumulation_ref.latest_acc_date AND cumulative_net > 0
        ),
        smart_money AS (
            SELECT symbol, entity_id as broker FROM ranked_holders WHERE rank <= 15
        ),
        -- Today's institutional volume from floorsheet
        today_inst_vol AS (
            SELECT
                df.symbol,
                SUM(CASE WHEN sm_b.broker IS NOT NULL THEN df.transaction_quantity ELSE 0 END) as inst_buy_vol,
                SUM(CASE WHEN sm_s.broker IS NOT NULL THEN df.transaction_quantity ELSE 0 END) as inst_sell_vol,
                SUM(df.transaction_quantity) as total_vol
            FROM daily_floorsheet df, floorsheet_ref
            LEFT JOIN smart_money sm_b ON df.symbol = sm_b.symbol AND df.buyer_id::text = sm_b.broker
            LEFT JOIN smart_money sm_s ON df.symbol = sm_s.symbol AND df.seller_id::text = sm_s.broker
            WHERE df.transaction_date = floorsheet_ref.latest_fs_date
            GROUP BY df.symbol
        ),
        -- 20-day average total volume
        avg_vol AS (
            SELECT symbol, AVG(volume) as avg_vol_20d
            FROM (
                SELECT symbol, volume,
                       ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY transaction_date DESC) as rn
                FROM daily_stock_price
            ) sub WHERE rn <= 20
            GROUP BY symbol
        ),
        latest_price AS (
            SELECT DISTINCT ON (symbol) symbol, close,
                   LAG(close, 1) OVER (PARTITION BY symbol ORDER BY transaction_date) as prev_close
            FROM daily_stock_price ORDER BY symbol, transaction_date DESC
        )
        SELECT
            tiv.symbol, c."companyName" as name, c."sectorName" as sector,
            tiv.inst_buy_vol, tiv.inst_sell_vol, tiv.total_vol,
            av.avg_vol_20d,
            lp.close as ltp, lp.prev_close,
            ROUND(tiv.total_vol / NULLIF(av.avg_vol_20d, 0), 2) as vol_ratio
        FROM today_inst_vol tiv
        INNER JOIN companies c ON tiv.symbol = c.symbol
        INNER JOIN avg_vol av ON tiv.symbol = av.symbol
        INNER JOIN latest_price lp ON tiv.symbol = lp.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND c.status = 'A'
        AND av.avg_vol_20d > 0
        AND tiv.total_vol > av.avg_vol_20d * 2
        ORDER BY vol_ratio DESC;
        """

        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                raw = [dict(zip(columns, row)) for row in cursor.fetchall()]

            today = date.today()
            for row in raw:
                ltp = float(row['ltp'] or 0)
                prev_close = float(row['prev_close'] or ltp)
                inst_buy = float(row['inst_buy_vol'] or 0)
                inst_sell = float(row['inst_sell_vol'] or 0)
                vol_ratio = float(row['vol_ratio'] or 0)
                price_change = ((ltp - prev_close) / prev_close) * 100 if prev_close > 0 else 0
                inst_net = inst_buy - inst_sell

                if ltp <= 0:
                    continue

                # Determine direction: institutional net aligns with price move
                if inst_net > 0 and price_change > 0:
                    signal_type = 'BUY'
                    tier = 'Volume Breakout' if vol_ratio >= 3 else 'Volume Surge'
                    strength = min(95, 70 + int(vol_ratio * 5))
                    rationale = f"Volume {vol_ratio:.1f}x above 20D avg with institutional net buying and {price_change:+.1f}% price move."
                elif inst_net < 0 and price_change < 0:
                    signal_type = 'SELL'
                    tier = 'Volume Breakdown' if vol_ratio >= 3 else 'Volume Sell-off'
                    strength = min(90, 65 + int(vol_ratio * 5))
                    rationale = f"Volume {vol_ratio:.1f}x above 20D avg with institutional net selling and {price_change:.1f}% price drop."
                else:
                    continue  # Volume spike without directional alignment — skip

                signals.append({
                    'symbol': row['symbol'],
                    'signal': signal_type,
                    'signal_tier': tier,
                    'strength': strength,
                    'ltp': ltp,
                    'rationale': rationale,
                    'generated_date': today,
                    'metadata': {
                        'name': row.get('name', ''),
                        'sector': row.get('sector', ''),
                        'vol_ratio': vol_ratio,
                        'inst_buy_vol': inst_buy,
                        'inst_sell_vol': inst_sell,
                        'inst_net': inst_net,
                        'price_change_1d': round(price_change, 2),
                    }
                })
        except Exception as e:
            logger.error(f"Volume Breakout signal generation error: {e}")
        return signals

    @staticmethod
    def _generate_concentration_shift_signals():
        """
        BUY/SELL when the number of smart-money brokers holding a stock changes significantly.
        New brokers entering (broadening) = bullish. Brokers exiting (narrowing) = bearish.
        """
        query = """
        WITH accumulation_ref AS (
            SELECT transaction_date as latest_acc_date
            FROM daily_cumulative_accumulation
            GROUP BY transaction_date HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC LIMIT 1
        ),
        -- Current top holders
        current_holders AS (
            SELECT symbol, entity_id, cumulative_net,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, accumulation_ref
            WHERE transaction_date = accumulation_ref.latest_acc_date AND cumulative_net > 0
        ),
        -- Holders 10 trading days ago
        past_ref AS (
            SELECT transaction_date as past_date
            FROM daily_cumulative_accumulation
            GROUP BY transaction_date HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC LIMIT 1 OFFSET 10
        ),
        past_holders AS (
            SELECT symbol, entity_id, cumulative_net,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, past_ref
            WHERE transaction_date = past_ref.past_date AND cumulative_net > 0
        ),
        -- Count top-15 holders now vs 10d ago
        holder_counts AS (
            SELECT
                c.symbol,
                COUNT(DISTINCT ch.entity_id) FILTER (WHERE ch.rank <= 15) as current_count,
                COUNT(DISTINCT ph.entity_id) FILTER (WHERE ph.rank <= 15) as past_count
            FROM (SELECT DISTINCT symbol FROM current_holders WHERE rank <= 15) c
            LEFT JOIN current_holders ch ON c.symbol = ch.symbol AND ch.rank <= 15
            LEFT JOIN past_holders ph ON c.symbol = ph.symbol AND ph.rank <= 15
            GROUP BY c.symbol
        ),
        latest_price AS (
            SELECT DISTINCT ON (symbol) symbol, close
            FROM daily_stock_price ORDER BY symbol, transaction_date DESC
        )
        SELECT
            hc.symbol, co."companyName" as name, co."sectorName" as sector,
            hc.current_count, hc.past_count,
            (hc.current_count - hc.past_count) as shift,
            lp.close as ltp
        FROM holder_counts hc
        INNER JOIN companies co ON hc.symbol = co.symbol
        INNER JOIN latest_price lp ON hc.symbol = lp.symbol
        WHERE co."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND co.status = 'A'
        AND ABS(hc.current_count - hc.past_count) >= 2
        ORDER BY ABS(hc.current_count - hc.past_count) DESC;
        """

        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                raw = [dict(zip(columns, row)) for row in cursor.fetchall()]

            today = date.today()
            for row in raw:
                ltp = float(row['ltp'] or 0)
                shift = row['shift']
                current = row['current_count']
                past = row['past_count']

                if ltp <= 0:
                    continue

                if shift >= 3:
                    signal_type = 'BUY'
                    tier = 'Broadening Interest'
                    strength = 85
                    rationale = f"{shift} new institutional brokers entered top-15 holders in 10 days ({past}→{current}). Widening smart-money base."
                elif shift >= 2:
                    signal_type = 'BUY'
                    tier = 'New Entrants'
                    strength = 70
                    rationale = f"{shift} new smart-money brokers building positions. Holder count: {past}→{current}."
                elif shift <= -3:
                    signal_type = 'SELL'
                    tier = 'Narrowing Interest'
                    strength = 80
                    rationale = f"{abs(shift)} institutional brokers exited top-15 in 10 days ({past}→{current}). Smart money retreating."
                elif shift <= -2:
                    signal_type = 'SELL'
                    tier = 'Holder Exit'
                    strength = 68
                    rationale = f"{abs(shift)} smart-money brokers reduced to below top-15. Holder count: {past}→{current}."
                else:
                    continue

                signals.append({
                    'symbol': row['symbol'],
                    'signal': signal_type,
                    'signal_tier': tier,
                    'strength': strength,
                    'ltp': ltp,
                    'rationale': rationale,
                    'generated_date': today,
                    'metadata': {
                        'name': row.get('name', ''),
                        'sector': row.get('sector', ''),
                        'current_holder_count': current,
                        'past_holder_count': past,
                        'shift': shift,
                    }
                })
        except Exception as e:
            logger.error(f"Concentration Shift signal generation error: {e}")
        return signals

    @staticmethod
    def _generate_accumulation_momentum_signals():
        """
        BUY/SELL when the rate of institutional accumulation is accelerating.
        If 5D pace > 10D pace (per day) → momentum is building.
        """
        query = """
        WITH accumulation_ref AS (
            SELECT transaction_date as latest_acc_date
            FROM daily_cumulative_accumulation
            GROUP BY transaction_date HAVING COUNT(*) > 100
            ORDER BY transaction_date DESC LIMIT 1
        ),
        ranked_holders AS (
            SELECT symbol, entity_id,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY cumulative_net DESC) as rank
            FROM daily_cumulative_accumulation, accumulation_ref
            WHERE transaction_date = accumulation_ref.latest_acc_date AND cumulative_net > 0
        ),
        smart_money AS (
            SELECT symbol, entity_id as broker FROM ranked_holders WHERE rank <= 15
        ),
        broker_delta AS (
            SELECT
                ca.symbol, ca.entity_id as broker,
                (ca.cumulative_net - LAG(ca.cumulative_net, 5) OVER w) as net_5d,
                (ca.cumulative_net - LAG(ca.cumulative_net, 10) OVER w) as net_10d,
                (ca.cumulative_net - LAG(ca.cumulative_net, 20) OVER w) as net_20d,
                ROUND(ca.cumulative_buy_amount / NULLIF(ca.cumulative_buy, 0), 2) as wac,
                ca.transaction_date
            FROM daily_cumulative_accumulation ca
            WINDOW w AS (PARTITION BY ca.symbol, ca.entity_id ORDER BY ca.transaction_date)
        ),
        latest_delta AS (
            SELECT bd.* FROM broker_delta bd, accumulation_ref
            WHERE bd.transaction_date = accumulation_ref.latest_acc_date
        ),
        symbol_momentum AS (
            SELECT
                ld.symbol,
                SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_5d ELSE 0 END) as inst_net_5d,
                SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_10d ELSE 0 END) as inst_net_10d,
                SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_20d ELSE 0 END) as inst_net_20d,
                MAX(ld.wac) FILTER (WHERE sm.broker IS NOT NULL) as top_broker_wac,
                -- Pace: net per day
                ROUND(SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_5d ELSE 0 END) / 5.0) as pace_5d,
                ROUND(SUM(CASE WHEN sm.broker IS NOT NULL THEN ld.net_10d ELSE 0 END) / 10.0) as pace_10d
            FROM latest_delta ld
            LEFT JOIN smart_money sm ON ld.symbol = sm.symbol AND ld.broker = sm.broker
            GROUP BY ld.symbol
        ),
        latest_price AS (
            SELECT DISTINCT ON (symbol) symbol, close
            FROM daily_stock_price ORDER BY symbol, transaction_date DESC
        )
        SELECT
            sm.symbol, c."companyName" as name, c."sectorName" as sector,
            sm.inst_net_5d, sm.inst_net_10d, sm.inst_net_20d,
            sm.pace_5d, sm.pace_10d, sm.top_broker_wac,
            lp.close as ltp
        FROM symbol_momentum sm
        INNER JOIN companies c ON sm.symbol = c.symbol
        INNER JOIN latest_price lp ON sm.symbol = lp.symbol
        WHERE c."instrumentType" NOT IN ('Mutual Funds', 'Non-Convertible Debentures')
        AND c.status = 'A'
        AND sm.pace_10d != 0
        AND ABS(sm.inst_net_5d) > 20000
        ORDER BY ABS(sm.pace_5d) DESC;
        """

        signals = []
        try:
            with connections['default'].cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                raw = [dict(zip(columns, row)) for row in cursor.fetchall()]

            today = date.today()
            for row in raw:
                ltp = float(row['ltp'] or 0)
                net_5d = float(row['inst_net_5d'] or 0)
                pace_5d = float(row['pace_5d'] or 0)
                pace_10d = float(row['pace_10d'] or 0)
                wac = float(row['top_broker_wac'] or 0)

                if ltp <= 0 or pace_10d == 0:
                    continue

                # Acceleration: 5D daily pace exceeds 10D daily pace
                accel_ratio = pace_5d / pace_10d if pace_10d != 0 else 0

                if net_5d > 0 and accel_ratio >= 1.5:
                    # Accelerating accumulation
                    signal_type = 'BUY'
                    if accel_ratio >= 2.5:
                        tier = 'Surge Accumulation'
                        strength = 90
                    elif accel_ratio >= 2.0:
                        tier = 'Accelerating Accumulation'
                        strength = 80
                    else:
                        tier = 'Building Momentum'
                        strength = 68
                    rationale = f"Accumulation pace accelerating {accel_ratio:.1f}x (5D vs 10D avg). {int(net_5d):,} net shares in 5D."

                elif net_5d < 0 and accel_ratio >= 1.5:
                    # Accelerating distribution
                    signal_type = 'SELL'
                    if accel_ratio >= 2.5:
                        tier = 'Surge Distribution'
                        strength = 85
                    elif accel_ratio >= 2.0:
                        tier = 'Accelerating Sell-off'
                        strength = 75
                    else:
                        tier = 'Increasing Pressure'
                        strength = 63
                    rationale = f"Distribution pace accelerating {accel_ratio:.1f}x (5D vs 10D avg). {abs(int(net_5d)):,} net shares sold in 5D."
                else:
                    continue

                signals.append({
                    'symbol': row['symbol'],
                    'signal': signal_type,
                    'signal_tier': tier,
                    'strength': strength,
                    'ltp': ltp,
                    'rationale': rationale,
                    'generated_date': today,
                    'metadata': {
                        'name': row.get('name', ''),
                        'sector': row.get('sector', ''),
                        'inst_net_5d': net_5d,
                        'inst_net_10d': float(row.get('inst_net_10d', 0)),
                        'pace_5d': pace_5d,
                        'pace_10d': pace_10d,
                        'accel_ratio': round(accel_ratio, 2),
                        'top_broker_wac': wac,
                    }
                })
        except Exception as e:
            logger.error(f"Accumulation Momentum signal generation error: {e}")
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
