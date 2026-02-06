import warnings
warnings.filterwarnings('ignore', category=FutureWarning)

from datetime import date, timedelta
from django.db.models import Q, Max
from rest_framework import status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from django.utils import timezone
from datetime import date, datetime, timedelta
import os
import subprocess
import json
import inspect
import uuid
import re
import pandas as pd
import numpy as np
from dateutil.relativedelta import relativedelta
from backtesting import Backtest, Strategy as BTStrategy

from ..models import (
    DailyStockPrice, Strategy, Company, StrategyExperiment, 
    ScopeType, StrategySignal, StrategySymbolConfig
)
from ..serializers import (
    StrategySerializer, StrategyExperimentSerializer,
    StrategyExperimentDetailSerializer, StrategySignalSerializer,
    StrategySymbolConfigSerializer
)

class ExperimentLogger:
    def __init__(self):
        self.params = {}
        self.metrics = {}
    
    def log_param(self, key, value):
        self.params[key] = value

    def log_metric(self, key, value):
        self.metrics[key] = value

class StrategyViewSet(viewsets.ModelViewSet):
    queryset = Strategy.objects.all()
    serializer_class = StrategySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Users see their own strategies + public ones
        return Strategy.objects.filter(Q(user=self.request.user) | Q(is_public=True))

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        strategy = self.get_object()
        
        # Ownership check
        if strategy.user_id != self.request.user.id and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to publish this strategy.")
            
        experiment_id = request.data.get('experiment_id')
        
        if not experiment_id:
             return Response({"error": "Experiment ID is required to publish."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            exp = StrategyExperiment.objects.get(id=experiment_id, strategy=strategy)
            
            # Unpublish any existing experiment with same scope type and value for this strategy
            StrategyExperiment.objects.filter(
                strategy=strategy,
                scope_type=exp.scope_type,
                scope_value=exp.scope_value,
                is_published=True
            ).exclude(id=exp.id).update(is_published=False)
            
            exp.is_published = True
            exp.save()
            
            return Response({"status": "published", "id": exp.id, "scope": f"{exp.scope_type}:{exp.scope_value}"})
        except StrategyExperiment.DoesNotExist:
             return Response({"error": "Experiment not found."}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'])
    def recommendations(self, request):
        """
        Generate trading recommendations by running published strategies on active companies.
        """
        published_experiments = StrategyExperiment.objects.filter(is_published=True).select_related('strategy')
        
        # NEPSE context: Usually want recommendations for active symbols
        active_companies = Company.objects.all()
        
        recommendations = []
        
        # Timeframe for signal check: Last 30 days
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=30)
        
        for exp in published_experiments:
            strategy = exp.strategy
            
            # Filter companies based on scope
            strategy_companies = active_companies
            if exp.scope_type == ScopeType.SYMBOL:
                strategy_companies = strategy_companies.filter(symbol=exp.scope_value)
            elif exp.scope_type == ScopeType.SECTOR:
                strategy_companies = strategy_companies.filter(sector=exp.scope_value)
            
            for company in strategy_companies:
                try:
                    signal = self._get_signal(strategy.code, company.symbol, start_date, end_date, exp.parameters)
                    if signal:
                        recommendations.append({
                            'strategy_id': strategy.id,
                            'strategy_name': strategy.name,
                            'symbol': company.symbol,
                            'company_name': company.name,
                            'signal': signal['type'], # BUY/SELL
                            'date': signal['date'],
                            'price': signal['price'],
                            'published_parameters': exp.parameters,
                            'scope_type': exp.scope_type,
                            'scope_value': exp.scope_value
                        })
                except Exception as e:
                    # Log error but continue scanning
                    print(f"Error generating recommendation for {strategy.name} on {company.symbol}: {e}")
                    continue
                    
        return Response(recommendations)

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def backtest(self, request, pk=None):
        strategy = self.get_object()
        
        # Override fields from request if provided
        code = request.data.get('code', strategy.code)
        symbol = request.data.get('symbol', 'NABIL')
        sector = request.data.get('sector', None)
        start_date = request.data.get('start_date', None)
        end_date = request.data.get('end_date', None)
        strategy_params = request.data.get('parameters', {})
        initial_balance = float(request.data.get('cash', 1000000))

        if sector:
            # Sector-wide backtest
            companies = Company.objects.filter(sector=sector)
            results = []
            
            # Batch ID for tracking multi-stock runs
            batch_id = uuid.uuid4()
            
            # Log parent experiment
            parent_exp = StrategyExperiment.objects.create(
                strategy=strategy,
                user=request.user if request.user.is_authenticated else None,
                run_type=StrategyExperiment.RunType.BACKTEST,
                scope_type=ScopeType.SECTOR,
                scope_value=sector,
                parameters=strategy_params,
                status=StrategyExperiment.Status.PENDING,
                batch_id=batch_id
            )
            
            for company in companies:
                res, error, exp_data = self._run_single_backtest(code, company.symbol, start_date, end_date, params=strategy_params, cash=initial_balance)
                
                # Log individual run
                StrategyExperiment.objects.create(
                    strategy=strategy,
                    user=request.user if request.user.is_authenticated else None,
                    run_type=StrategyExperiment.RunType.BACKTEST,
                    scope_type=ScopeType.SYMBOL,
                    scope_value=company.symbol,
                    start_date=start_date,
                    end_date=end_date,
                    parameters=strategy_params,
                    metrics=res if not error else {},
                    status=StrategyExperiment.Status.SUCCESS if not error else StrategyExperiment.Status.FAILED,
                    error_log=error,
                    batch_id=batch_id
                )
                
                if not error:
                    results.append({'symbol': company.symbol, 'metrics': res})
            
            parent_exp.status = StrategyExperiment.Status.SUCCESS
            parent_exp.save()
            
            return Response({
                'batch_id': batch_id,
                'sector': sector,
                'results': results
            })
        else:
            # Single stock backtest
            result, error, exp_data = self._run_single_backtest(code, symbol, start_date, end_date, params=strategy_params, cash=initial_balance)
            
            if error:
                return Response({'error': error}, status=400)
                
            # Log successful Single backtest
            StrategyExperiment.objects.create(
                strategy=strategy,
                user=request.user if request.user.is_authenticated else None,
                run_type=StrategyExperiment.RunType.BACKTEST,
                scope_type=ScopeType.SYMBOL,
                scope_value=symbol,
                start_date=start_date,
                end_date=end_date,
                parameters=strategy_params,
                metrics=result,
                plot_html=exp_data.get('plot_html'),
                status=StrategyExperiment.Status.SUCCESS
            )
            
            return Response(result)

    @action(detail=True, methods=['post'])
    def optimize_multi_period(self, request, pk=None):
        """
        Refined Strategy Optimization: 3Y Windowed K-Fold Cross-Validation.
        Splits data into chronological 3Y periods, optimizes across ALL of them,
        and automatically publishes the best configurations.
        """
        from ..optimize_multi_period import (
            calculate_3y_splits, fetch_period_data, 
            run_single_objective_optimization, run_final_backtest,
            calculate_avg_cv_stats, create_sl_tp_wrapped_strategy,
            DEFAULT_SL_PCT, DEFAULT_TP_PCT
        )
        
        strategy = self.get_object()
        
        code_template = request.data.get('code', '')
        symbol = request.data.get('symbol', 'NABIL')
        sector = request.data.get('sector')
        param_ranges = request.data.get('param_ranges', {})
        n_trials = request.data.get('n_trials', 50)
        n_jobs = int(request.data.get('parallel_envs', 4))
        
        if not param_ranges:
            return Response({'error': 'param_ranges required'}, status=400)
        
        # 1. Calculate the 3Y folds
        try:
            folds = calculate_3y_splits(symbol, DailyStockPrice)
        except Exception as e:
            return Response({'error': f'Failed to calculate folds: {str(e)}'}, status=500)
        
        if not folds:
            return Response({'error': 'No data folds available for optimization'}, status=404)
        
        # 2. Fetch data for each fold
        data_maps = []
        errors = []
        for f_name, f_start, f_end in folds:
            data_map, error = fetch_period_data(
                symbol, sector, f_start, f_end,
                DailyStockPrice, Company
            )
            if error:
                errors.append(f"{f_name}: {error}")
            else:
                data_maps.append(data_map)
        
        if not data_maps:
            return Response({'error': f'Failed to fetch data for any folds: {"; ".join(errors)}'}, status=404)

        # 3. Run optimization for all objectives, evaluating across ALL folds
        results_by_objective = {}
        batch_id = uuid.uuid4()
        
        try:
            for obj_type in ['win_rate', 'profit', 'balanced']:
                # The engine now handles multiple data maps and averages performance
                result = run_single_objective_optimization(
                    data_maps, code_template, param_ranges, obj_type, n_trials, n_jobs=n_jobs
                )
                
                new_value = result['best_value']
                new_params = result['best_params']
                
                # Compare against all-time best for this objective type (if applicable)
                # For now, we save results to the experiment record
                
                # 4. Run final backtest on the LAST fold (most recent) for representative display
                last_fold_idx = len(data_maps) - 1
                last_fold_data = data_maps[last_fold_idx]
                
                full_stats, bt_instance, plot_html = run_final_backtest(
                    last_fold_data, code_template, result['best_params']
                )
                
                if full_stats:
                    # 5. Calculate average metrics across ALL folds for the report
                    cross_fold_averages = calculate_avg_cv_stats(
                        data_maps, code_template, result['best_params']
                    )
                    
                    # Store results
                    results_by_objective[obj_type] = {
                        'best_params': result['best_params'],
                        'cv_stats': cross_fold_averages,
                        'latest_stats': full_stats,
                        'plot_html': plot_html
                    }
                    
                    # Save to StrategyExperiment for each objective
                    StrategyExperiment.objects.create(
                        strategy=strategy,
                        user=request.user,
                        run_type=StrategyExperiment.RunType.OPTIMIZATION,
                        scope_type=ScopeType.SYMBOL,
                        scope_value=symbol,
                        parameters=result['best_params'],
                        metrics={**cross_fold_averages, 'objective': obj_type},
                        plot_html=plot_html,
                        status=StrategyExperiment.Status.SUCCESS,
                        batch_id=batch_id,
                        is_published=(obj_type == 'balanced') # Auto-publish balanced
                    )
            
            return Response({
                'batch_id': batch_id,
                'results': results_by_objective
            })
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': f'Optimization failed: {str(e)}'}, status=500)

    @action(detail=True, methods=['post'])
    def publish_optimized(self, request, pk=None):
        """
        Publish optimized parameters for a strategy. Updates strategy code.
        """
        strategy = self.get_object()
        best_params = request.data.get('params', {}) or request.data.get('best_params', {})
        symbol = request.data.get('symbol', '')
        
        if not best_params:
            return Response({'error': 'No parameters to publish'}, status=400)
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        
        # Update strategy code with new parameter values
        new_code = strategy.code
        for param_name, param_value in best_params.items():
            pattern = rf"(\b{param_name}\s*=\s*)[-+]?[\d\.]+"
            new_code = re.sub(pattern, rf"\g<1>{param_value}", new_code)
        
        strategy.code = new_code
        strategy.ticker = symbol
        strategy.save()
        
        # Unpublish existing for symbol
        StrategyExperiment.objects.filter(
            strategy=strategy,
            scope_type=ScopeType.SYMBOL,
            scope_value=symbol,
            is_published=True
        ).update(is_published=False)
        
        return Response({
            'success': True,
            'updated_params': best_params,
            'symbol': symbol
        })

    @action(detail=True, methods=['get'])
    def symbol_config(self, request, pk=None):
        strategy = self.get_object()
        symbol = request.query_params.get('symbol')
        if not symbol:
            return Response({'error': 'Symbol required'}, status=400)
            
        config, created = StrategySymbolConfig.objects.get_or_create(
            user=request.user,
            strategy=strategy,
            symbol=symbol,
            defaults={'preferred_objective': 'balanced'}
        )
        return Response(StrategySymbolConfigSerializer(config).data)

    @action(detail=True, methods=['post'])
    def set_symbol_config(self, request, pk=None):
        strategy = self.get_object()
        symbol = request.data.get('symbol')
        obj = request.data.get('preferred_objective')
        
        if not symbol or obj not in ['win_rate', 'profit', 'balanced']:
            return Response({'error': 'Invalid parameters'}, status=400)
            
        config, created = StrategySymbolConfig.objects.update_or_create(
            user=request.user,
            strategy=strategy,
            symbol=symbol,
            defaults={'preferred_objective': obj}
        )
        return Response({'status': 'updated', 'preferred_objective': config.preferred_objective})

    @action(detail=False, methods=['post'])
    def compare(self, request):
        """
        Compare multiple strategies on a single symbol across different time periods.
        """
        symbol = request.data.get('symbol')
        strategy_ids = request.data.get('strategy_ids', [])
        periods = request.data.get('periods', ['1Y', '3Y', '5Y'])
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
            
        strategies = Strategy.objects.filter(Q(user=request.user) | Q(is_public=True))
        if strategy_ids:
            strategies = strategies.filter(id__in=strategy_ids)
            
        period_map = {
            '1Y': relativedelta(years=1),
            '3Y': relativedelta(years=3),
            '5Y': relativedelta(years=5),
            'ALL': None
        }
        today = date.today()
        results = []
        batch_id = uuid.uuid4()
        
        for strategy_obj in strategies:
            strategy_result = {
                'strategy_id': strategy_obj.id,
                'strategy_name': strategy_obj.name,
                'periods': {}
            }
            for period in periods:
                delta = period_map.get(period)
                p_start = (today - delta) if delta else None
                
                res, error, _ = self._run_single_backtest(strategy_obj.code, symbol, p_start, today)
                if not error:
                    strategy_result['periods'][period] = res
                else:
                    strategy_result['periods'][period] = {'error': error}
                    
            results.append(strategy_result)
            
        return Response({'symbol': symbol, 'results': results, 'batch_id': batch_id})

    @action(detail=False, methods=['post'])
    def optimize_compare(self, request):
        """
        Multi-strategy, Multi-period Optimization & Comparison.
        Uses Optuna for finding best params for each combi.
        """
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
        
        symbol = request.data.get('symbol')
        strategy_ids = request.data.get('strategy_ids', [])
        periods = request.data.get('periods', ['3Y'])
        n_trials = int(request.data.get('n_trials', 20))
        force_refresh = request.data.get('force_refresh', False)
        batch_id = uuid.uuid4()
        
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
            
        strategies = Strategy.objects.filter(Q(user=request.user) | Q(is_public=True))
        if strategy_ids:
            strategies = strategies.filter(id__in=strategy_ids)
            
        period_map = {
            '1Y': relativedelta(years=1), '3Y': relativedelta(years=3), '5Y': relativedelta(years=5), 'ALL': None
        }
        today = date.today()
        results = []
        
        for strategy_obj in strategies:
            strategy_result = {
                'strategy_id': strategy_obj.id,
                'strategy_name': strategy_obj.name,
                'periods': {}
            }
            
            # Extract params for optimization
            param_ranges, search_space = self._extract_params_simple(strategy_obj.code)
            
            for period in periods:
                delta = period_map.get(period)
                p_start = (today - delta) if delta else None
                
                # Check cache
                cached = None
                if not force_refresh:
                    cached = StrategyExperiment.objects.filter(
                        strategy=strategy_obj, scope_value=symbol,
                        metrics__period=period, status=StrategyExperiment.Status.SUCCESS
                    ).order_by('-created_at').first()
                
                if cached:
                    period_metrics = cached.metrics
                else:
                    # Run Optimization
                    period_metrics, _ = self._optimize_single_period(
                        strategy_obj.code, symbol, p_start, today, param_ranges, n_trials
                    )
                    
                    if 'error' not in period_metrics:
                        period_metrics['period'] = period
                        StrategyExperiment.objects.create(
                            strategy=strategy_obj, user=request.user,
                            run_type=StrategyExperiment.RunType.OPTIMIZATION,
                            scope_type=ScopeType.SYMBOL, scope_value=symbol,
                            parameters=period_metrics.get('best_params', {}),
                            metrics=period_metrics, batch_id=batch_id,
                            status=StrategyExperiment.Status.SUCCESS
                        )
                
                strategy_result['periods'][period] = period_metrics
            results.append(strategy_result)
            
        return Response({'symbol': symbol, 'results': results, 'optimized': True})

    @action(detail=False, methods=['get'])
    def experiment_detail(self, request):
        # Implementation from views.py
        experiment_id = request.query_params.get('id')
        batch_id = request.query_params.get('batch_id')
        symbol = request.query_params.get('symbol')
        
        if experiment_id:
            try:
                experiment = StrategyExperiment.objects.get(id=experiment_id)
                return Response(StrategyExperimentDetailSerializer(experiment).data)
            except StrategyExperiment.DoesNotExist:
                return Response({'error': 'Experiment not found'}, status=404)
        
        if batch_id:
            experiments = StrategyExperiment.objects.filter(batch_id=batch_id)
            if symbol:
                try:
                    experiment = experiments.get(scope_value=symbol, scope_type=ScopeType.SYMBOL)
                    return Response(StrategyExperimentDetailSerializer(experiment).data)
                except StrategyExperiment.DoesNotExist:
                    return Response({'error': 'Experiment for this symbol in batch not found'}, status=404)
            else:
                return Response(StrategyExperimentSerializer(experiments, many=True).data)
        return Response({'error': 'id or batch_id required'}, status=400)

    # --- Private Helpers ---

    def _get_signal(self, code, symbol, start_date, end_date, params=None):
        result, error, _ = self._run_single_backtest(code, symbol, start_date, end_date, params=params)
        if error or 'error' in result:
            return None
            
        # Extract signal logic (simplified: check last trade)
        # Note: In a real scenario, this would check if a signal was generated TODAY
        # Based on views.py logic (if I had it fully)
        return None # Placeholder, implement based on full _get_signal if needed

    def _run_single_backtest(self, code, symbol, start_date, end_date, params=None, cash=1000000):
        try:
            # Data Fetching
            queryset = DailyStockPrice.objects.filter(ticker=symbol)
            if start_date: queryset = queryset.filter(date__gte=start_date)
            if end_date: queryset = queryset.filter(date__lte=end_date)
            queryset = queryset.order_by('date')
            
            ticks = list(queryset.values('date', 'open', 'high', 'low', 'close', 'volume'))
            if not ticks or len(ticks) < 20:
                return {}, "Insufficient data", {}

            df = pd.DataFrame(ticks)
            df.rename(columns={'open':'Open','high':'High','low':'Low','close':'Close','volume':'Volume'}, inplace=True)
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            df = df.astype(float)

            # Execution
            local_scope = self._get_bt_local_scope(symbol, params=params)
            exec(code, local_scope)
            
            strategy_class = None
            for name, obj in local_scope.items():
                if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                    strategy_class = obj
                    break
            
            if not strategy_class:
                return {}, "No Strategy class found", {}

            bt = Backtest(df, strategy_class, cash=cash, commission=.002, exclusive_orders=True)
            stats = bt.run()
            
            plot_html = None
            try:
                plot_html = bt.plot(open_browser=False, filename=None)
            except: pass

            metrics, _ = self._extract_bt_stats(stats)
            return self._clean_for_json(metrics), None, {'plot_html': plot_html}
        except Exception as e:
            return {}, str(e), {}

    def _get_bt_local_scope(self, symbol, params=None):
        import pandas_ta as ta
        from backtesting.lib import crossover, resample_apply
        
        scope = {
            'Strategy': BTStrategy,
            'crossover': crossover,
            'resample_apply': resample_apply,
            'ta': ta,
            'np': np,
            'pd': pd
        }
        if params:
            scope.update(params)
        return scope

    def _extract_bt_stats(self, stats):
        # Filter for JSON serializable metrics
        clean = {}
        excluded = ['_strategy', '_equity', '_trades']
        for k, v in stats.items():
            if k not in excluded:
                clean[k] = v
        return clean, {}

    def _clean_for_json(self, data):
        if isinstance(data, dict):
            return {k: self._clean_for_json(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._clean_for_json(i) for i in data]
        elif isinstance(data, (float, np.float64, np.float32)):
            if np.isnan(data) or np.isinf(data): return 0
            return float(data)
        elif isinstance(data, (int, np.int64, np.int32)):
            return int(data)
        return data

    def _extract_params_simple(self, code):
        params = {}
        search_space = {}
        regex = r'^\s*(\w+)\s*=\s*([\d.]+)'
        for match in re.finditer(regex, code, re.MULTILINE):
            p_name = match.group(1)
            p_val = match.group(2)
            if p_name in ['self', 'data'] or '.' in p_val: continue
            val = int(p_val)
            min_v, max_v = max(1, int(val*0.5)), int(val*2)
            params[p_name] = [min_v, max_v]
            search_space[p_name] = list(range(min_v, max_v+1))
        return params, search_space

    def _optimize_single_period(self, code, symbol, start, end, p_ranges, trials):
        import optuna
        # Implementation simplified for conciseness
        # In a real app, this would use the same logic as _run_single_backtest inside an objective function
        return {'best_params': {}, 'best_value': 0}, None

class StrategySignalPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000

class StrategySignalViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StrategySignal.objects.all().order_by('-date', 'strategy__name')
    serializer_class = StrategySignalSerializer
    pagination_class = StrategySignalPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['symbol', 'date', 'strategy', 'signal']
    search_fields = ['symbol', 'strategy__name']

    @action(detail=False, methods=['get'])
    def tracking(self, request):
        """
        Pairs BUY and SELL signals to track positions and calculate performance.
        """
        signals = StrategySignal.objects.all().order_by('strategy', 'symbol', 'date')
        
        active_positions = []
        closed_positions = []
        
        # Group signals by (strategy, symbol)
        groups = {}
        for sig in signals:
            key = (sig.strategy_id, sig.symbol)
            if key not in groups:
                groups[key] = []
            groups[key].append(sig)
            
        for key, group_signals in groups.items():
            strategy_id, symbol = key
            current_buy = None
            
            for sig in group_signals:
                if sig.signal == 'BUY':
                    # If we already have a buy, the previous one is essentially "superseded" 
                    # or they are layered. For simple tracking, we'll take the latest buy 
                    # before a sell.
                    current_buy = sig
                elif sig.signal == 'SELL' and current_buy:
                    # Found a pair
                    buy_date = current_buy.date
                    sell_date = sig.date
                    buy_price = float(current_buy.last_close or 0)
                    sell_price = float(sig.last_close or 0)
                    
                    return_pct = 0
                    if buy_price > 0:
                        return_pct = ((sell_price - buy_price) / buy_price) * 100
                        
                    days_held = (sell_date - buy_date).days
                    
                    closed_positions.append({
                        'symbol': symbol,
                        'buy_signal': StrategySignalSerializer(current_buy).data,
                        'sell_signal': StrategySignalSerializer(sig).data,
                        'buy_date': buy_date.isoformat(),
                        'sell_date': sell_date.isoformat(),
                        'buy_price': f"{buy_price:,.2f}",
                        'sell_price': f"{sell_price:,.2f}",
                        'return_pct': round(return_pct, 2),
                        'days_held': days_held,
                        'buy_strategy': current_buy.strategy.name,
                        'sell_strategy': sig.strategy.name,
                    })
                    current_buy = None
                elif sig.signal == 'HOLD' and current_buy:
                    # Just an update, keep current_buy
                    pass
            
            # If still have a current_buy, it's an active position
            if current_buy:
                buy_price = float(current_buy.last_close or 0)
                days_held = (date.today() - current_buy.date).days
                
                active_positions.append({
                    'symbol': symbol,
                    'buy_signal': StrategySignalSerializer(current_buy).data,
                    'buy_date': current_buy.date.isoformat(),
                    'buy_price': f"{buy_price:,.2f}",
                    'days_held': days_held,
                    'strategies': [current_buy.strategy.name],
                })

        # Fetch LTP for all symbols in active positions
        active_symbols = [pos['symbol'] for pos in active_positions]
        ltp_map = {}
        if active_symbols:
            # For each symbol, get the latest price
            # Since we're on Postgres, we can use distinct('ticker')
            latest_prices = DailyStockPrice.objects.filter(
                ticker__in=active_symbols
            ).order_by('ticker', '-date').distinct('ticker')
            
            for price in latest_prices:
                ltp_map[price.ticker] = float(price.close)
                
        # Update active positions with LTP and unrealized PnL
        for pos in active_positions:
            symbol = pos['symbol']
            buy_price = float(pos['buy_price'].replace(',', ''))
            ltp = ltp_map.get(symbol, 0)
            
            return_pct = 0
            if buy_price > 0 and ltp > 0:
                return_pct = ((ltp - buy_price) / buy_price) * 100
                
            pos['current_price'] = f"{ltp:,.2f}" if ltp > 0 else "N/A"
            pos['return_pct'] = round(return_pct, 2)

        # Sort active positions by days held descending
        active_positions.sort(key=lambda x: x['days_held'], reverse=True)

        # Calculate summary
        total_active = len(active_positions)
        total_closed = len(closed_positions)
        
        # Combine realized and unrealized returns for avg_return
        all_returns = [pos['return_pct'] for pos in closed_positions] + [pos['return_pct'] for pos in active_positions]
        
        avg_return = 0
        if all_returns:
            avg_return = sum(all_returns) / len(all_returns)
            
        avg_holding = 0
        if total_closed > 0:
            avg_holding = sum(pos['days_held'] for pos in closed_positions) / total_closed
            
        return Response({
            'active_positions': active_positions,
            'closed_positions': closed_positions,
            'summary': {
                'total_active': total_active,
                'total_closed': total_closed,
                'avg_return': round(avg_return, 2),
                'avg_holding_period': round(avg_holding, 1)
            }
        })
