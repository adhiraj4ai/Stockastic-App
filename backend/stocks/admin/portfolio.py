from django.contrib import admin
from ..models.portfolio import PortfolioAccount, PortfolioItem, PortfolioTransaction, WatchlistItem

@admin.register(PortfolioAccount)
class PortfolioAccountAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'balance', 'created_at')
    search_fields = ('name', 'user__username')

@admin.register(PortfolioItem)
class PortfolioItemAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'user', 'account', 'quantity', 'wacc')
    search_fields = ('ticker', 'user__username')
    list_filter = ('account',)

@admin.register(PortfolioTransaction)
class PortfolioTransactionAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'user', 'transaction_type', 'quantity', 'rate', 'transaction_date')
    search_fields = ('ticker', 'user__username')
    list_filter = ('transaction_type', 'transaction_date')

@admin.register(WatchlistItem)
class WatchlistItemAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'user', 'target_price', 'added_at')
    search_fields = ('ticker', 'user__username')
