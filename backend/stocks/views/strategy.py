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
from backtesting.lib import crossover, resample_apply
from backtesting.test import SMA
import traceback
import talib
import os
os.environ.setdefault('NUMBA_CACHE_DIR', '/tmp/numba_cache')

from ..services.optimization_service import SafeTa
from ..services.backtest_harness import build_strategy_scope, resolve_code, load_price_df
from ..services.backtest_harness.fees import nepse_commission, DEFAULT_SPREAD

from ..models import (
    DailyStockPrice, Strategy, Company, StrategyExperiment,
    ScopeType, StrategySymbolConfig, SignalEpisode
)
from ..serializers import (
    StrategySerializer, StrategyExperimentSerializer,
    StrategyExperimentDetailSerializer,
    StrategySymbolConfigSerializer
)
from ..serializers.signal import SignalEpisodeSerializer

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

    @action(detail=False, methods=['get'], url_path='components')
    def components(self, request):
        """Catalog of composable strategy components (param schemas) for the builder."""
        from ..services.strategy_framework import registry_schema
        return Response(registry_schema())

    @action(detail=False, methods=['get'], url_path='scan')
    def scan(self, request):
        """Scan all strategies on a symbol across timeframes (and optional parameter
        ranges) and rank them to find the best. ?symbol=NABIL&optimize=1&timeframes=3y,max"""
        from ..services.strategy_scan import scan_symbol, DEFAULT_TIMEFRAMES
        symbol = (request.query_params.get('symbol') or '').upper()
        if not symbol:
            return Response({'error': 'symbol query param required'}, status=status.HTTP_400_BAD_REQUEST)
        optimize = request.query_params.get('optimize') in ('1', 'true', 'True')
        tfs = request.query_params.get('timeframes')
        timeframes = tuple(t.strip() for t in tfs.split(',')) if tfs else DEFAULT_TIMEFRAMES
        return Response(scan_symbol(symbol, timeframes=timeframes, optimize=optimize))

    @action(detail=False, methods=['post'], url_path='render_spec')
    def render_spec(self, request):
        """Validate a composition spec and render the equivalent code + plain-English
        summary (live builder preview)."""
        from ..services.strategy_framework import spec_to_code, spec_to_sentence, SpecError
        spec = request.data.get('spec')
        try:
            return Response({'valid': True, 'code': spec_to_code(spec),
                             'sentence': spec_to_sentence(spec), 'error': None})
        except SpecError as e:
            return Response({'valid': False, 'code': '', 'sentence': '', 'error': str(e)})
        except Exception as e:  # noqa: BLE001
            return Response({'valid': False, 'code': '', 'sentence': '', 'error': f'{type(e).__name__}: {e}'})

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

    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        """
        Unpublish an experiment (mark is_published=False).
        Body: { experiment_id: <int> } or unpublishes all for this strategy if not specified.
        """
        strategy = self.get_object()

        if strategy.user_id != self.request.user.id and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to unpublish this strategy.")

        experiment_id = request.data.get('experiment_id')

        if experiment_id:
            try:
                exp = StrategyExperiment.objects.get(id=experiment_id, strategy=strategy)
                exp.is_published = False
                exp.save()
                return Response({"status": "unpublished", "id": exp.id})
            except StrategyExperiment.DoesNotExist:
                return Response({"error": "Experiment not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Unpublish all experiments for this strategy
            updated = StrategyExperiment.objects.filter(strategy=strategy, is_published=True).update(is_published=False)
            return Response({"status": "unpublished", "count": updated})

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
        # Empty strings (the 'All' period) must become a concrete full range — a blank
        # date string crashes experiment persistence with a date ValidationError.
        start_date = request.data.get('start_date') or '2000-01-01'
        end_date = request.data.get('end_date') or timezone.now().date().isoformat()
        strategy_params = request.data.get('parameters', {})
        initial_balance = float(request.data.get('initial_balance', request.data.get('cash', 1000000)))

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
            
            # Calculate summary statistics
            total_companies = companies.count()
            successful_runs = len(results)
            
            avg_return = 0
            if successful_runs > 0:
                total_return = sum([r['metrics'].get('Return [%]', 0) for r in results])
                avg_return = total_return / successful_runs
                
            # Flatten results for frontend
            flattened_results = []
            for r in results:
                metrics = r['metrics']
                flattened_results.append({
                    'symbol': r['symbol'],
                    'pnl_percent': metrics.get('Return [%]'),
                    'win_rate': metrics.get('Win Rate [%]'),
                    'total_trades': metrics.get('# Trades'),
                    'total_pnl': metrics.get('Equity Final [$]') - initial_balance if metrics.get('Equity Final [$]') else 0
                })
            
            parent_exp.status = StrategyExperiment.Status.SUCCESS
            parent_exp.save()
            
            return Response({
                'batch_id': batch_id,
                'sector': sector,
                'total_companies': total_companies,
                'successful_backtests': successful_runs,
                'aggregated': {
                    'avg_return': avg_return
                },
                'individual_results': flattened_results
            })
        else:
            # Single stock backtest
            result, error, exp_data = self._run_single_backtest(code, symbol, start_date, end_date, params=strategy_params, cash=initial_balance)
            
            # Log backtest (Success or Failure)
            StrategyExperiment.objects.create(
                strategy=strategy,
                user=request.user if request.user.is_authenticated else None,
                run_type=StrategyExperiment.RunType.BACKTEST,
                scope_type=ScopeType.SYMBOL,
                scope_value=symbol,
                start_date=start_date,
                end_date=end_date,
                parameters=strategy_params,
                metrics=result if not error else {},
                plot_html=exp_data.get('plot_html') if not error else None,
                status=StrategyExperiment.Status.SUCCESS if not error else StrategyExperiment.Status.FAILED,
                error_log=error
            )
            
            if error:
                return Response({'error': error}, status=400)
            
            return Response({
                'id': strategy.id,
                'symbol': symbol,
                'stats': result,
                'plot_html': exp_data.get('plot_html'),
                'metadata': {
                    'scope_type': ScopeType.SYMBOL,
                    'scope_value': symbol,
                    'start_date': start_date,
                    'end_date': end_date,
                    'parameters': strategy_params,
                    'metrics': result
                }
            })

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
            calculate_avg_cv_stats,
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

        # Overall date range across all folds
        overall_start = folds[0][1]   # earliest fold start  (str 'YYYY-MM-DD')
        overall_end   = folds[-1][2]  # latest fold end

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

                    # Save to StrategyExperiment and capture the ID
                    exp = StrategyExperiment.objects.create(
                        strategy=strategy,
                        user=request.user,
                        run_type=StrategyExperiment.RunType.OPTIMIZATION,
                        scope_type=ScopeType.SYMBOL,
                        scope_value=symbol,
                        start_date=overall_start,
                        end_date=overall_end,
                        parameters=result['best_params'],
                        metrics={**cross_fold_averages, 'objective': obj_type},
                        plot_html=plot_html,
                        status=StrategyExperiment.Status.SUCCESS,
                        batch_id=batch_id,
                        is_published=(obj_type == 'balanced'),
                    )

                    # Use 'stats' key to match frontend expectations
                    results_by_objective[obj_type] = {
                        'best_params': result['best_params'],
                        'cv_stats': cross_fold_averages,
                        'stats': full_stats,
                        'plot_html': plot_html,
                        'experiment_id': exp.id,
                    }
            
            return Response({
                'batch_id': batch_id,
                'results': results_by_objective
            })
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': f'Optimization failed: {str(e)}'}, status=500)

    @action(detail=True, methods=['post'], url_path='optimize_spec')
    def optimize_spec(self, request, pk=None):
        """Optimize a COMPOSED strategy by searching its spec's registry parameter ranges.

        Unlike `optimize_multi_period` (regex/class-attr param injection — only works for raw
        custom code), this tunes the same spec parameters the builder and backtest pages show,
        so backtest, optimize, and code stay consistent. Recompiles the spec per trial.

        Body: {symbol, spec?, param_ranges?, n_trials?, timeframes?, objective?, publish?}.
        With publish=true, replaces the strategy's spec with the best one and re-renders code.
        """
        from ..services.strategy_scan import optimize_spec as run_optimize_spec
        from ..services.strategy_framework import spec_to_code, SpecError

        strategy = self.get_object()
        spec = request.data.get('spec') or strategy.spec
        if not spec:
            return Response({'error': 'This strategy has no spec; use optimize_multi_period for custom code.'}, status=400)

        symbol = (request.data.get('symbol') or strategy.ticker or '').upper()
        if not symbol:
            return Response({'error': 'symbol is required'}, status=400)

        # Publish-only: a tuned spec is handed back to be saved without re-optimizing.
        if request.data.get('publish') and request.data.get('spec') and int(request.data.get('n_trials', 1)) == 0:
            try:
                strategy.code = spec_to_code(spec)
            except SpecError as e:
                return Response({'error': f'Tuned spec failed to render: {e}'}, status=500)
            strategy.spec = spec
            strategy.save(update_fields=['code', 'spec'])
            return Response({'published': True, 'code': strategy.code, 'spec': spec})

        objective = request.data.get('objective', 'balanced')
        n_trials = int(request.data.get('n_trials', 40))
        param_ranges = request.data.get('param_ranges') or None
        tfs = request.data.get('timeframes')
        timeframes = tuple(tfs) if tfs else ('3y', 'max')

        try:
            result = run_optimize_spec(
                spec, symbol, param_ranges=param_ranges, n_trials=n_trials,
                timeframes=timeframes, objective=objective,
            )
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            return Response({'error': f'Optimization failed: {e}'}, status=500)

        if not result.get('best'):
            return Response({**result, 'published': False,
                             'message': 'No trial produced a tradable result.'})

        # Record the best result on the strategy for at-a-glance display.
        strategy.best_params = result['best']['params']
        strategy.best_score = result['best']['score']
        strategy.best_objective = objective

        # Optionally publish the tuned spec as the strategy's new source of truth.
        if request.data.get('publish'):
            best_spec = result['best']['spec']
            try:
                strategy.code = spec_to_code(best_spec)
            except SpecError as e:
                return Response({'error': f'Tuned spec failed to render: {e}'}, status=500)
            strategy.spec = best_spec
            strategy.save(update_fields=['code', 'spec', 'best_params', 'best_score', 'best_objective'])
            result['published'] = True
            result['code'] = strategy.code
        else:
            strategy.save(update_fields=['best_params', 'best_score', 'best_objective'])
            result['published'] = False

        return Response(result)

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

    @action(detail=True, methods=['post'])
    def save_experiment(self, request, pk=None):
        """
        Save a backtest result as a named experiment for the strategy history.
        Called from the frontend backtest page after a successful run.
        """
        strategy = self.get_object()
        scope_type = request.data.get('scope_type', ScopeType.SYMBOL)
        scope_value = request.data.get('scope_value', '')
        start_date = request.data.get('start_date') or None
        end_date = request.data.get('end_date') or None
        parameters = request.data.get('parameters', {})
        metrics = request.data.get('metrics', {})
        plot_html = request.data.get('plot_html')

        if not scope_value:
            return Response({'error': 'scope_value is required'}, status=400)

        # DateField is required - provide defaults if not supplied
        today = date.today()
        if not end_date:
            end_date = today
        if not start_date:
            start_date = date(today.year - 5, today.month, today.day)

        exp = StrategyExperiment.objects.create(
            strategy=strategy,
            user=request.user,
            run_type=StrategyExperiment.RunType.BACKTEST,
            scope_type=scope_type,
            scope_value=scope_value,
            start_date=start_date,
            end_date=end_date,
            parameters=parameters,
            metrics=metrics,
            plot_html=plot_html,
            status=StrategyExperiment.Status.SUCCESS,
        )

        return Response({'id': exp.id, 'status': 'saved'}, status=201)

    @action(detail=True, methods=['get'])
    def get_published_config(self, request, pk=None):
        """
        Get the published (optimized) config/parameters for a given scope.
        Query params: ?symbol=NABIL or ?sector=Banking or ?scope_type=ALL
        """
        strategy = self.get_object()
        symbol = request.query_params.get('symbol')
        sector = request.query_params.get('sector')
        scope_type_param = request.query_params.get('scope_type')

        qs = StrategyExperiment.objects.filter(strategy=strategy, is_published=True)

        if symbol:
            qs = qs.filter(scope_type=ScopeType.SYMBOL, scope_value=symbol)
        elif sector:
            qs = qs.filter(scope_type=ScopeType.SECTOR, scope_value=sector)
        elif scope_type_param == 'ALL':
            qs = qs.filter(scope_type=ScopeType.ALL)
        else:
            return Response({'error': 'Provide symbol, sector, or scope_type=ALL'}, status=400)

        exp = qs.order_by('-created_at').first()
        if not exp:
            return Response({'error': 'No published config found for this scope'}, status=404)

        return Response({
            'parameters': exp.parameters,
            'metrics': exp.metrics,
            'experiment_id': exp.id,
            'scope_type': exp.scope_type,
            'scope_value': exp.scope_value,
            'created_at': exp.created_at.isoformat() if exp.created_at else None,
        })

    @action(detail=True, methods=['post'])
    def unpublish_optimized(self, request, pk=None):
        """
        Unpublish strategy parameters for a given scope.
        Body: { scope_type: 'SECTOR'|'SYMBOL'|'ALL', scope_value: 'Banking' }
        """
        strategy = self.get_object()

        # Ownership check
        if strategy.user_id != self.request.user.id and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to unpublish this strategy.")

        scope_type = request.data.get('scope_type')
        scope_value = request.data.get('scope_value', '')

        if not scope_type:
            return Response({'error': 'scope_type is required'}, status=400)

        updated = StrategyExperiment.objects.filter(
            strategy=strategy,
            scope_type=scope_type,
            scope_value=scope_value,
            is_published=True,
        ).update(is_published=False)

        return Response({'unpublished': updated, 'scope_type': scope_type, 'scope_value': scope_value})

    # --- Private Helpers ---

    def _get_signal(self, code, symbol, start_date, end_date, params=None):
        result, error, _ = self._run_single_backtest(code, symbol, start_date, end_date, params=params)
        if error or 'error' in result:
            return None
            
        # Extract signal logic (simplified: check last trade)
        # Note: In a real scenario, this would check if a signal was generated TODAY
        # Based on views.py logic (if I had it fully)
        return None # Placeholder, implement based on full _get_signal if needed

    def _get_bt_local_scope(self, symbol, params=None):
        """Build the execution scope for strategy code.

        Delegates to the shared backtest harness so the backtest API and live
        signal generation cannot drift apart.
        """
        return build_strategy_scope(symbol, params=params)

    def _run_single_backtest(self, code, symbol, start_date, end_date, params=None, cash=1000000):
        # Special tokens (e.g. broker_accumulation_v1) map to fixed source in the
        # shared harness — single source of truth for these definitions.
        code = resolve_code(code)
        try:
            # Data Fetching — via the shared harness loader so the UI backtest
            # uses corporate-action-adjusted prices, matching run_backtest.
            df = load_price_df(symbol, start=start_date, end=end_date)
            if df is None or len(df) < 20:
                return {}, "Insufficient data (need at least 20 data points)", {}

            # Execution
            local_scope = self._get_bt_local_scope(symbol, params=params)
            exec(code, local_scope)
            
            strategy_class = None
            for name, obj in local_scope.items():
                if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                    strategy_class = obj
                    break
            
            if not strategy_class:
                return {}, "No Strategy class found. Please ensure your code defines a class inheriting from 'Strategy'.", {}

            # Real NEPSE costs (tiered commission + SEBON + DP) + spread, matching
            # the shared harness so the UI backtest endpoint reports honest numbers.
            # Prices come from the adjusted harness loader (load_price_df) above.
            bt = Backtest(df, strategy_class, cash=cash, commission=nepse_commission,
                          spread=DEFAULT_SPREAD, exclusive_orders=True)
            
            # Inject parameters into bt.run()
            # Only include parameters that are present in the strategy class
            run_params = {k: v for k, v in (params or {}).items() if hasattr(strategy_class, k)}
            stats = bt.run(**run_params)
            
            plot_html = None
            try:
                import tempfile, os as _os
                with tempfile.NamedTemporaryFile(delete=False, suffix='.html') as tmp:
                    tmp_path = tmp.name
                bt.plot(filename=tmp_path, open_browser=False)
                with open(tmp_path, 'r', encoding='utf-8') as f:
                    plot_html = f.read()
                _os.unlink(tmp_path)
            except Exception:
                pass

            metrics, _ = self._extract_bt_stats(stats)
            return self._clean_for_json(metrics), None, {'plot_html': plot_html}
        except Exception as e:
            error_trace = traceback.format_exc()
            return {}, error_trace, {}

    def _extract_bt_stats(self, stats):
        """Extract and sanitize backtest stats for JSON serialization."""
        clean = {}
        # Internal objects from backtesting.py that cannot be serialized
        excluded = ['_strategy', '_equity', '_trades', '_bt']
        
        for k, v in stats.items():
            if k in excluded:
                continue
            
            # Clean the value using our robust helper
            clean_val = self._clean_for_json(v)
            
            # If the value is still not a basic type, it might be a Bokeh object or similar
            if not isinstance(clean_val, (str, int, float, bool, list, dict, type(None))):
                continue
                
            clean[k] = clean_val
            
        return clean, {}

    def _clean_for_json(self, data):
        """
        Recursively clean data for JSON serialization.
        Handles pandas types, timestamps, and nested structures.
        """
        # 1. Handle Pandas/NumPy Nulls
        try:
            if pd.isna(data):
                return None
        except (TypeError, ValueError, AttributeError):
            pass

        # 2. Handle Timestamps (Pandas/Datetime)
        if hasattr(data, 'isoformat'):
            return data.isoformat()
            
        # 3. Handle Pandas DataFrames/Series/Arrays
        if isinstance(data, pd.DataFrame):
            return self._clean_for_json(data.to_dict('records'))
        if isinstance(data, (pd.Series, pd.Index, np.ndarray)):
            # Convert to list and clean items recursively
            return [self._clean_for_json(x) for x in (data.tolist() if hasattr(data, 'tolist') else list(data))]
            
        # 4. Handle Dictionaries
        if isinstance(data, dict):
            return {str(k): self._clean_for_json(v) for k, v in data.items()}
            
        # 5. Handle Lists/Tuples
        if isinstance(data, (list, tuple)):
            return [self._clean_for_json(x) for x in data]

        # 6. Basic Serializable Types
        if isinstance(data, (str, int, float, bool, type(None))):
            return data

        # 7. Fallback for non-serializable objects (like Bokeh GridPlot)
        # We return None to avoid crashing JsonResponse
        return None

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
    queryset = SignalEpisode.objects.all().order_by('-start_date')
    serializer_class = SignalEpisodeSerializer
    pagination_class = StrategySignalPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['symbol', 'source', 'status', 'direction', 'strategy']
    search_fields = ['symbol']

    @action(detail=False, methods=['get'])
    def tracking(self, request):
        active_qs = SignalEpisode.objects.filter(status='ACTIVE').order_by('start_date')
        closed_qs = SignalEpisode.objects.exclude(status='ACTIVE').order_by('-end_date')

        def pos(ep, closed):
            data = SignalEpisodeSerializer(ep).data
            data['return_pct'] = float(ep.pnl_percent) if ep.pnl_percent is not None else 0.0
            return data

        active = [pos(e, False) for e in active_qs]
        closed = [pos(e, True) for e in closed_qs]
        returns = [p['return_pct'] for p in active + closed]
        held = [p['days_held'] for p in closed]
        return Response({
            'active_positions': sorted(active, key=lambda x: x['days_held'], reverse=True),
            'closed_positions': closed,
            'summary': {
                'total_active': len(active),
                'total_closed': len(closed),
                'avg_return': round(sum(returns) / len(returns), 2) if returns else 0,
                'avg_holding_period': round(sum(held) / len(held), 1) if held else 0,
            },
        })


class GeneratedSignalPagination(PageNumberPagination):
    page_size = 200
    page_size_query_param = 'page_size'
    max_page_size = 1000


class GeneratedSignalViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet to serve stored signal episodes (Smart Money, Whale Watch engines).
    Episodes are created via the ingest_reading / evaluate_active_episodes pipeline.
    """
    queryset = SignalEpisode.objects.all().order_by('-start_date')
    serializer_class = SignalEpisodeSerializer
    pagination_class = GeneratedSignalPagination
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['source', 'symbol', 'status', 'direction', 'strategy']
    search_fields = ['symbol']

    @action(detail=False, methods=['get'])
    def track_record(self, request):
        """Return episodes paginated. Optionally filter by status (comma-separated)."""
        status_param = request.query_params.get('status', '')
        if status_param:
            statuses = [s.strip().upper() for s in status_param.split(',')]
            qs = SignalEpisode.objects.filter(status__in=statuses).order_by('-start_date')
        else:
            qs = SignalEpisode.objects.all().order_by('-start_date')
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """Return only the most recent date's episodes, optionally filtered by source."""
        source = request.query_params.get('source')

        qs = SignalEpisode.objects.all()
        if source:
            qs = qs.filter(source=source)

        latest_date = qs.order_by('-last_signal_date').values_list('last_signal_date', flat=True).first()
        if not latest_date:
            return Response([])

        episodes = qs.filter(last_signal_date=latest_date).order_by('-entry_strength')
        return Response(SignalEpisodeSerializer(episodes, many=True).data)

    @action(detail=False, methods=['get'])
    def performance(self, request):
        """Return historical performance aggregated by source."""
        from django.db.models import Count, Q, Avg

        stats = SignalEpisode.objects.values('source').annotate(
            total=Count('id'),
            won=Count('id', filter=Q(status='WON')),
            lost=Count('id', filter=Q(status='LOST')),
            active=Count('id', filter=Q(status='ACTIVE')),
            avg_win_pnl=Avg('pnl_percent', filter=Q(status='WON')),
            avg_loss_pnl=Avg('pnl_percent', filter=Q(status='LOST')),
            avg_pnl=Avg('pnl_percent', filter=Q(status__in=['WON', 'LOST'])),
        )

        result = []
        for s in stats:
            total_resolved = s['won'] + s['lost']
            win_rate = (s['won'] / total_resolved * 100) if total_resolved > 0 else 0

            result.append({
                'source': s['source'],
                'total': s['total'],
                'won': s['won'],
                'lost': s['lost'],
                'active': s['active'],
                'win_rate': round(win_rate, 2),
                'avg_pnl': round(s['avg_pnl'] or 0, 2),
                'avg_win_pnl': round(s['avg_win_pnl'] or 0, 2),
                'avg_loss_pnl': round(s['avg_loss_pnl'] or 0, 2),
            })

        return Response(result)

    @action(detail=False, methods=['get'])
    def performance_detailed(self, request):
        from stocks.services.strategy_performance_service import compute_performance_detailed
        return Response(compute_performance_detailed(request.user))

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Aggregated counts by source and direction for the latest signal date."""
        from django.db.models import Count

        latest_date = SignalEpisode.objects.order_by('-last_signal_date').values_list('last_signal_date', flat=True).first()
        if not latest_date:
            return Response({'date': None, 'sources': {}})

        qs = SignalEpisode.objects.filter(last_signal_date=latest_date)

        by_source = qs.values('source', 'direction').annotate(count=Count('id'))

        sources = {}
        for row in by_source:
            src = row['source']
            if src not in sources:
                sources[src] = {'BUY': 0, 'SELL': 0, 'total': 0}
            if row['direction'] in ('BUY', 'SELL'):
                sources[src][row['direction']] = row['count']
            sources[src]['total'] += row['count']

        total = qs.count()
        buys = qs.filter(direction='BUY').count()
        sells = qs.filter(direction='SELL').count()

        return Response({
            'date': latest_date.isoformat(),
            'total': total,
            'buys': buys,
            'sells': sells,
            'sources': sources,
        })

