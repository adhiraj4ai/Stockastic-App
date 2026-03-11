from rest_framework import serializers
from ..models.portfolio import PortfolioAccount, PortfolioItem, PortfolioTransaction, WatchlistItem, PortfolioTarget
from ..models.market import DailyStockPrice, Company

class PortfolioAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioAccount
        fields = ['id', 'name', 'account_type', 'balance', 'default_risk_percentage', 'created_at']
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
    health_score = serializers.FloatField(read_only=True)
    fundamental_metrics = serializers.JSONField(read_only=True)

    class Meta:
        model = PortfolioItem
        fields = ['id', 'account', 'ticker', 'quantity', 'buy_price', 'wacc', 'purchased_at', 
                  'current_price', 'current_value', 'investment_value', 'gain_loss', 
                  'gain_loss_percent', 'day_gain_loss', 'sector', 'volatility', 'signals',
                  'health_score', 'fundamental_metrics',
                  'stop_loss_price', 'target_price', 'target_price_2', 'target_price_3', 
                  'thesis', 'strategy_type', 'tags', 'target_allocation_pct']
        read_only_fields = ['id', 'purchased_at']

class PortfolioTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioTransaction
        fields = '__all__'
        read_only_fields = ['id', 'user', 'amount', 'receivable_amount', 'commission', 'sebon_fee', 'dp_charge', 'cgt', 'created_at']

class WatchlistItemSerializer(serializers.ModelSerializer):
    current_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    day_change = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    day_change_percent = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    sector = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    rsi = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    roc = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    signals = serializers.JSONField(read_only=True)
    health_score = serializers.FloatField(read_only=True)
    fundamental_metrics = serializers.JSONField(read_only=True)
    rvol = serializers.FloatField(read_only=True)
    fifty_two_week_high = serializers.FloatField(read_only=True)
    fifty_two_week_low = serializers.FloatField(read_only=True)
    days_to_book_closure = serializers.IntegerField(read_only=True)
    next_book_close = serializers.DateField(read_only=True)
    is_accumulating = serializers.BooleanField(read_only=True)
    buy_signal_count = serializers.IntegerField(read_only=True)
    upside_percent = serializers.FloatField(read_only=True)
    risk_reward_ratio = serializers.FloatField(read_only=True)

    class Meta:
        model = WatchlistItem
        fields = ['id', 'ticker', 'name', 'added_at', 'target_price', 'stop_loss_price', 'alert_enabled', 'notes', 
                  'current_price', 'day_change', 'day_change_percent', 
                  'sector', 'rsi', 'roc', 'signals', 'health_score', 'fundamental_metrics',
                  'rvol', 'fifty_two_week_high', 'fifty_two_week_low',
                  'days_to_book_closure', 'next_book_close', 'is_accumulating', 
                  'buy_signal_count', 'upside_percent', 'risk_reward_ratio']
        read_only_fields = ['id', 'added_at']

class PortfolioTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioTarget
        fields = ['id', 'account', 'target_type', 'category_name', 'target_percentage', 'created_at']
        read_only_fields = ['id', 'created_at']
