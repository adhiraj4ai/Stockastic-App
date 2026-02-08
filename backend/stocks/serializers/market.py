from rest_framework import serializers
from ..models.market import DailyStockPrice, DailyFloorsheet, Company

class DailyStockPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyStockPrice
        fields = ['ticker', 'date', 'open', 'high', 'low', 'close', 'volume']

class DailyFloorsheetSerializer(serializers.ModelSerializer):
    contract_no = serializers.CharField(source='transaction_id')
    id = serializers.IntegerField(source='transaction_id')
    
    class Meta:
        model = DailyFloorsheet
        fields = [
            'id', 'contract_no', 'symbol', 'transaction_date', 
            'buyer_id', 'seller_id', 'transaction_quantity', 
            'transaction_rate', 'transaction_amount'
        ]

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['symbol', 'name', 'sector']
