from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'portfolio', views.PortfolioViewSet, basename='portfolio')
router.register(r'accounts', views.PortfolioAccountViewSet, basename='portfolio-accounts')
router.register(r'transactions', views.PortfolioTransactionViewSet, basename='portfolio-transactions')
router.register(r'strategies', views.StrategyViewSet, basename='strategies')
router.register(r'companies', views.CompanyViewSet, basename='companies')

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
]
