import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarketRiskCards, MarketRisk } from '@/components/RiskRadar';
import RiskRadarChart from './charts/RiskRadarChart';

interface RiskCardData {
    radar_data?: Array<{ axis: string; value: number; fullMark: number }>;
    alerts?: Array<{ type: string; level: string; message: string }>;
    summary?: { total_value: number; risk_level: 'LOW' | 'MEDIUM' | 'HIGH' };
    market_risk?: MarketRisk;
}

const LEVEL_TONE: Record<string, string> = {
    HIGH: 'text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-50/40 dark:bg-rose-950/20',
    MEDIUM: 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20',
    LOW: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20',
};

export default function RiskCard(data: RiskCardData) {
    const level = data.summary?.risk_level || 'LOW';
    return (
        <div className="surface p-4 text-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Shield size={14} className="text-muted-foreground" />
                    <span className="font-medium text-foreground">Portfolio risk</span>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold', LEVEL_TONE[level])}>
                    {level}
                </span>
            </div>
            {data.radar_data && data.radar_data.length >= 3 && (
                <div className="mb-3"><RiskRadarChart radar_data={data.radar_data} /></div>
            )}
            {data.radar_data && data.radar_data.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                    {data.radar_data.map((r) => (
                        <div key={r.axis} className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground w-32 truncate">{r.axis}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={cn('h-full', barTone(r.value, r.fullMark))}
                                    style={{ width: `${Math.min(100, (r.value / r.fullMark) * 100)}%` }}
                                />
                            </div>
                            <span className="text-[11px] tabular-nums text-foreground w-8 text-right">{r.value.toFixed(1)}</span>
                        </div>
                    ))}
                </div>
            )}
            {data.alerts && data.alerts.length > 0 && (
                <div className="border-t border-border pt-2 space-y-1">
                    {data.alerts.slice(0, 5).map((a, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px]">
                            <AlertTriangle size={12} className={cn('mt-0.5 shrink-0', alertTone(a.level))} />
                            <span className="text-foreground">{a.message}</span>
                        </div>
                    ))}
                </div>
            )}
            {data.market_risk && (
                <div className="mt-3">
                    <MarketRiskCards data={data.market_risk} />
                </div>
            )}
        </div>
    );
}

function barTone(v: number, max: number): string {
    const pct = v / max;
    if (pct >= 0.7) return 'bg-rose-500';
    if (pct >= 0.4) return 'bg-amber-500';
    return 'bg-emerald-500';
}

function alertTone(level: string): string {
    if (level === 'HIGH') return 'text-rose-500';
    if (level === 'MEDIUM') return 'text-amber-500';
    return 'text-muted-foreground';
}
