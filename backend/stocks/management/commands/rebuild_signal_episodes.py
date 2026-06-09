# backend/stocks/management/commands/rebuild_signal_episodes.py
from django.core.management.base import BaseCommand
from stocks.models import SignalEpisode, DailyStockPrice
from stocks.services.signal_episode.backfill import replay_producer_symbol
from stocks.services.signal_episode.adapters import engine_reading
from stocks.views.recommendations import BrokerAccumulationRecommendationEngine


class Command(BaseCommand):
    help = "Wipe and re-derive SignalEpisode rows from historical price/engine data."

    def add_arguments(self, parser):
        parser.add_argument("--symbol", type=str, default=None)
        parser.add_argument("--days", type=int, default=365)

    def handle(self, *args, **opts):
        SignalEpisode.objects.all().delete()
        self.stdout.write("Cleared existing episodes.")

        symbols = ([opts["symbol"]] if opts["symbol"]
                   else list(DailyStockPrice.objects.values_list("ticker", flat=True).distinct()))

        engine = BrokerAccumulationRecommendationEngine()
        for i, symbol in enumerate(symbols, 1):
            history = engine.compute_history_rows(symbol, days=opts["days"])
            readings = [engine_reading(
                d=row["date"], signal=row["signal"], ltp=row["close"],
                strength=row.get("strength", 0), tier=row.get("trend_direction", ""),
                rationale=row.get("reason", ""), target=row.get("target"),
                stop=row.get("stop"), metadata=row.get("metadata", {}),
            ) for row in history]
            replay_producer_symbol(source="BROKER_ACCUMULATION", strategy=None,
                                   symbol=symbol, readings=readings)
            if i % 50 == 0:
                self.stdout.write(f"Replayed {i}/{len(symbols)} symbols...")

        # NOTE: Only BROKER_ACCUMULATION has a per-date history backfill here.
        # Other engine sources (SMART_CROSSOVER, ICHIMOKU, SMART_MONEY, etc.) are
        # FORWARD-ONLY for now (populated going forward by generate_all_signals).
        self.stdout.write(self.style.WARNING(
            "Only BROKER_ACCUMULATION backfilled; other sources are forward-only."))
        self.stdout.write(self.style.SUCCESS(
            f"Backfill complete: {SignalEpisode.objects.count()} episodes."))
