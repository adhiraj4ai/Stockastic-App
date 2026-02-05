from django.contrib import admin
from ..models.market import Company, DailyStockPrice, DailyFloorsheet

@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('symbol', 'name', 'sector', 'status')
    search_fields = ('symbol', 'name')
    list_filter = ('sector', 'status')

@admin.register(DailyStockPrice)
class DailyStockPriceAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'date', 'close', 'volume')
    search_fields = ('ticker',)
    list_filter = ('date',)

@admin.register(DailyFloorsheet)
class DailyFloorsheetAdmin(admin.ModelAdmin):
    list_display = ('transaction_id', 'symbol', 'transaction_date', 'transaction_rate', 'transaction_quantity')
    search_fields = ('symbol', 'transaction_id')
    list_filter = ('transaction_date',)

from ..models.market import (
    DailyMarketSummary, DailyBuyerFloorsheet, 
    DailySellerFloorsheet, DailyCumulativeAccumulation
)

@admin.register(DailyMarketSummary)
class DailyMarketSummaryAdmin(admin.ModelAdmin):
    list_display = ('date', 'total_turnover', 'total_volume', 'total_transactions')
    list_filter = ('date',)

@admin.register(DailyBuyerFloorsheet)
class DailyBuyerFloorsheetAdmin(admin.ModelAdmin):
    list_display = ('symbol', 'transaction_date', 'buyer_id', 'buy_volume')
    list_filter = ('transaction_date',)

@admin.register(DailySellerFloorsheet)
class DailySellerFloorsheetAdmin(admin.ModelAdmin):
    list_display = ('symbol', 'transaction_date', 'seller_id', 'sell_volume')
    list_filter = ('transaction_date',)

@admin.register(DailyCumulativeAccumulation)
class DailyCumulativeAccumulationAdmin(admin.ModelAdmin):
    list_display = ('symbol', 'transaction_date', 'entity_id', 'cumulative_net')
    list_filter = ('transaction_date',)
