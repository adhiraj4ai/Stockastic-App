from rest_framework import serializers
from .models import DailyStockPrice, DailyFloorsheet, PortfolioItem, PortfolioTransaction, StockFundamental, PortfolioAccount, Dividend, FinancialReport, Strategy, Company, WatchlistItem

class DailyStockPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyStockPrice
        fields = ['ticker', 'date', 'open', 'high', 'low', 'close', 'volume']

# ... (rest of file)

class StockFundamentalSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockFundamental
        fields = '__all__'

class DividendSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dividend
        fields = '__all__'

class FinancialReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialReport
        fields = '__all__'

class DailyFloorsheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyFloorsheet
        fields = ['transaction_no', 'ticker', 'buyer_broker', 'seller_broker', 'quantity', 'rate', 'amount', 'date']

class PortfolioAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioAccount
        fields = ['id', 'name', 'balance', 'created_at']
        read_only_fields = ['id', 'created_at']

class PortfolioItemSerializer(serializers.ModelSerializer):
    current_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    current_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    investment_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gain_loss = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gain_loss_percent = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    wacc = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    day_gain_loss = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    sector = serializers.CharField(read_only=True)
    volatility = serializers.FloatField(read_only=True)

    class Meta:
        model = PortfolioItem
        fields = ['id', 'account', 'ticker', 'quantity', 'buy_price', 'wacc', 'purchased_at', 
                  'current_price', 'current_value', 'investment_value', 'gain_loss', 
                  'gain_loss_percent', 'day_gain_loss', 'sector', 'volatility',
                  'stop_loss_price', 'target_price', 'strategy_type']
        read_only_fields = ['id', 'purchased_at']

class PortfolioTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioTransaction
        fields = '__all__'
        read_only_fields = ['id', 'user', 'amount', 'receivable_amount', 'commission', 'sebon_fee', 'dp_charge', 'cgt', 'created_at']





class StrategySerializer(serializers.ModelSerializer):
    class Meta:
        model = Strategy
        fields = ['id', 'name', 'description', 'code', 'created_at', 'is_public', 'pnl_amount', 'pnl_percent', 'max_drawdown', 'sharpe_ratio', 'win_rate']
        read_only_fields = ['id', 'created_at']

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['id', 'symbol', 'name', 'sector']

class WatchlistItemSerializer(serializers.ModelSerializer):
    current_price = serializers.SerializerMethodField()
    day_change = serializers.SerializerMethodField()
    day_change_percent = serializers.SerializerMethodField()

    class Meta:
        model = WatchlistItem
        fields = ['id', 'ticker', 'added_at', 'target_price', 'notes', 'current_price', 'day_change', 'day_change_percent']
        read_only_fields = ['id', 'added_at']

    def get_current_price(self, obj):
        latest = DailyStockPrice.objects.filter(ticker=obj.ticker).order_by('-date').first()
        return latest.close if latest else None

    def get_day_change(self, obj):
        latest = DailyStockPrice.objects.filter(ticker=obj.ticker).order_by('-date').first()
        return latest.diff if latest else None

    def get_day_change_percent(self, obj):
        latest = DailyStockPrice.objects.filter(ticker=obj.ticker).order_by('-date').first()
        return latest.diff_percent if latest else None
