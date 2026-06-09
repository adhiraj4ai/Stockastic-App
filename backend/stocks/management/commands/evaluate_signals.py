# backend/stocks/management/commands/evaluate_signals.py
from django.core.management.base import BaseCommand
from stocks.services.signal_episode.service import evaluate_active_episodes


class Command(BaseCommand):
    help = "Evaluate ACTIVE SignalEpisodes against price action; close on TP/SL."

    def handle(self, *args, **options):
        closed = evaluate_active_episodes()
        self.stdout.write(self.style.SUCCESS(f"Evaluation complete: {closed} episodes closed."))
