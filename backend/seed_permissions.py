import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from users.models import TierPermission

MODULE_GROUPS = {
    'Global': ['home', 'chat'],
    'Market Suite': [
        'market_overview', 'market_movers', 'market_activity',
        'market_rotation', 'market_pa_screener', 'market_social'
    ],
    'Floorsheet Suite': [
        'market_floorsheet', 'market_bulk', 'market_matching', 'market_volume',
        'accumulation_history', 'share_transfer'
    ],
    'Portfolio Suite': [
        'portfolio_main', 'portfolio_performance', 'portfolio_income',
        'portfolio_transactions', 'portfolio_watchlist', 'paper_trading',
        'portfolio_optimization'
    ],
    'Accumulation Suite': [
        'accumulation_dash', 'smart_money', 'broker_trends',
        'focus_ranking', 'price_study',
        'broker_favorites', 'navigator', 'below_cost'
    ],
    'Signals': ['intel_hub', 'strategies', 'track_record', 'daily_plan'],
    'Ticker Intelligence': [
        'ticker_pa', 'ticker_signals', 'ticker_accumulation',
        'ticker_tech', 'ticker_funds'
    ],
}

ALL_MODULES = [module for group in MODULE_GROUPS.values() for module in group]

TIER_RULES = {
    'BASIC': [
        'home', 'chat', 'market_overview', 'portfolio_main', 'portfolio_watchlist',
        'ticker_pa', 'ticker_accumulation', 'daily_plan'
    ],
    'PRO': [
        'home', 'chat', 'market_overview', 'market_movers', 'market_activity',
        'market_rotation', 'market_floorsheet', 'market_bulk', 'market_volume',
        'portfolio_main', 'portfolio_performance', 'portfolio_income',
        'portfolio_transactions', 'portfolio_watchlist', 'paper_trading',
        'accumulation_dash', 'smart_money', 'broker_trends', 'accumulation_history', 'below_cost',
        'ticker_pa', 'ticker_accumulation', 'ticker_tech', 'ticker_signals', 'daily_plan'
    ],
    'ULTRA': ALL_MODULES,
}


def _upsert_tier_module(tier, module, allowed_modules):
    is_enabled = module in allowed_modules
    _, created = TierPermission.objects.update_or_create(
        tier=tier,
        module_key=module,
        defaults={'is_enabled': is_enabled},
    )
    print(f"{'Created' if created else 'Updated'} {tier} - {module}: {is_enabled}")


def seed_permissions():
    for tier, allowed_modules in TIER_RULES.items():
        for module in ALL_MODULES:
            _upsert_tier_module(tier, module, allowed_modules)

if __name__ == "__main__":
    seed_permissions()
