from django.urls import path, include
from rest_framework.routers import DefaultRouter
# Trigger reload
from . import views

router = DefaultRouter()
router.register(r'portfolio', views.PortfolioViewSet, basename='portfolio')
router.register(r'accounts', views.PortfolioAccountViewSet, basename='portfolio-accounts')
router.register(r'transactions', views.PortfolioTransactionViewSet, basename='portfolio-transactions')
router.register(r'strategies', views.StrategyViewSet, basename='strategies')
router.register(r'companies', views.CompanyViewSet, basename='companies')
router.register(r'watchlist', views.WatchlistViewSet, basename='watchlist')
router.register(r'pipeline', views.PipelineViewSet, basename='pipeline')
router.register(r'notifications', views.NotificationViewSet, basename='notifications')
router.register(r'financial-reports', views.FinancialReportViewSet, basename='financial-reports')
router.register(r'signals', views.StrategySignalViewSet, basename='strategy-signals')

urlpatterns = [
    path('', include(router.urls)),
    path('search/', views.search_stocks, name='search_stocks'),
    path('summary/', views.stock_summary, name='stock_summary'),
    path('history/<str:ticker>/', views.stock_history, name='stock_history'),
    path('details/<str:ticker>/', views.stock_detail, name='stock_detail'),
    path('floorsheet/<str:ticker>/', views.stock_floorsheet, name='stock_floorsheet'),
    path('dividends/<str:ticker>/', views.stock_dividends, name='stock_dividends'),
    path('financials/<str:ticker>/', views.stock_financials, name='stock_financials'),
    path('sector-history/<str:sector_name>/', views.sector_history, name='sector_history'),
    path('broker_portfolio/', views.get_broker_portfolio, name='broker_portfolio'),
    path('floorsheet_list/', views.floorsheet_list, name='floorsheet_list'),
    path('accumulation_history/', views.accumulation_history, name='accumulation_history'),
]
