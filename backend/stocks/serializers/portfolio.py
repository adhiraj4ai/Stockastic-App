from decimal import Decimal
from django.db import transaction
from rest_framework import serializers
from ..models.portfolio import (
    PortfolioAccount, PortfolioItem, PortfolioTransaction,
    WatchlistItem, PortfolioTarget, TradePlan, TradePlanLeg,
)
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


class TradePlanLegSerializer(serializers.ModelSerializer):
    class Meta:
        model = TradePlanLeg
        fields = [
            'id', 'leg_number', 'price_target', 'allocation_pct',
            'stop_loss_price', 'status', 'transaction', 'notes',
        ]
        read_only_fields = ['id', 'status', 'transaction']

    def validate(self, data):
        price = data['price_target'] if 'price_target' in data else (self.instance.price_target if self.instance else None)
        stop = data['stop_loss_price'] if 'stop_loss_price' in data else (self.instance.stop_loss_price if self.instance else None)
        if price is not None and stop is not None and stop >= price:
            raise serializers.ValidationError(
                {'stop_loss_price': 'stop_loss_price must be less than price_target.'}
            )
        return data


class TradePlanSerializer(serializers.ModelSerializer):
    legs = TradePlanLegSerializer(many=True)
    total_allocated_pct = serializers.SerializerMethodField()
    executed_legs = serializers.SerializerMethodField()
    total_legs = serializers.SerializerMethodField()
    per_leg_risk_pct = serializers.SerializerMethodField()

    class Meta:
        model = TradePlan
        fields = [
            'id', 'account', 'ticker', 'thesis', 'risk_budget_pct', 'target_price',
            'status', 'created_at', 'legs',
            'total_allocated_pct', 'executed_legs', 'total_legs', 'per_leg_risk_pct',
        ]
        read_only_fields = ['id', 'status', 'created_at']

    def get_total_allocated_pct(self, obj):
        return float(sum(leg.allocation_pct for leg in obj.legs.all()))

    def get_executed_legs(self, obj):
        return obj.legs.filter(status=TradePlanLeg.LegStatus.EXECUTED).count()

    def get_total_legs(self, obj):
        return obj.legs.count()

    def get_per_leg_risk_pct(self, obj):
        total = obj.legs.count()
        return round(float(obj.risk_budget_pct) / total, 2) if total else 0.0

    def validate(self, data):
        legs_data = data.get('legs', [])
        if not legs_data:
            raise serializers.ValidationError({'legs': 'At least one leg is required.'})
        total_pct = sum(leg['allocation_pct'] for leg in legs_data)
        if total_pct != Decimal('100.00'):
            raise serializers.ValidationError(
                {'legs': f'Leg allocation_pct must sum to 100. Got {total_pct:.2f}.'}
            )
        return data

    def create(self, validated_data):
        legs_data = validated_data.pop('legs')
        with transaction.atomic():
            plan = TradePlan.objects.create(**validated_data)
            for leg_data in legs_data:
                TradePlanLeg.objects.create(plan=plan, **leg_data)
        return plan

    def update(self, instance, validated_data):
        validated_data.pop('legs', None)
        return super().update(instance, validated_data)
