from django.db import models

class StockFundamental(models.Model):
    ticker = models.CharField(max_length=20, unique=True, db_index=True)
    company_name = models.CharField(max_length=255)
    sector = models.CharField(max_length=100)
    
    # Capital
    authorized_capital = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    paid_up_capital = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    market_cap = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    free_float_market_cap = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    shares_outstanding = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    public_shares = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    listed_date = models.DateField(null=True, blank=True)
    
    # Key Metrics
    pe_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    eps = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    book_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    dividend_yield = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    peg_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_to_book = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_to_sales = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ro_equity = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ro_assets = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    dividend_payout_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    qoq_earnings_growth = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    yoy_earnings_growth = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    graham_number_diff = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    debt_to_equity = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    # 52 Week
    fifty_two_week_high = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    fifty_two_week_low = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Flexible Indicators
    fundamental_indicators = models.JSONField(default=list, blank=True)
    technical_indicators = models.JSONField(default=list, blank=True)
    broker_accumulation = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.ticker} - {self.company_name}"

class Dividend(models.Model):
    ticker = models.CharField(max_length=20, db_index=True)
    fiscal_year = models.CharField(max_length=20)
    bonus_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cash_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.ticker} - {self.fiscal_year}"

class FinancialReport(models.Model):
    class ReportType(models.TextChoices):
        ANNUAL = 'ANNUAL', 'Annual'
        QUARTERLY = 'QUARTERLY', 'Quarterly'

    ticker = models.CharField(max_length=20, db_index=True)
    fiscal_year = models.CharField(max_length=20)
    report_type = models.CharField(max_length=20, choices=ReportType.choices, default=ReportType.QUARTERLY)
    quarter = models.IntegerField(choices=[(1, 'Q1'), (2, 'Q2'), (3, 'Q3'), (4, 'Q4')], null=True, blank=True)
    is_audited = models.BooleanField(default=False)
    report_template = models.CharField(max_length=50, default='GENERAL')
    
    paid_up_capital = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    reserves_and_surplus = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    revenue = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    operating_profit = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    net_profit = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    eps = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    pe_ratio = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    book_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    return_on_equity = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    balance_sheet = models.JSONField(null=True, blank=True)
    profit_loss = models.JSONField(null=True, blank=True)
    cash_flow = models.JSONField(null=True, blank=True)
    key_ratios = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = ('ticker', 'fiscal_year', 'report_type', 'quarter')
        ordering = ['-fiscal_year', '-report_type', '-quarter']

    def __str__(self):
        if self.report_type == self.ReportType.ANNUAL:
            return f"{self.ticker} - {self.fiscal_year} (Annual)"
        return f"{self.ticker} - {self.fiscal_year} Q{self.quarter}"
