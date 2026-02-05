from rest_framework import serializers
from ..models.portfolio import PortfolioAccount, PortfolioItem, PortfolioTransaction, WatchlistItem
from ..models.market import DailyStockPrice, Company

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
    signals = serializers.JSONField(read_only=True, required=False)

    class Meta:
        model = PortfolioItem
        fields = ['id', 'account', 'ticker', 'quantity', 'buy_price', 'wacc', 'purchased_at', 
                  'current_price', 'current_value', 'investment_value', 'gain_loss', 
                  'gain_loss_percent', 'day_gain_loss', 'sector', 'volatility', 'signals',
                  'stop_loss_price', 'target_price', 'target_price_2', 'target_price_3', 
                  'thesis', 'strategy_type']
        read_only_fields = ['id', 'purchased_at']

class PortfolioTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioTransaction
        fields = '__all__'
        read_only_fields = ['id', 'user', 'amount', 'receivable_amount', 'commission', 'sebon_fee', 'dp_charge', 'cgt', 'created_at']

class WatchlistItemSerializer(serializers.ModelSerializer):
    current_price = serializers.SerializerMethodField()
    day_change = serializers.SerializerMethodField()
    day_change_percent = serializers.SerializerMethodField()
    sector = serializers.SerializerMethodField()
    rsi = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    roc = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)

    class Meta:
        model = WatchlistItem
        fields = ['id', 'ticker', 'added_at', 'target_price', 'notes', 'current_price', 'day_change', 'day_change_percent', 'sector', 'rsi', 'roc']
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

    def get_sector(self, obj):
        company = Company.objects.filter(symbol=obj.ticker).first()
        return company.sector if company else None
