from rest_framework import serializers
from ..models.market import DailyStockPrice, DailyFloorsheet, Company

class DailyStockPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyStockPrice
        fields = ['ticker', 'date', 'open', 'high', 'low', 'close', 'volume']

class DailyFloorsheetSerializer(serializers.ModelSerializer):
    transaction_no = serializers.CharField(source='transaction_id')
    ticker = serializers.CharField(source='symbol')
    buyer_broker = serializers.IntegerField(source='buyer_id')
    seller_broker = serializers.IntegerField(source='seller_id')
    quantity = serializers.IntegerField(source='transaction_quantity')
    rate = serializers.DecimalField(source='transaction_rate', max_digits=10, decimal_places=2)
    amount = serializers.DecimalField(source='transaction_amount', max_digits=15, decimal_places=2)
    date = serializers.DateField(source='transaction_date')
    
    class Meta:
        model = DailyFloorsheet
        fields = ['transaction_no', 'ticker', 'buyer_broker', 'seller_broker', 'quantity', 'rate', 'amount', 'date']

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['symbol', 'name', 'sector']
