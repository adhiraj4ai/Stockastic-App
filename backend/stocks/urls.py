from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    market, portfolio, strategy, broker, pipeline, watchlist, notifications, recommendations, chart
)


router = DefaultRouter()
router.register(r'portfolio', portfolio.PortfolioViewSet, basename='portfolio')
router.register(r'accounts', portfolio.PortfolioAccountViewSet, basename='portfolio-accounts')
router.register(r'transactions', portfolio.PortfolioTransactionViewSet, basename='portfolio-transactions')
router.register(r'strategies', strategy.StrategyViewSet, basename='strategies')
router.register(r'companies', market.CompanyViewSet, basename='companies')
router.register(r'watchlist', watchlist.WatchlistViewSet, basename='watchlist')
router.register(r'pipeline', pipeline.PipelineViewSet, basename='pipeline')
router.register(r'notifications', notifications.NotificationViewSet, basename='notifications')
router.register(r'financial-reports', market.FinancialReportViewSet, basename='financial-reports')
router.register(r'signals', strategy.StrategySignalViewSet, basename='strategy-signals')
router.register(r'broker-analysis', broker.BrokerViewSet, basename='broker-analysis')

urlpatterns = [
    path('', include(router.urls)),
    
    # Market Data
    path('search/', market.search_stocks, name='search_stocks'),
    path('summary/', market.stock_summary, name='stock_summary'),
    path('history/<str:ticker>/', market.stock_history, name='stock_history'),
    path('details/<str:ticker>/', market.stock_detail, name='stock_detail'),
    path('floorsheet/<str:ticker>/', market.stock_floorsheet, name='stock_floorsheet'),
    path('dividends/<str:ticker>/', market.stock_dividends, name='stock_dividends'),
    path('financials/<str:ticker>/', market.stock_financials, name='stock_financials'),
    path('sector-history/<str:sector_name>/', market.sector_history, name='sector_history'),
    path('floorsheet_list/', market.floorsheet_list, name='floorsheet_list'),
    
    # Broker & Accumulation
    path('broker_portfolio/', broker.get_broker_portfolio, name='broker_portfolio'),
    path('accumulation_history/', broker.accumulation_history, name='accumulation_history'),
    
    # Watchlist
    path('check_watchlist_alerts/', watchlist.check_watchlist_alerts, name='check_watchlist_alerts'),
    
    # Broker Accumulation Recommendations
    path('broker-accumulation-recommendations/', 
         recommendations.get_broker_accumulation_recommendations, 
         name='broker_accumulation_recommendations'),
    path('broker-accumulation-history/', 
         recommendations.get_broker_accumulation_history, 
         name='broker_accumulation_history'),
    
    # Smart Accumulated Crossover (New)
    path('smart-accumulated-crossover-recommendations/', 
         recommendations.get_smart_accumulated_crossover_recommendations, 
         name='smart_accumulated_crossover_recommendations'),
    path('smart-accumulated-crossover-history/', 
         recommendations.get_smart_accumulated_crossover_history, 
         name='smart_accumulated_crossover_history'),
    
    # Ichimoku Cloud + Accumulation
    path('ichimoku-accumulation-recommendations/', 
         recommendations.get_ichimoku_accumulation_recommendations, 
         name='ichimoku_accumulation_recommendations'),
    path('ichimoku-accumulation-history/', 
         recommendations.get_ichimoku_accumulation_history, 
         name='ichimoku_accumulation_history'),
    
    # Chart Data (for Lightweight Charts)
    path('chart-history/<str:ticker>/', chart.get_stock_chart_data, name='chart_history'),
]
