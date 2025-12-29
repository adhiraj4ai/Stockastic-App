# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class Companies(models.Model):
    companyname = models.CharField(db_column='companyName')  # Field name made lowercase.
    symbol = models.CharField(unique=True)
    securityname = models.CharField(db_column='securityName', blank=True, null=True)  # Field name made lowercase.
    status = models.CharField(blank=True, null=True)
    companyemail = models.CharField(db_column='companyEmail', blank=True, null=True)  # Field name made lowercase.
    website = models.CharField(blank=True, null=True)
    sectorname = models.CharField(db_column='sectorName', blank=True, null=True)  # Field name made lowercase.
    regulatorybody = models.CharField(db_column='regulatoryBody', blank=True, null=True)  # Field name made lowercase.
    instrumenttype = models.CharField(db_column='instrumentType', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'companies'


class DailyBuyerFloorsheet(models.Model):
    pk = models.CompositePrimaryKey('transaction_date', 'symbol', 'buyer_id')
    transaction_date = models.DateField()
    symbol = models.CharField()
    buyer_id = models.IntegerField()
    buy_volume = models.BigIntegerField(blank=True, null=True)
    total_volume = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    buy_volume_percentage = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    buyer_rank = models.BigIntegerField(blank=True, null=True)
    average_weighted_price = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_buyer_floorsheet'


class DailyCumulativeAccumulation(models.Model):
    pk = models.CompositePrimaryKey('transaction_date', 'symbol', 'entity_id')
    transaction_date = models.DateField()
    symbol = models.CharField()
    entity_id = models.CharField()
    cumulative_buy = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    cumulative_sell = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    cumulative_buy_amount = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    cumulative_sell_amount = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    cumulative_net = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_cumulative_accumulation'


class DailyFloorsheet(models.Model):
    transaction_id = models.BigAutoField(primary_key=True)
    symbol = models.CharField(blank=True, null=True)
    buyer_id = models.IntegerField(blank=True, null=True)
    seller_id = models.IntegerField(blank=True, null=True)
    transaction_quantity = models.IntegerField(blank=True, null=True)
    transaction_rate = models.FloatField(blank=True, null=True)
    transaction_amount = models.FloatField(blank=True, null=True)
    transaction_date = models.DateField(blank=True, null=True)
    transaction_book_id = models.IntegerField(blank=True, null=True)
    stock_id = models.IntegerField(blank=True, null=True)
    buyer_name = models.CharField(blank=True, null=True)
    seller_name = models.CharField(blank=True, null=True)
    transaction_datetime = models.DateTimeField(blank=True, null=True)
    security_name = models.CharField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_floorsheet'


class DailyFundamentalSignal(models.Model):
    pk = models.CompositePrimaryKey('id', 'symbol')
    id = models.AutoField()
    symbol = models.CharField()
    transaction_date = models.DateField()
    ratios_summary = models.CharField(blank=True, null=True)
    sector = models.CharField(blank=True, null=True)
    daily_gain = models.CharField(blank=True, null=True)
    ltp = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    pe_ratio = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    pb = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    roe = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    roa = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    peg = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    discount_from_graham_number = models.CharField(blank=True, null=True)
    pe_vs_sector = models.CharField(blank=True, null=True)
    pb_vs_sector = models.CharField(blank=True, null=True)
    peg_vs_sector = models.CharField(blank=True, null=True)
    dividend_yield_vs_sector = models.CharField(blank=True, null=True)
    roe_vs_sector = models.CharField(blank=True, null=True)
    dividend_yield = models.CharField(blank=True, null=True)
    payout_ratio = models.CharField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_fundamental_signal'


class DailyGainers(models.Model):
    pk = models.CompositePrimaryKey('businessDate', 'symbol')
    businessdate = models.DateTimeField(db_column='businessDate')  # Field name made lowercase.
    symbol = models.CharField()
    ltp = models.FloatField(blank=True, null=True)
    pointchange = models.FloatField(db_column='pointChange', blank=True, null=True)  # Field name made lowercase.
    percentagechange = models.FloatField(db_column='percentageChange', blank=True, null=True)  # Field name made lowercase.
    securityname = models.CharField(db_column='securityName', blank=True, null=True)  # Field name made lowercase.
    securityid = models.IntegerField(db_column='securityId', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'daily_gainers'


class DailyLoosers(models.Model):
    pk = models.CompositePrimaryKey('businessDate', 'symbol')
    businessdate = models.DateTimeField(db_column='businessDate')  # Field name made lowercase.
    symbol = models.CharField()
    ltp = models.FloatField(blank=True, null=True)
    pointchange = models.FloatField(db_column='pointChange', blank=True, null=True)  # Field name made lowercase.
    percentagechange = models.FloatField(db_column='percentageChange', blank=True, null=True)  # Field name made lowercase.
    securityname = models.CharField(db_column='securityName', blank=True, null=True)  # Field name made lowercase.
    securityid = models.IntegerField(db_column='securityId', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'daily_loosers'


class DailySellerFloorsheet(models.Model):
    pk = models.CompositePrimaryKey('transaction_date', 'symbol', 'seller_id')
    transaction_date = models.DateField()
    symbol = models.CharField()
    seller_id = models.IntegerField()
    sell_volume = models.BigIntegerField(blank=True, null=True)
    total_volume = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    sell_volume_percentage = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    seller_rank = models.BigIntegerField(blank=True, null=True)
    average_weighted_price = models.DecimalField(max_digits=20, decimal_places=4, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_seller_floorsheet'


class DailyStockPrice(models.Model):
    pk = models.CompositePrimaryKey('symbol', 'transaction_date')
    symbol = models.CharField()
    transaction_date = models.DateField()
    conf = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    open = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    high = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    low = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    close = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    vwap = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    volume = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    prev_close = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    turnover = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    trans = models.IntegerField(blank=True, null=True)
    diff = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    range = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    diff_percent = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    range_percent = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    vwap_percent = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    days_120 = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    days_180 = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    weeks_52_high = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)
    weeks_52_low = models.DecimalField(max_digits=65535, decimal_places=65535, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_stock_price'
        unique_together = (('symbol', 'transaction_date'),)


class DailyStockSignals(models.Model):
    symbol = models.CharField(max_length=20)
    signal_type = models.TextField()
    transaction_date = models.DateField()
    close_price = models.DecimalField(max_digits=20, decimal_places=2)
    parameter_name = models.CharField(max_length=50)
    parameter_value = models.TextField()
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'daily_stock_signals'
        unique_together = (('symbol', 'transaction_date', 'signal_type', 'parameter_name'),)


class DailyStrategicRecommendations(models.Model):
    symbol = models.CharField(max_length=20)
    strategy = models.CharField(max_length=50)
    transaction_date = models.DateField()
    parameter_name = models.CharField(max_length=50)
    parameter_value = models.TextField()
    is_active = models.BooleanField(blank=True, null=True)
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'daily_strategic_recommendations'


class DailyTransaction(models.Model):
    pk = models.CompositePrimaryKey('businessDate', 'symbol')
    businessdate = models.DateField(db_column='businessDate')  # Field name made lowercase.
    symbol = models.CharField()
    totaltrades = models.IntegerField(db_column='totalTrades', blank=True, null=True)  # Field name made lowercase.
    lasttradedprice = models.FloatField(db_column='lastTradedPrice', blank=True, null=True)  # Field name made lowercase.
    securityname = models.CharField(db_column='securityName', blank=True, null=True)  # Field name made lowercase.
    securityid = models.IntegerField(db_column='securityId', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'daily_transaction'


class DailyTurnover(models.Model):
    pk = models.CompositePrimaryKey('businessDate', 'symbol')
    businessdate = models.DateTimeField(db_column='businessDate')  # Field name made lowercase.
    symbol = models.CharField()
    turnover = models.FloatField(blank=True, null=True)
    closingprice = models.FloatField(db_column='closingPrice', blank=True, null=True)  # Field name made lowercase.
    securityname = models.CharField(db_column='securityName', blank=True, null=True)  # Field name made lowercase.
    securityid = models.IntegerField(db_column='securityId', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'daily_turnover'


class DailyVolume(models.Model):
    pk = models.CompositePrimaryKey('businessDate', 'symbol')
    businessdate = models.DateTimeField(db_column='businessDate')  # Field name made lowercase.
    symbol = models.CharField()
    sharetraded = models.FloatField(db_column='shareTraded', blank=True, null=True)  # Field name made lowercase.
    closingprice = models.FloatField(db_column='closingPrice', blank=True, null=True)  # Field name made lowercase.
    securityname = models.CharField(db_column='securityName', blank=True, null=True)  # Field name made lowercase.
    securityid = models.IntegerField(db_column='securityId', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'daily_volume'


class MomentumSignals(models.Model):
    pk = models.CompositePrimaryKey('symbol', 'transaction_date')
    symbol = models.CharField()
    transaction_date = models.DateField()
    direction = models.CharField()
    strength = models.CharField()
    momentum_score = models.FloatField()
    trend_strength = models.CharField()
    volume_profile = models.FloatField()
    momentum_change = models.FloatField()
    momentum_acceleration = models.FloatField()
    signal_consistency = models.FloatField()
    volatility = models.FloatField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'momentum_signals'


class Portfolios(models.Model):
    portfolio_id = models.UUIDField(primary_key=True)
    trader_id = models.UUIDField()
    name = models.CharField()
    initial_cash = models.FloatField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    max_position_size = models.FloatField()
    max_sector_exposure = models.FloatField()
    tax_lot_method = models.TextField()  # This field type is a guess.
    realized_gains = models.FloatField()
    is_active = models.BooleanField()

    class Meta:
        managed = False
        db_table = 'portfolios'


class RecomAccumulatedSmartCrossover(models.Model):
    symbol = models.CharField(max_length=10)
    transaction_date = models.DateField()
    close_price = models.DecimalField(max_digits=12, decimal_places=4)
    ema_short = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    ema_long = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    ema_crossover_date = models.DateField(blank=True, null=True)
    macd_crossover_date = models.DateField(blank=True, null=True)
    macd_hist = models.DecimalField(max_digits=12, decimal_places=5, blank=True, null=True)
    bb_upper = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    bb_middle = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    bb_lower = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    signal = models.CharField(max_length=10, blank=True, null=True)
    signal_strength = models.CharField(max_length=20, blank=True, null=True)
    confidence_score = models.IntegerField(blank=True, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'recom_accumulated_smart_crossover'


class Strategies(models.Model):
    name = models.CharField(unique=True, max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'strategies'


class StrategyParameters(models.Model):
    strategy = models.ForeignKey(Strategies, models.DO_NOTHING, blank=True, null=True)
    param_name = models.CharField(max_length=50, blank=True, null=True)
    param_value = models.CharField(max_length=50, blank=True, null=True)
    data_type = models.CharField(max_length=20, blank=True, null=True)
    version = models.IntegerField(blank=True, null=True)
    effective_date = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'strategy_parameters'


class StrategySignals(models.Model):
    strategy = models.ForeignKey(Strategies, models.DO_NOTHING, blank=True, null=True)
    symbol = models.CharField(max_length=10, blank=True, null=True)
    timestamp = models.DateTimeField(blank=True, null=True)
    signal_type = models.CharField(max_length=20, blank=True, null=True)
    conditions = models.TextField(blank=True, null=True)  # This field type is a guess.
    parameters = models.TextField(blank=True, null=True)  # This field type is a guess.
    created_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'strategy_signals'


class TaxLots(models.Model):
    symbol = models.CharField()
    quantity = models.FloatField()
    purchase_price = models.FloatField()
    purchase_date = models.DateTimeField()
    is_closed = models.BooleanField()
    closed_date = models.DateTimeField(blank=True, null=True)
    portfolio = models.ForeignKey(Portfolios, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'tax_lots'


class TraderProfiles(models.Model):
    trader_id = models.UUIDField(primary_key=True)
    name = models.CharField()
    email = models.CharField(unique=True)
    risk_tolerance = models.FloatField()
    investment_strategy = models.CharField()
    risk_profile = models.CharField()
    investment_goals = models.CharField()
    credentials = models.TextField()  # This field type is a guess.
    preferences = models.TextField()  # This field type is a guess.
    permissions = models.TextField()  # This field type is a guess.
    constraints = models.TextField()  # This field type is a guess.
    tax_information = models.TextField()  # This field type is a guess.

    class Meta:
        managed = False
        db_table = 'trader_profiles'


class Transactions(models.Model):
    symbol = models.CharField()
    quantity = models.FloatField()
    price = models.FloatField()
    transaction_type = models.TextField()  # This field type is a guess.
    transaction_date = models.DateTimeField()
    broker_commission = models.FloatField(blank=True, null=True)
    sebon_fee = models.FloatField(blank=True, null=True)
    dp_charge = models.FloatField(blank=True, null=True)
    clearance_fee = models.FloatField(blank=True, null=True)
    total_cost = models.FloatField()
    remarks = models.CharField(blank=True, null=True)
    portfolio_id = models.UUIDField()
    tax_lot_id = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'transactions'
