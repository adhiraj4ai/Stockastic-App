from rest_framework import serializers
import ast
from .models import DailyStockPrice, DailyFloorsheet, PortfolioItem, PortfolioTransaction, StockFundamental, PortfolioAccount, Dividend, FinancialReport, Strategy, Company, WatchlistItem, Notification, StrategyExperiment

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
                  'stop_loss_price', 'target_price', 'target_price_2', 'target_price_3', 'thesis', 'strategy_type']
        read_only_fields = ['id', 'purchased_at']

class PortfolioTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioTransaction
        fields = '__all__'
        read_only_fields = ['id', 'user', 'amount', 'receivable_amount', 'commission', 'sebon_fee', 'dp_charge', 'cgt', 'created_at']





class StrategySerializer(serializers.ModelSerializer):
    default_parameters = serializers.SerializerMethodField()

    class Meta:
        model = Strategy
        fields = ['id', 'name', 'description', 'code', 'created_at', 'is_public', 
                  'pnl_amount', 'pnl_percent', 'max_drawdown', 'sharpe_ratio', 'win_rate', 'default_parameters',
                  'is_published_for_recommendation', 'published_parameters', 'published_at',
                  'published_scope_type', 'published_scope_value', 'published_experiment']
        read_only_fields = ['id', 'created_at', 'published_at', 'is_published_for_recommendation', 'published_parameters',
                            'published_scope_type', 'published_scope_value', 'published_experiment']

    def get_default_parameters(self, obj):
        if not obj.code:
            return {}
        
        try:
            tree = ast.parse(obj.code)
            params = {}
            
            # Find the Strategy class definition
            for node in tree.body:
                if isinstance(node, ast.ClassDef):
                    # Check if it inherits from Strategy (simple check)
                    is_strategy = any(
                        (isinstance(b, ast.Name) and b.id == 'Strategy') 
                        for b in node.bases
                    )
                    
                    if is_strategy:
                        # Extract class-level assignments
                        for item in node.body:
                            if isinstance(item, ast.Assign):
                                # Check targets (variables being assigned)
                                for target in item.targets:
                                    if isinstance(target, ast.Name):
                                        key = target.id
                                        # only extract simple literals
                                        if isinstance(item.value, ast.Constant):
                                            params[key] = item.value.value
                                        # for older python < 3.8
                                        elif isinstance(item.value, ast.Num):
                                            params[key] = item.value.n
                                        elif isinstance(item.value, ast.Str):
                                            params[key] = item.value.s
            return params
        except Exception:
            return {}

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ['symbol', 'name', 'sector']

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

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'type', 'ticker', 'read', 'created_at']
        read_only_fields = ['id', 'created_at']

class StrategyExperimentSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source='strategy.name', read_only=True)
    is_published = serializers.SerializerMethodField()

    class Meta:
        model = StrategyExperiment
        fields = ['id', 'strategy', 'strategy_name', 'run_type', 'scope_type', 'scope_value', 
                  'start_date', 'end_date', 'parameters', 'metrics', 'batch_id', 'status', 'error_log', 'created_at', 'is_published']

    def get_is_published(self, obj):
        # Check if this experiment is the currently published one for its strategy
        try:
            return obj.id == obj.strategy.published_experiment_id
        except Exception:
            return False

class StrategyExperimentDetailSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source='strategy.name', read_only=True)
    siblings = serializers.SerializerMethodField()

    class Meta:
        model = StrategyExperiment
        fields = ['id', 'strategy', 'strategy_name', 'run_type', 'scope_type', 'scope_value', 
                  'start_date', 'end_date', 'parameters', 'metrics', 'batch_id', 'plot_html', 'status', 'error_log', 'created_at', 'siblings']

    def get_siblings(self, obj):
        if not obj.batch_id:
            return []
        
        # Return list of siblings (id and symbol/value) to allow switching
        siblings = StrategyExperiment.objects.filter(batch_id=obj.batch_id).exclude(id=obj.id).only('id', 'scope_value')
        return [{'id': s.id, 'symbol': s.scope_value} for s in siblings]
