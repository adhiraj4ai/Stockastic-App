from django.contrib import admin
from ..models.fundamentals import StockFundamental, Dividend, FinancialReport

@admin.register(StockFundamental)
class StockFundamentalAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'company_name', 'sector', 'pe_ratio', 'eps', 'updated_at')
    search_fields = ('ticker', 'company_name')
    list_filter = ('sector',)

@admin.register(Dividend)
class DividendAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'fiscal_year', 'bonus_percent', 'cash_percent', 'date')
    search_fields = ('ticker',)
    list_filter = ('fiscal_year',)

@admin.register(FinancialReport)
class FinancialReportAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'fiscal_year', 'quarter', 'net_profit', 'eps', 'book_value')
    search_fields = ('ticker',)
    list_filter = ('fiscal_year', 'quarter')
