from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response

from ...models import SignalEpisode
from ...serializers.signal import SignalEpisodeSerializer
from .strategy_signal_pagination import StrategySignalPagination


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
        active = [self._enrich_episode(ep) for ep in active_qs]
        closed = [self._enrich_episode(ep) for ep in closed_qs]
        return Response({
            'active_positions': sorted(active, key=lambda x: x['days_held'], reverse=True),
            'closed_positions': closed,
            'summary': self._build_summary(active, closed),
        })

    def _enrich_episode(self, ep):
        data = SignalEpisodeSerializer(ep).data
        data['return_pct'] = float(ep.pnl_percent) if ep.pnl_percent is not None else 0.0
        return data

    def _build_summary(self, active, closed):
        returns = [p['return_pct'] for p in active + closed]
        held = [p['days_held'] for p in closed]
        return {
            'total_active': len(active),
            'total_closed': len(closed),
            'avg_return': round(sum(returns) / len(returns), 2) if returns else 0,
            'avg_holding_period': round(sum(held) / len(held), 1) if held else 0,
        }
