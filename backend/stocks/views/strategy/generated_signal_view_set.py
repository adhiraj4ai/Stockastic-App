from django.db.models import Count, Q, Avg
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import SignalEpisode
from ...serializers.signal import SignalEpisodeSerializer
from .generated_signal_pagination import GeneratedSignalPagination


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
        qs = self._filter_by_status(request.query_params.get('status', ''))
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """Return only the most recent date's episodes, optionally filtered by source."""
        source = request.query_params.get('source')
        qs = SignalEpisode.objects.all()
        if source:
            qs = qs.filter(source=source)
        latest_date = (
            qs.order_by('-last_signal_date')
            .values_list('last_signal_date', flat=True)
            .first()
        )
        if not latest_date:
            return Response([])
        episodes = qs.filter(last_signal_date=latest_date).order_by('-entry_strength')
        return Response(SignalEpisodeSerializer(episodes, many=True).data)

    @action(detail=False, methods=['get'])
    def performance(self, request):
        """Return historical performance aggregated by source."""
        stats = SignalEpisode.objects.values('source').annotate(
            total=Count('id'),
            won=Count('id', filter=Q(status='WON')),
            lost=Count('id', filter=Q(status='LOST')),
            active=Count('id', filter=Q(status='ACTIVE')),
            avg_win_pnl=Avg('pnl_percent', filter=Q(status='WON')),
            avg_loss_pnl=Avg('pnl_percent', filter=Q(status='LOST')),
            avg_pnl=Avg('pnl_percent', filter=Q(status__in=['WON', 'LOST'])),
        )
        return Response([self._format_source_stat(s) for s in stats])

    @action(detail=False, methods=['get'])
    def performance_detailed(self, request):
        from stocks.services.strategy_performance_service import compute_performance_detailed
        return Response(compute_performance_detailed(request.user))

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Aggregated counts by source and direction for the latest signal date."""
        latest_date = self._get_latest_signal_date()
        if not latest_date:
            return Response({'date': None, 'sources': {}})
        qs = SignalEpisode.objects.filter(last_signal_date=latest_date)
        sources = self._aggregate_by_source(qs)
        return Response(self._build_summary_response(latest_date, qs, sources))

    # ------------------------------------------------------------------ #
    # Private helpers                                                     #
    # ------------------------------------------------------------------ #

    def _filter_by_status(self, status_param):
        if status_param:
            statuses = [s.strip().upper() for s in status_param.split(',')]
            return SignalEpisode.objects.filter(status__in=statuses).order_by('-start_date')
        return SignalEpisode.objects.all().order_by('-start_date')

    def _format_source_stat(self, s):
        total_resolved = s['won'] + s['lost']
        win_rate = (s['won'] / total_resolved * 100) if total_resolved > 0 else 0
        return {
            'source': s['source'],
            'total': s['total'],
            'won': s['won'],
            'lost': s['lost'],
            'active': s['active'],
            'win_rate': round(win_rate, 2),
            'avg_pnl': round(s['avg_pnl'] or 0, 2),
            'avg_win_pnl': round(s['avg_win_pnl'] or 0, 2),
            'avg_loss_pnl': round(s['avg_loss_pnl'] or 0, 2),
        }

    def _get_latest_signal_date(self):
        return (
            SignalEpisode.objects.order_by('-last_signal_date')
            .values_list('last_signal_date', flat=True)
            .first()
        )

    def _aggregate_by_source(self, qs):
        sources = {}
        for row in qs.values('source', 'direction').annotate(count=Count('id')):
            src = row['source']
            if src not in sources:
                sources[src] = {'BUY': 0, 'SELL': 0, 'total': 0}
            if row['direction'] in ('BUY', 'SELL'):
                sources[src][row['direction']] = row['count']
            sources[src]['total'] += row['count']
        return sources

    def _build_summary_response(self, latest_date, qs, sources):
        return {
            'date': latest_date.isoformat(),
            'total': qs.count(),
            'buys': qs.filter(direction='BUY').count(),
            'sells': qs.filter(direction='SELL').count(),
            'sources': sources,
        }
