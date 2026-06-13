import warnings
warnings.filterwarnings('ignore', category=FutureWarning)

import inspect
import re
import uuid
import traceback
import tempfile
import os as _os
from datetime import date, timedelta

import pandas as pd
import numpy as np
from dateutil.relativedelta import relativedelta
from backtesting import Backtest, Strategy as BTStrategy
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from ...services.backtest_harness import build_strategy_scope, resolve_code, load_price_df
from ...services.backtest_harness.fees import nepse_commission, DEFAULT_SPREAD
from ...models import (
    DailyStockPrice, Strategy, Company, StrategyExperiment,
    ScopeType, StrategySymbolConfig, SignalEpisode,
)
from ...serializers import (
    StrategySerializer, StrategyExperimentSerializer,
    StrategyExperimentDetailSerializer,
    StrategySymbolConfigSerializer,
)

_PERIOD_MAP = {
    '1Y': relativedelta(years=1),
    '3Y': relativedelta(years=3),
    '5Y': relativedelta(years=5),
    'ALL': None,
}


class StrategyViewSet(viewsets.ModelViewSet):
    queryset = Strategy.objects.all()
    serializer_class = StrategySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Strategy.objects.filter(
            Q(user=self.request.user) | Q(is_public=True)
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    # ------------------------------------------------------------------ #
    # Read-only / utility actions                                          #
    # ------------------------------------------------------------------ #

    @action(detail=False, methods=['get'], url_path='components')
    def components(self, request):
        """Catalog of composable strategy components (param schemas) for the builder."""
        from ...services.strategy_framework import registry_schema
        return Response(registry_schema())

    @action(detail=False, methods=['get'], url_path='scan')
    def scan(self, request):
        """Scan all strategies on a symbol across timeframes."""
        from ...services.strategy_scan import scan_symbol, DEFAULT_TIMEFRAMES
        symbol = (request.query_params.get('symbol') or '').upper()
        if not symbol:
            return Response(
                {'error': 'symbol query param required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        optimize = request.query_params.get('optimize') in ('1', 'true', 'True')
        tfs = request.query_params.get('timeframes')
        timeframes = tuple(t.strip() for t in tfs.split(',')) if tfs else DEFAULT_TIMEFRAMES
        return Response(scan_symbol(symbol, timeframes=timeframes, optimize=optimize))

    @action(detail=False, methods=['post'], url_path='render_spec')
    def render_spec(self, request):
        """Validate a composition spec and render the equivalent code."""
        from ...services.strategy_framework import spec_to_code, spec_to_sentence, SpecError
        spec = request.data.get('spec')
        try:
            return Response({
                'valid': True,
                'code': spec_to_code(spec),
                'sentence': spec_to_sentence(spec),
                'error': None,
            })
        except SpecError as e:
            return Response({'valid': False, 'code': '', 'sentence': '', 'error': str(e)})
        except Exception as e:  # noqa: BLE001
            return Response({
                'valid': False, 'code': '', 'sentence': '',
                'error': f'{type(e).__name__}: {e}',
            })

    # ------------------------------------------------------------------ #
    # Publish / unpublish                                                  #
    # ------------------------------------------------------------------ #

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        strategy = self.get_object()
        self._assert_owner(strategy)
        experiment_id = request.data.get('experiment_id')
        if not experiment_id:
            return Response(
                {'error': 'Experiment ID is required to publish.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            exp = StrategyExperiment.objects.get(id=experiment_id, strategy=strategy)
        except StrategyExperiment.DoesNotExist:
            return Response({'error': 'Experiment not found.'}, status=status.HTTP_404_NOT_FOUND)
        self._unpublish_existing_scope(strategy, exp)
        exp.is_published = True
        exp.save()
        return Response({
            'status': 'published',
            'id': exp.id,
            'scope': f'{exp.scope_type}:{exp.scope_value}',
        })

    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        """Unpublish an experiment or all experiments for this strategy."""
        strategy = self.get_object()
        self._assert_owner(strategy)
        experiment_id = request.data.get('experiment_id')
        if experiment_id:
            return self._unpublish_one(strategy, experiment_id)
        updated = StrategyExperiment.objects.filter(
            strategy=strategy, is_published=True
        ).update(is_published=False)
        return Response({'status': 'unpublished', 'count': updated})

    @action(detail=True, methods=['post'])
    def unpublish_optimized(self, request, pk=None):
        """Unpublish parameters for a given scope."""
        strategy = self.get_object()
        self._assert_owner(strategy)
        scope_type = request.data.get('scope_type')
        if not scope_type:
            return Response({'error': 'scope_type is required'}, status=400)
        scope_value = request.data.get('scope_value', '')
        updated = StrategyExperiment.objects.filter(
            strategy=strategy,
            scope_type=scope_type,
            scope_value=scope_value,
            is_published=True,
        ).update(is_published=False)
        return Response({
            'unpublished': updated,
            'scope_type': scope_type,
            'scope_value': scope_value,
        })

    # ------------------------------------------------------------------ #
    # Recommendations                                                      #
    # ------------------------------------------------------------------ #

    @action(detail=False, methods=['get'])
    def recommendations(self, request):
        """Generate trading recommendations from published strategies."""
        published_experiments = (
            StrategyExperiment.objects.filter(is_published=True).select_related('strategy')
        )
        active_companies = Company.objects.all()
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=30)
        recs = []
        for exp in published_experiments:
            companies = self._filter_companies_by_scope(active_companies, exp)
            for company in companies:
                rec = self._try_build_recommendation(exp, company, start_date, end_date)
                if rec:
                    recs.append(rec)
        return Response(recs)

    # ------------------------------------------------------------------ #
    # Backtest                                                             #
    # ------------------------------------------------------------------ #

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def backtest(self, request, pk=None):
        strategy = self.get_object()
        ctx = self._extract_backtest_context(request, strategy)
        if ctx['sector']:
            return self._sector_backtest(strategy, request, ctx)
        return self._symbol_backtest(strategy, request, ctx)

    # ------------------------------------------------------------------ #
    # Optimization                                                         #
    # ------------------------------------------------------------------ #

    @action(detail=True, methods=['post'])
    def optimize_multi_period(self, request, pk=None):
        """3Y windowed K-fold cross-validation optimization."""
        from ...optimize_multi_period import (
            calculate_3y_splits, fetch_period_data,
            run_single_objective_optimization, run_final_backtest,
            calculate_avg_cv_stats,
        )
        strategy = self.get_object()
        ctx = self._extract_optimize_context(request)
        if not ctx['param_ranges']:
            return Response({'error': 'param_ranges required'}, status=400)
        folds, fold_error = self._calculate_folds(ctx['symbol'])
        if fold_error:
            return fold_error
        data_maps, fetch_errors = self._fetch_fold_data(
            folds, ctx['symbol'], ctx['sector'], fetch_period_data
        )
        if not data_maps:
            return Response(
                {'error': f'Failed to fetch data for any folds: {"; ".join(fetch_errors)}'},
                status=404,
            )
        return self._run_multi_period_optimization(
            strategy, request, ctx, data_maps, folds,
            run_single_objective_optimization, run_final_backtest, calculate_avg_cv_stats,
        )

    @action(detail=True, methods=['post'], url_path='optimize_spec')
    def optimize_spec(self, request, pk=None):
        """Optimize a composed strategy by searching its spec's parameter ranges."""
        from ...services.strategy_scan import optimize_spec as run_optimize_spec
        from ...services.strategy_framework import spec_to_code, SpecError
        strategy = self.get_object()
        spec = request.data.get('spec') or strategy.spec
        if not spec:
            return Response(
                {'error': 'This strategy has no spec; use optimize_multi_period for custom code.'},
                status=400,
            )
        symbol = (request.data.get('symbol') or strategy.ticker or '').upper()
        if not symbol:
            return Response({'error': 'symbol is required'}, status=400)
        if self._is_publish_only(request):
            return self._handle_publish_only(strategy, request, spec_to_code, SpecError, spec)
        result = self._run_spec_optimization(request, spec, symbol, run_optimize_spec)
        if isinstance(result, Response):
            return result
        return self._finalize_spec_result(strategy, request, result, spec_to_code, SpecError)

    @action(detail=True, methods=['post'])
    def publish_optimized(self, request, pk=None):
        """Publish optimized parameters for a strategy."""
        strategy = self.get_object()
        best_params = request.data.get('params', {}) or request.data.get('best_params', {})
        symbol = request.data.get('symbol', '')
        if not best_params:
            return Response({'error': 'No parameters to publish'}, status=400)
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        strategy.code = self._inject_params(strategy.code, best_params)
        strategy.ticker = symbol
        strategy.save()
        StrategyExperiment.objects.filter(
            strategy=strategy,
            scope_type=ScopeType.SYMBOL,
            scope_value=symbol,
            is_published=True,
        ).update(is_published=False)
        return Response({'success': True, 'updated_params': best_params, 'symbol': symbol})

    # ------------------------------------------------------------------ #
    # Compare actions                                                      #
    # ------------------------------------------------------------------ #

    @action(detail=False, methods=['post'])
    def compare(self, request):
        """Compare multiple strategies on a symbol across time periods."""
        symbol = request.data.get('symbol')
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        strategies = self._load_strategies(request)
        strategy_ids = request.data.get('strategy_ids', [])
        if strategy_ids:
            strategies = strategies.filter(id__in=strategy_ids)
        periods = request.data.get('periods', ['1Y', '3Y', '5Y'])
        today = date.today()
        results = [
            self._compare_strategy_periods(s, symbol, periods, today)
            for s in strategies
        ]
        return Response({'symbol': symbol, 'results': results, 'batch_id': uuid.uuid4()})

    @action(detail=False, methods=['post'])
    def optimize_compare(self, request):
        """Multi-strategy, multi-period optimization and comparison."""
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
        symbol = request.data.get('symbol')
        if not symbol:
            return Response({'error': 'Symbol is required'}, status=400)
        strategies = self._load_strategies(request)
        strategy_ids = request.data.get('strategy_ids', [])
        if strategy_ids:
            strategies = strategies.filter(id__in=strategy_ids)
        periods = request.data.get('periods', ['3Y'])
        n_trials = int(request.data.get('n_trials', 20))
        force_refresh = request.data.get('force_refresh', False)
        batch_id = uuid.uuid4()
        today = date.today()
        results = [
            self._optimize_compare_strategy(
                s, symbol, periods, today, n_trials, force_refresh, batch_id, request
            )
            for s in strategies
        ]
        return Response({'symbol': symbol, 'results': results, 'optimized': True})

    # ------------------------------------------------------------------ #
    # Experiment actions                                                   #
    # ------------------------------------------------------------------ #

    @action(detail=False, methods=['get'])
    def experiment_detail(self, request):
        experiment_id = request.query_params.get('id')
        batch_id = request.query_params.get('batch_id')
        symbol = request.query_params.get('symbol')
        if experiment_id:
            return self._get_experiment_by_id(experiment_id)
        if batch_id:
            return self._get_experiments_by_batch(batch_id, symbol)
        return Response({'error': 'id or batch_id required'}, status=400)

    @action(detail=True, methods=['post'])
    def save_experiment(self, request, pk=None):
        """Save a backtest result as a named experiment."""
        strategy = self.get_object()
        scope_value = request.data.get('scope_value', '')
        if not scope_value:
            return Response({'error': 'scope_value is required'}, status=400)
        dates = self._resolve_experiment_dates(request)
        exp = StrategyExperiment.objects.create(
            strategy=strategy,
            user=request.user,
            run_type=StrategyExperiment.RunType.BACKTEST,
            scope_type=request.data.get('scope_type', ScopeType.SYMBOL),
            scope_value=scope_value,
            start_date=dates['start'],
            end_date=dates['end'],
            parameters=request.data.get('parameters', {}),
            metrics=request.data.get('metrics', {}),
            plot_html=request.data.get('plot_html'),
            status=StrategyExperiment.Status.SUCCESS,
        )
        return Response({'id': exp.id, 'status': 'saved'}, status=201)

    @action(detail=True, methods=['get'])
    def get_published_config(self, request, pk=None):
        """Get the published (optimized) config for a given scope."""
        strategy = self.get_object()
        qs = StrategyExperiment.objects.filter(strategy=strategy, is_published=True)
        qs = self._filter_published_qs(qs, request)
        if isinstance(qs, Response):
            return qs
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

    # ------------------------------------------------------------------ #
    # Symbol config actions                                                #
    # ------------------------------------------------------------------ #

    @action(detail=True, methods=['get'])
    def symbol_config(self, request, pk=None):
        strategy = self.get_object()
        symbol = request.query_params.get('symbol')
        if not symbol:
            return Response({'error': 'Symbol required'}, status=400)
        config, _ = StrategySymbolConfig.objects.get_or_create(
            user=request.user,
            strategy=strategy,
            symbol=symbol,
            defaults={'preferred_objective': 'balanced'},
        )
        return Response(StrategySymbolConfigSerializer(config).data)

    @action(detail=True, methods=['post'])
    def set_symbol_config(self, request, pk=None):
        strategy = self.get_object()
        symbol = request.data.get('symbol')
        obj = request.data.get('preferred_objective')
        if not symbol or obj not in ['win_rate', 'profit', 'balanced']:
            return Response({'error': 'Invalid parameters'}, status=400)
        config, _ = StrategySymbolConfig.objects.update_or_create(
            user=request.user,
            strategy=strategy,
            symbol=symbol,
            defaults={'preferred_objective': obj},
        )
        return Response({'status': 'updated', 'preferred_objective': config.preferred_objective})

    # ================================================================== #
    # Private helpers                                                     #
    # ================================================================== #

    def _assert_owner(self, strategy):
        if strategy.user_id != self.request.user.id and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to modify this strategy.")

    def _unpublish_existing_scope(self, strategy, exp):
        StrategyExperiment.objects.filter(
            strategy=strategy,
            scope_type=exp.scope_type,
            scope_value=exp.scope_value,
            is_published=True,
        ).exclude(id=exp.id).update(is_published=False)

    def _unpublish_one(self, strategy, experiment_id):
        try:
            exp = StrategyExperiment.objects.get(id=experiment_id, strategy=strategy)
            exp.is_published = False
            exp.save()
            return Response({'status': 'unpublished', 'id': exp.id})
        except StrategyExperiment.DoesNotExist:
            return Response({'error': 'Experiment not found.'}, status=status.HTTP_404_NOT_FOUND)

    def _filter_companies_by_scope(self, companies, exp):
        if exp.scope_type == ScopeType.SYMBOL:
            return companies.filter(symbol=exp.scope_value)
        if exp.scope_type == ScopeType.SECTOR:
            return companies.filter(sector=exp.scope_value)
        return companies

    def _try_build_recommendation(self, exp, company, start_date, end_date):
        strategy = exp.strategy
        try:
            signal = self._get_signal(strategy.code, company.symbol, start_date, end_date, exp.parameters)
            if not signal:
                return None
            return {
                'strategy_id': strategy.id,
                'strategy_name': strategy.name,
                'symbol': company.symbol,
                'company_name': company.name,
                'signal': signal['type'],
                'date': signal['date'],
                'price': signal['price'],
                'published_parameters': exp.parameters,
                'scope_type': exp.scope_type,
                'scope_value': exp.scope_value,
            }
        except Exception as e:  # noqa: BLE001
            print(f"Error generating recommendation for {strategy.name} on {company.symbol}: {e}")
            return None

    def _extract_backtest_context(self, request, strategy):
        return {
            'code': request.data.get('code', strategy.code),
            'symbol': request.data.get('symbol', 'NABIL'),
            'sector': request.data.get('sector', None),
            'start_date': request.data.get('start_date') or '2000-01-01',
            'end_date': request.data.get('end_date') or timezone.now().date().isoformat(),
            'strategy_params': request.data.get('parameters', {}),
            'initial_balance': float(
                request.data.get('initial_balance', request.data.get('cash', 1000000))
            ),
        }

    def _sector_backtest(self, strategy, request, ctx):
        companies = Company.objects.filter(sector=ctx['sector'])
        batch_id = uuid.uuid4()
        parent_exp = self._create_sector_parent_experiment(strategy, request, ctx, batch_id)
        results = self._run_sector_backtests(strategy, request, companies, ctx, batch_id)
        parent_exp.status = StrategyExperiment.Status.SUCCESS
        parent_exp.save()
        return Response(self._build_sector_response(batch_id, ctx, companies, results))

    def _create_sector_parent_experiment(self, strategy, request, ctx, batch_id):
        return StrategyExperiment.objects.create(
            strategy=strategy,
            user=request.user if request.user.is_authenticated else None,
            run_type=StrategyExperiment.RunType.BACKTEST,
            scope_type=ScopeType.SECTOR,
            scope_value=ctx['sector'],
            parameters=ctx['strategy_params'],
            status=StrategyExperiment.Status.PENDING,
            batch_id=batch_id,
        )

    def _run_sector_backtests(self, strategy, request, companies, ctx, batch_id):
        results = []
        for company in companies:
            res, error, _ = self._run_single_backtest(
                ctx['code'], company.symbol,
                ctx['start_date'], ctx['end_date'],
                params=ctx['strategy_params'], cash=ctx['initial_balance'],
            )
            self._create_symbol_experiment(strategy, request, company.symbol, ctx, res, error, batch_id)
            if not error:
                results.append({'symbol': company.symbol, 'metrics': res})
        return results

    def _create_symbol_experiment(self, strategy, request, symbol, ctx, res, error, batch_id):
        StrategyExperiment.objects.create(
            strategy=strategy,
            user=request.user if request.user.is_authenticated else None,
            run_type=StrategyExperiment.RunType.BACKTEST,
            scope_type=ScopeType.SYMBOL,
            scope_value=symbol,
            start_date=ctx['start_date'],
            end_date=ctx['end_date'],
            parameters=ctx['strategy_params'],
            metrics=res if not error else {},
            status=StrategyExperiment.Status.SUCCESS if not error else StrategyExperiment.Status.FAILED,
            error_log=error,
            batch_id=batch_id,
        )

    def _build_sector_response(self, batch_id, ctx, companies, results):
        successful_runs = len(results)
        avg_return = 0
        if successful_runs > 0:
            avg_return = sum(r['metrics'].get('Return [%]', 0) for r in results) / successful_runs
        flattened = self._flatten_sector_results(results, ctx['initial_balance'])
        return {
            'batch_id': batch_id,
            'sector': ctx['sector'],
            'total_companies': companies.count(),
            'successful_backtests': successful_runs,
            'aggregated': {'avg_return': avg_return},
            'individual_results': flattened,
        }

    def _flatten_sector_results(self, results, initial_balance):
        flattened = []
        for r in results:
            metrics = r['metrics']
            final_eq = metrics.get('Equity Final [$]')
            flattened.append({
                'symbol': r['symbol'],
                'pnl_percent': metrics.get('Return [%]'),
                'win_rate': metrics.get('Win Rate [%]'),
                'total_trades': metrics.get('# Trades'),
                'total_pnl': (final_eq - initial_balance) if final_eq else 0,
            })
        return flattened

    def _symbol_backtest(self, strategy, request, ctx):
        result, error, exp_data = self._run_single_backtest(
            ctx['code'], ctx['symbol'],
            ctx['start_date'], ctx['end_date'],
            params=ctx['strategy_params'], cash=ctx['initial_balance'],
        )
        self._log_symbol_experiment(strategy, request, ctx, result, error, exp_data)
        if error:
            return Response({'error': error}, status=400)
        return Response({
            'id': strategy.id,
            'symbol': ctx['symbol'],
            'stats': result,
            'plot_html': exp_data.get('plot_html'),
            'metadata': {
                'scope_type': ScopeType.SYMBOL,
                'scope_value': ctx['symbol'],
                'start_date': ctx['start_date'],
                'end_date': ctx['end_date'],
                'parameters': ctx['strategy_params'],
                'metrics': result,
            },
        })

    def _log_symbol_experiment(self, strategy, request, ctx, result, error, exp_data):
        StrategyExperiment.objects.create(
            strategy=strategy,
            user=request.user if request.user.is_authenticated else None,
            run_type=StrategyExperiment.RunType.BACKTEST,
            scope_type=ScopeType.SYMBOL,
            scope_value=ctx['symbol'],
            start_date=ctx['start_date'],
            end_date=ctx['end_date'],
            parameters=ctx['strategy_params'],
            metrics=result if not error else {},
            plot_html=exp_data.get('plot_html') if not error else None,
            status=StrategyExperiment.Status.SUCCESS if not error else StrategyExperiment.Status.FAILED,
            error_log=error,
        )

    def _extract_optimize_context(self, request):
        return {
            'code_template': request.data.get('code', ''),
            'symbol': request.data.get('symbol', 'NABIL'),
            'sector': request.data.get('sector'),
            'param_ranges': request.data.get('param_ranges', {}),
            'n_trials': request.data.get('n_trials', 50),
            'n_jobs': int(request.data.get('parallel_envs', 4)),
        }

    def _calculate_folds(self, symbol):
        from ...optimize_multi_period import calculate_3y_splits
        try:
            folds = calculate_3y_splits(symbol, DailyStockPrice)
        except Exception as e:
            return None, Response({'error': f'Failed to calculate folds: {str(e)}'}, status=500)
        if not folds:
            return None, Response({'error': 'No data folds available for optimization'}, status=404)
        return folds, None

    def _fetch_fold_data(self, folds, symbol, sector, fetch_period_data):
        data_maps = []
        errors = []
        for f_name, f_start, f_end in folds:
            data_map, error = fetch_period_data(
                symbol, sector, f_start, f_end, DailyStockPrice, Company
            )
            if error:
                errors.append(f'{f_name}: {error}')
            else:
                data_maps.append(data_map)
        return data_maps, errors

    def _run_multi_period_optimization(
        self, strategy, request, ctx, data_maps, folds,
        run_single_objective_optimization, run_final_backtest, calculate_avg_cv_stats,
    ):
        batch_id = uuid.uuid4()
        overall_start = folds[0][1]
        overall_end = folds[-1][2]
        results_by_objective = {}
        try:
            for obj_type in ['win_rate', 'profit', 'balanced']:
                obj_result = self._run_objective(
                    strategy, request, ctx, data_maps, obj_type,
                    overall_start, overall_end, batch_id,
                    run_single_objective_optimization, run_final_backtest, calculate_avg_cv_stats,
                )
                if obj_result:
                    results_by_objective[obj_type] = obj_result
            return Response({'batch_id': batch_id, 'results': results_by_objective})
        except Exception as e:
            traceback.print_exc()
            return Response({'error': f'Optimization failed: {str(e)}'}, status=500)

    def _run_objective(
        self, strategy, request, ctx, data_maps, obj_type,
        overall_start, overall_end, batch_id,
        run_single_objective_optimization, run_final_backtest, calculate_avg_cv_stats,
    ):
        result = run_single_objective_optimization(
            data_maps, ctx['code_template'], ctx['param_ranges'],
            obj_type, ctx['n_trials'], n_jobs=ctx['n_jobs'],
        )
        full_stats, plot_html, cross_fold_averages = self._compute_fold_stats(
            data_maps, ctx, result, run_final_backtest, calculate_avg_cv_stats
        )
        if not full_stats:
            return None
        exp = self._create_optimization_experiment(
            strategy, request, ctx, obj_type, overall_start, overall_end,
            batch_id, result, cross_fold_averages, plot_html,
        )
        return {
            'best_params': result['best_params'],
            'cv_stats': cross_fold_averages,
            'stats': full_stats,
            'plot_html': plot_html,
            'experiment_id': exp.id,
        }

    def _compute_fold_stats(self, data_maps, ctx, result, run_final_backtest, calculate_avg_cv_stats):
        full_stats, _, plot_html = run_final_backtest(
            data_maps[-1], ctx['code_template'], result['best_params']
        )
        if not full_stats:
            return None, None, None
        cross_fold_averages = calculate_avg_cv_stats(
            data_maps, ctx['code_template'], result['best_params']
        )
        return full_stats, plot_html, cross_fold_averages

    def _create_optimization_experiment(
        self, strategy, request, ctx, obj_type, overall_start, overall_end,
        batch_id, result, cross_fold_averages, plot_html,
    ):
        return StrategyExperiment.objects.create(
            strategy=strategy,
            user=request.user,
            run_type=StrategyExperiment.RunType.OPTIMIZATION,
            scope_type=ScopeType.SYMBOL,
            scope_value=ctx['symbol'],
            start_date=overall_start,
            end_date=overall_end,
            parameters=result['best_params'],
            metrics={**cross_fold_averages, 'objective': obj_type},
            plot_html=plot_html,
            status=StrategyExperiment.Status.SUCCESS,
            batch_id=batch_id,
            is_published=(obj_type == 'balanced'),
        )

    def _is_publish_only(self, request):
        return (
            request.data.get('publish')
            and request.data.get('spec')
            and int(request.data.get('n_trials', 1)) == 0
        )

    def _handle_publish_only(self, strategy, request, spec_to_code, SpecError, spec):
        try:
            strategy.code = spec_to_code(spec)
        except SpecError as e:
            return Response({'error': f'Tuned spec failed to render: {e}'}, status=500)
        strategy.spec = spec
        strategy.save(update_fields=['code', 'spec'])
        return Response({'published': True, 'code': strategy.code, 'spec': spec})

    def _run_spec_optimization(self, request, spec, symbol, run_optimize_spec):
        objective = request.data.get('objective', 'balanced')
        n_trials = int(request.data.get('n_trials', 40))
        param_ranges = request.data.get('param_ranges') or None
        tfs = request.data.get('timeframes')
        timeframes = tuple(tfs) if tfs else ('3y', 'max')
        try:
            return run_optimize_spec(
                spec, symbol, param_ranges=param_ranges, n_trials=n_trials,
                timeframes=timeframes, objective=objective,
            )
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            return Response({'error': f'Optimization failed: {e}'}, status=500)

    def _finalize_spec_result(self, strategy, request, result, spec_to_code, SpecError):
        if not result.get('best'):
            return Response({**result, 'published': False,
                             'message': 'No trial produced a tradable result.'})
        strategy.best_params = result['best']['params']
        strategy.best_score = result['best']['score']
        strategy.best_objective = request.data.get('objective', 'balanced')
        if request.data.get('publish'):
            return self._save_published_spec(strategy, result, spec_to_code, SpecError)
        strategy.save(update_fields=['best_params', 'best_score', 'best_objective'])
        result['published'] = False
        return Response(result)

    def _save_published_spec(self, strategy, result, spec_to_code, SpecError):
        best_spec = result['best']['spec']
        try:
            strategy.code = spec_to_code(best_spec)
        except SpecError as e:
            return Response({'error': f'Tuned spec failed to render: {e}'}, status=500)
        strategy.spec = best_spec
        strategy.save(update_fields=['code', 'spec', 'best_params', 'best_score', 'best_objective'])
        result['published'] = True
        result['code'] = strategy.code
        return Response(result)

    def _inject_params(self, code, best_params):
        for param_name, param_value in best_params.items():
            pattern = rf'(\b{param_name}\s*=\s*)[-+]?[\d\.]+'
            code = re.sub(pattern, rf'\g<1>{param_value}', code)
        return code

    def _load_strategies(self, request):
        return Strategy.objects.filter(Q(user=request.user) | Q(is_public=True))

    def _compare_strategy_periods(self, strategy_obj, symbol, periods, today):
        strategy_result = {
            'strategy_id': strategy_obj.id,
            'strategy_name': strategy_obj.name,
            'periods': {},
        }
        for period in periods:
            delta = _PERIOD_MAP.get(period)
            p_start = (today - delta) if delta else None
            res, error, _ = self._run_single_backtest(strategy_obj.code, symbol, p_start, today)
            strategy_result['periods'][period] = res if not error else {'error': error}
        return strategy_result

    def _optimize_compare_strategy(
        self, strategy_obj, symbol, periods, today, n_trials, force_refresh, batch_id, request
    ):
        param_ranges, _ = self._extract_params_simple(strategy_obj.code)
        strategy_result = {
            'strategy_id': strategy_obj.id,
            'strategy_name': strategy_obj.name,
            'periods': {},
        }
        for period in periods:
            delta = _PERIOD_MAP.get(period)
            p_start = (today - delta) if delta else None
            period_metrics = self._get_or_compute_period_metrics(
                strategy_obj, symbol, period, p_start, today,
                param_ranges, n_trials, force_refresh, batch_id, request,
            )
            strategy_result['periods'][period] = period_metrics
        return strategy_result

    def _get_or_compute_period_metrics(
        self, strategy_obj, symbol, period, p_start, today,
        param_ranges, n_trials, force_refresh, batch_id, request,
    ):
        if not force_refresh:
            cached = StrategyExperiment.objects.filter(
                strategy=strategy_obj, scope_value=symbol,
                metrics__period=period, status=StrategyExperiment.Status.SUCCESS,
            ).order_by('-created_at').first()
            if cached:
                return cached.metrics
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
                status=StrategyExperiment.Status.SUCCESS,
            )
        return period_metrics

    def _get_experiment_by_id(self, experiment_id):
        try:
            experiment = StrategyExperiment.objects.get(id=experiment_id)
            return Response(StrategyExperimentDetailSerializer(experiment).data)
        except StrategyExperiment.DoesNotExist:
            return Response({'error': 'Experiment not found'}, status=404)

    def _get_experiments_by_batch(self, batch_id, symbol):
        experiments = StrategyExperiment.objects.filter(batch_id=batch_id)
        if symbol:
            try:
                exp = experiments.get(scope_value=symbol, scope_type=ScopeType.SYMBOL)
                return Response(StrategyExperimentDetailSerializer(exp).data)
            except StrategyExperiment.DoesNotExist:
                return Response({'error': 'Experiment for this symbol in batch not found'}, status=404)
        return Response(StrategyExperimentSerializer(experiments, many=True).data)

    def _resolve_experiment_dates(self, request):
        today = date.today()
        end_date = request.data.get('end_date') or None
        start_date = request.data.get('start_date') or None
        if not end_date:
            end_date = today
        if not start_date:
            start_date = date(today.year - 5, today.month, today.day)
        return {'start': start_date, 'end': end_date}

    def _filter_published_qs(self, qs, request):
        symbol = request.query_params.get('symbol')
        sector = request.query_params.get('sector')
        scope_type_param = request.query_params.get('scope_type')
        if symbol:
            return qs.filter(scope_type=ScopeType.SYMBOL, scope_value=symbol)
        if sector:
            return qs.filter(scope_type=ScopeType.SECTOR, scope_value=sector)
        if scope_type_param == 'ALL':
            return qs.filter(scope_type=ScopeType.ALL)
        return Response({'error': 'Provide symbol, sector, or scope_type=ALL'}, status=400)

    # ------------------------------------------------------------------ #
    # Core backtest engine                                                 #
    # ------------------------------------------------------------------ #

    def _get_signal(self, code, symbol, start_date, end_date, params=None):
        result, error, _ = self._run_single_backtest(code, symbol, start_date, end_date, params=params)
        if error or 'error' in result:
            return None
        return None  # Placeholder — signal extraction not yet implemented

    def _get_bt_local_scope(self, symbol, params=None):
        return build_strategy_scope(symbol, params=params)

    def _run_single_backtest(self, code, symbol, start_date, end_date, params=None, cash=1000000):
        code = resolve_code(code)
        try:
            df = load_price_df(symbol, start=start_date, end=end_date)
            if df is None or len(df) < 20:
                return {}, 'Insufficient data (need at least 20 data points)', {}
            local_scope = self._get_bt_local_scope(symbol, params=params)
            exec(code, local_scope)  # noqa: S102
            strategy_class = self._find_strategy_class(local_scope)
            if not strategy_class:
                return {}, (
                    "No Strategy class found. Please ensure your code defines a class "
                    "inheriting from 'Strategy'."
                ), {}
            stats = self._execute_backtest(df, strategy_class, params, cash)
            plot_html = self._generate_plot_html(stats['bt'])
            metrics, _ = self._extract_bt_stats(stats['stats'])
            return self._clean_for_json(metrics), None, {'plot_html': plot_html}
        except Exception:
            return {}, traceback.format_exc(), {}

    def _find_strategy_class(self, local_scope):
        for obj in local_scope.values():
            if inspect.isclass(obj) and issubclass(obj, BTStrategy) and obj is not BTStrategy:
                return obj
        return None

    def _execute_backtest(self, df, strategy_class, params, cash):
        bt = Backtest(
            df, strategy_class, cash=cash,
            commission=nepse_commission, spread=DEFAULT_SPREAD,
            exclusive_orders=True,
        )
        run_params = {k: v for k, v in (params or {}).items() if hasattr(strategy_class, k)}
        stats = bt.run(**run_params)
        return {'stats': stats, 'bt': bt}

    def _generate_plot_html(self, bt):
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.html') as tmp:
                tmp_path = tmp.name
            bt.plot(filename=tmp_path, open_browser=False)
            with open(tmp_path, 'r', encoding='utf-8') as f:
                plot_html = f.read()
            _os.unlink(tmp_path)
            return plot_html
        except Exception:  # noqa: BLE001
            return None

    def _extract_bt_stats(self, stats):
        excluded = {'_strategy', '_equity', '_trades', '_bt'}
        clean = {}
        for k, v in stats.items():
            if k in excluded:
                continue
            clean_val = self._clean_for_json(v)
            if isinstance(clean_val, (str, int, float, bool, list, dict, type(None))):
                clean[k] = clean_val
        return clean, {}

    def _clean_for_json(self, data):
        """Recursively clean data for JSON serialization."""
        try:
            if pd.isna(data):
                return None
        except (TypeError, ValueError, AttributeError):
            pass
        if hasattr(data, 'isoformat'):
            return data.isoformat()
        if isinstance(data, pd.DataFrame):
            return self._clean_for_json(data.to_dict('records'))
        if isinstance(data, (pd.Series, pd.Index, np.ndarray)):
            items = data.tolist() if hasattr(data, 'tolist') else list(data)
            return [self._clean_for_json(x) for x in items]
        if isinstance(data, dict):
            return {str(k): self._clean_for_json(v) for k, v in data.items()}
        if isinstance(data, (list, tuple)):
            return [self._clean_for_json(x) for x in data]
        if isinstance(data, (str, int, float, bool, type(None))):
            return data
        return None

    def _extract_params_simple(self, code):
        params = {}
        search_space = {}
        regex = r'^\s*(\w+)\s*=\s*([\d.]+)'
        for match in re.finditer(regex, code, re.MULTILINE):
            p_name = match.group(1)
            p_val = match.group(2)
            if p_name in ['self', 'data'] or '.' in p_val:
                continue
            val = int(p_val)
            min_v, max_v = max(1, int(val * 0.5)), int(val * 2)
            params[p_name] = [min_v, max_v]
            search_space[p_name] = list(range(min_v, max_v + 1))
        return params, search_space

    def _optimize_single_period(self, code, symbol, start, end, p_ranges, trials):
        import optuna  # noqa: F401 — imported for future use
        return {'best_params': {}, 'best_value': 0}, None

