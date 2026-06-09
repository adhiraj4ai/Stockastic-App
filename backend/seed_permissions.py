import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from users.models import TierPermission

def seed_permissions():
    # Define granular modules grouped logically
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
        'Finfolio Suite': [
            'portfolio_main', 'portfolio_performance', 'portfolio_income', 
            'portfolio_transactions', 'portfolio_watchlist', 'paper_trading',
            'portfolio_optimization'
        ],
        'Accumulation Suite': [
            'accumulation_dash', 'smart_money', 'broker_trends', 
            'focus_ranking', 'price_study', 
            'broker_favorites', 'navigator', 'below_cost'
        ],
        'Strategic Hub': [
            'intel_hub', 'strategies', 'track_record'
        ],
        'Ticker Intelligence': [
            'ticker_pa', 'ticker_signals', 'ticker_accumulation', 
            'ticker_tech', 'ticker_funds'
        ]
    }
    
    # Flatten modules for iterating
    ALL_MODULES = [module for group in MODULE_GROUPS.values() for module in group]
    
    # Define tier logic
    # BASIC: Home, Market Overview, Main Portfolio, Ticker PA/Accumulation
    # PRO: All except Strategic Hub, Chat, and some advanced Ticker insights
    # ULTRA: All
    
    TIER_RULES = {
        'BASIC': [
            'home', 'chat', 'market_overview', 'portfolio_main', 'portfolio_watchlist',
            'ticker_pa', 'ticker_accumulation'
        ],
        'PRO': [
            'home', 'chat', 'market_overview', 'market_movers', 'market_activity',
            'market_rotation', 'market_floorsheet', 'market_bulk', 'market_volume',
            'portfolio_main', 'portfolio_performance', 'portfolio_income',
            'portfolio_transactions', 'portfolio_watchlist', 'paper_trading',
            'accumulation_dash', 'smart_money', 'broker_trends', 'accumulation_history', 'below_cost',
            'ticker_pa', 'ticker_accumulation', 'ticker_tech', 'ticker_signals'
        ],
        'ULTRA': ALL_MODULES
    }
    
    for tier, allowed_modules in TIER_RULES.items():
        for module in ALL_MODULES:
            is_enabled = module in allowed_modules
            obj, created = TierPermission.objects.update_or_create(
                tier=tier,
                module_key=module,
                defaults={'is_enabled': is_enabled}
            )
            print(f"{'Created' if created else 'Updated'} {tier} - {module}: {is_enabled}")

if __name__ == "__main__":
    seed_permissions()
