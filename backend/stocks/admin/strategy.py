from django.contrib import admin
from ..models.strategy import Strategy, StrategyExperiment, StrategySymbolConfig
from ..models import SignalEpisode

@admin.register(Strategy)
class StrategyAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'created_at')
    search_fields = ('name', 'user__username')

@admin.register(StrategyExperiment)
class StrategyExperimentAdmin(admin.ModelAdmin):
    list_display = ('strategy', 'run_type', 'scope_type', 'scope_value', 'status', 'created_at')
    list_filter = ('run_type', 'scope_type', 'status')
    search_fields = ('strategy__name', 'scope_value')

@admin.register(StrategySymbolConfig)
class StrategySymbolConfigAdmin(admin.ModelAdmin):
    list_display = ('strategy', 'symbol', 'preferred_objective')
    search_fields = ('symbol', 'strategy__name')

@admin.register(SignalEpisode)
class SignalEpisodeAdmin(admin.ModelAdmin):
    list_display = ('symbol', 'source', 'direction', 'status', 'start_date', 'end_date', 'pnl_percent')
    list_filter = ('source', 'status', 'direction')
    search_fields = ('symbol', 'strategy__name')
