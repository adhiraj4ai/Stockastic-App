import ast
from rest_framework import serializers
from ..models.strategy import Strategy, StrategyExperiment, StrategySymbolConfig

class StrategyExperimentSerializer(serializers.ModelSerializer):
    strategy_name = serializers.CharField(source='strategy.name', read_only=True)
    is_published = serializers.BooleanField(read_only=True)

    class Meta:
        model = StrategyExperiment
        fields = ['id', 'strategy', 'strategy_name', 'run_type', 'scope_type', 'scope_value', 
                  'start_date', 'end_date', 'parameters', 'metrics', 'batch_id', 'status', 'error_log', 'created_at', 'is_published']

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
        siblings = StrategyExperiment.objects.filter(batch_id=obj.batch_id).exclude(id=obj.id).only('id', 'scope_value')
        return [{'id': s.id, 'symbol': s.scope_value} for s in siblings]

class StrategySerializer(serializers.ModelSerializer):
    default_parameters = serializers.SerializerMethodField()
    published_experiments = serializers.SerializerMethodField()
    pnl_amount = serializers.SerializerMethodField()
    pnl_percent = serializers.SerializerMethodField()
    max_drawdown = serializers.SerializerMethodField()
    sharpe_ratio = serializers.SerializerMethodField()
    win_rate = serializers.SerializerMethodField()

    class Meta:
        model = Strategy
        fields = ['id', 'name', 'description', 'code', 'spec', 'optimization_config', 'created_at', 'is_public',
                  'pnl_amount', 'pnl_percent', 'max_drawdown', 'sharpe_ratio', 'win_rate', 'icon', 'icon_color', 'default_parameters',
                  'published_experiments']
        read_only_fields = ['id', 'created_at', 'published_experiments']

    def _apply_spec(self, validated_data):
        """Keep `spec` and `code` consistent: when a spec is provided, it is the source of
        truth and `code` is rendered from it; if raw `code` is edited without a spec, the
        spec is detached (set null) so the two never silently disagree."""
        from ..services.strategy_framework import spec_to_code, SpecError
        if 'spec' in validated_data and validated_data['spec']:
            try:
                validated_data['code'] = spec_to_code(validated_data['spec'])
            except SpecError as e:
                raise serializers.ValidationError({'spec': str(e)})
        elif 'code' in validated_data:
            validated_data['spec'] = None
        return validated_data

    def create(self, validated_data):
        return super().create(self._apply_spec(validated_data))

    def update(self, instance, validated_data):
        return super().update(instance, self._apply_spec(validated_data))

    def _get_best_published_exp(self, obj):
        if hasattr(obj, '_best_published_exp'):
            return obj._best_published_exp
        
        if hasattr(obj, '_prefetched_objects_cache') and 'experiments' in obj._prefetched_objects_cache:
            published = [e for e in obj.experiments.all() if e.is_published and e.status == 'SUCCESS']
        else:
            published = obj.experiments.filter(is_published=True, status='SUCCESS')
            
        if not published:
            obj._best_published_exp = None
            return None
            
        def get_return(exp):
            m = exp.metrics or {}
            return float(m.get('pnl_percent') or m.get('return_pct') or m.get('Return [%]') or 0)
            
        best = max(published, key=get_return)
        obj._best_published_exp = best
        return best

    def get_pnl_amount(self, obj):
        exp = self._get_best_published_exp(obj)
        if exp:
            return exp.metrics.get('total_pnl') or exp.metrics.get('Equity Final [$]') or 0
        return obj.pnl_amount

    def get_pnl_percent(self, obj):
        exp = self._get_best_published_exp(obj)
        if exp:
            return exp.metrics.get('pnl_percent') or exp.metrics.get('Return [%]') or 0
        return obj.pnl_percent

    def get_max_drawdown(self, obj):
        exp = self._get_best_published_exp(obj)
        if exp:
            return exp.metrics.get('max_drawdown') or exp.metrics.get('Max. Drawdown [%]') or 0
        return obj.max_drawdown

    def get_sharpe_ratio(self, obj):
        exp = self._get_best_published_exp(obj)
        if exp:
            return exp.metrics.get('sharpe_ratio') or exp.metrics.get('Sharpe Ratio') or 0
        return obj.sharpe_ratio

    def get_win_rate(self, obj):
        exp = self._get_best_published_exp(obj)
        if exp:
            return exp.metrics.get('win_rate') or exp.metrics.get('Win Rate [%]') or 0
        return obj.win_rate

    def get_default_parameters(self, obj):
        if not obj.code:
            return {}
        try:
            tree = ast.parse(obj.code)
            params = {}
            for node in tree.body:
                if isinstance(node, ast.ClassDef):
                    is_strategy = any((isinstance(b, ast.Name) and b.id == 'Strategy') for b in node.bases)
                    if is_strategy:
                        for item in node.body:
                            if isinstance(item, ast.Assign):
                                for target in item.targets:
                                    if isinstance(target, ast.Name):
                                        key = target.id
                                        if isinstance(item.value, (ast.Constant, ast.Num, ast.Str)):
                                            val = item.value.value if hasattr(item.value, 'value') else (item.value.n if hasattr(item.value, 'n') else item.value.s)
                                            params[key] = val
            return params
        except Exception:
            return {}

    def get_published_experiments(self, obj):
        experiments = obj.experiments.filter(is_published=True)
        return StrategyExperimentSerializer(experiments, many=True).data

class StrategySymbolConfigSerializer(serializers.ModelSerializer):
    published_params = serializers.SerializerMethodField()
    
    class Meta:
        model = StrategySymbolConfig
        fields = ['id', 'strategy', 'symbol', 'preferred_objective', 'published_params', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_published_params(self, obj):
        result = {}
        for objective in ['win_rate', 'profit', 'balanced']:
            experiment = StrategyExperiment.objects.filter(
                strategy=obj.strategy,
                scope_type='SYMBOL',
                scope_value=obj.symbol,
                is_published=True,
                metrics__objective=objective,
                metrics__period='3Y',
                status='SUCCESS'
            ).order_by('-created_at').first()
            
            if experiment:
                stats = experiment.metrics.get('stats', experiment.metrics)
                return_pct = stats.get('pnl_percent') or stats.get('return_pct') or stats.get('Return [%]') or 0
                sharpe = stats.get('sharpe_ratio') or stats.get('Sharpe Ratio') or 0
                win_rate = stats.get('win_rate') or stats.get('Win Rate [%]') or 0
                max_dd = stats.get('max_drawdown') or stats.get('Max. Drawdown [%]') or 0
                
                result[objective] = {
                    'experiment_id': experiment.id,
                    'parameters': experiment.parameters,
                    'metrics': {
                        'return_pct': float(return_pct) if return_pct else 0,
                        'sharpe_ratio': float(sharpe) if sharpe else 0,
                        'win_rate': float(win_rate) if win_rate else 0,
                        'max_drawdown': float(max_dd) if max_dd else 0,
                    }
                }
        return result
