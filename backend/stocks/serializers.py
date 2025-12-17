from rest_framework import serializers
from .models import DailyStockPrice, DailyFloorsheet, PortfolioItem, PortfolioTransaction, StockFundamental, PortfolioAccount

class DailyStockPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyStockPrice
        fields = ['ticker', 'date', 'open', 'high', 'low', 'close', 'volume']

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

    class Meta:
        model = PortfolioItem
        fields = ['id', 'account', 'ticker', 'quantity', 'buy_price', 'wacc', 'purchased_at', 
                  'current_price', 'current_value', 'investment_value', 'gain_loss', 'gain_loss_percent', 'day_gain_loss']
        read_only_fields = ['id', 'purchased_at']

class PortfolioTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioTransaction
        fields = '__all__'
        read_only_fields = ['id', 'user', 'commission', 'sebon_fee', 'dp_charge', 'cgt', 'receivable_amount', 'amount', 'created_at']

class StockFundamentalSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockFundamental
        fields = '__all__'
