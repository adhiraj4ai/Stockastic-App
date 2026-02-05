from django.contrib import admin
from ..models.strategy import Strategy, StrategyExperiment, StrategySymbolConfig, StrategySignal

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

@admin.register(StrategySignal)
class StrategySignalAdmin(admin.ModelAdmin):
    list_display = ('strategy', 'symbol', 'date', 'signal', 'last_close')
    list_filter = ('signal', 'date')
    search_fields = ('symbol', 'strategy__name')
