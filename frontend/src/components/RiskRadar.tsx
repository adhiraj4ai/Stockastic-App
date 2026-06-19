import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip as RechartsTooltip
} from 'recharts';
import api from '@/lib/api';
import { Loader2, AlertTriangle, ShieldCheck, Info, Activity } from 'lucide-react';

export interface RiskAlert {
    type: string;
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
}

interface RadarData {
    axis: string;
    value: number;
    fullMark: number;
}

export interface RiskAnalysis {
    radar_data: RadarData[];
    alerts: RiskAlert[];
    summary: {
        total_value: number;
        risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
    };
}

export interface RiskAnalysisState {
    loading: boolean;
    data: RiskAnalysis | null;
    error: string | null;
}

export function useRiskAnalysis(accountId?: string): RiskAnalysisState {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<RiskAnalysis | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRisk = async () => {
            setLoading(true);
            try {
                const response = await api.get(`/api/stocks/portfolio/risk-radar/analysis/`, {
                    params: { account: accountId }
                });
                setData(response.data);
            } catch (err) {
                console.error("Risk analysis failed", err);
                setError("Failed to load risk analysis.");
            } finally {
                setLoading(false);
            }
        };

        fetchRisk();
    }, [accountId]);

    return { loading, data, error };
}

const hasNoRiskData = (state: RiskAnalysisState) =>
    !!state.error || !state.data || state.data.radar_data.length === 0;

const riskBadgeColor = (level: string) => {
    switch (level) {
        case 'HIGH': return 'bg-red-500 hover:bg-red-600';
        case 'MEDIUM': return 'bg-orange-500 hover:bg-orange-600';
        default: return 'bg-emerald-500 hover:bg-emerald-600';
    }
};

function RiskCardLoading() {
    return (
        <Card className="h-[400px] flex items-center justify-center rounded-2xl border border-border shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </Card>
    );
}

function RiskCardEmpty() {
    return (
        <Card className="h-[400px] flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-border shadow-sm">
            <Info className="h-10 w-10 text-gray-400 mb-2" />
            <p className="text-gray-500">Not enough data for risk analysis yet.</p>
        </Card>
    );
}

function RiskRadarGraph({ data }: { data: RiskAnalysis }) {
    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data.radar_data}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 10]} axisLine={false} tick={false} />
                    <Radar name="Portfolio Risk" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}

export function RiskRadarChart({ state }: { state: RiskAnalysisState }) {
    if (state.loading) return <RiskCardLoading />;
    if (hasNoRiskData(state)) return <RiskCardEmpty />;
    const data = state.data!;
    return (
        <Card className="overflow-hidden rounded-2xl border border-border bg-white/50 dark:bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="p-0">
                <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-gradient-to-r from-amber-500/15 to-transparent px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-amber-500" />
                        <CardTitle className="text-xs font-semibold text-foreground">Portfolio Risk Radar</CardTitle>
                    </div>
                    <Badge className={`${riskBadgeColor(data.summary.risk_level)} text-white`}>
                        {data.summary.risk_level} RISK
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                <CardDescription className="text-[11px] text-muted-foreground">Multi-dimensional exposure analysis</CardDescription>
                <RiskRadarGraph data={data} />
            </CardContent>
        </Card>
    );
}

function RiskAlertList({ alerts }: { alerts: RiskAlert[] }) {
    if (alerts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-emerald-800 dark:text-emerald-400 font-medium">No major risks detected</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">Your portfolio diversification is within healthy limits.</p>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            {alerts.map((alert, idx) => (
                <Alert key={idx} variant={alert.level === 'HIGH' ? 'destructive' : 'default'} className="border-none shadow-md">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-sm font-bold">{alert.type}</AlertTitle>
                    <AlertDescription className="text-xs opacity-90">{alert.message}</AlertDescription>
                </Alert>
            ))}
        </div>
    );
}

function AnalyticsTip({ level }: { level: string }) {
    const tip = level === 'HIGH'
        ? 'Consider diversifying into other sectors to lower your concentration risk.'
        : 'Balanced allocation detected. Keep monitoring liquidity for low-cap holdings.';
    return (
        <div className="mt-6 p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1">
                <span className="uppercase tracking-tight text-[10px] opacity-70 flex items-center gap-1"><Info className="h-3 w-3" /> Analytics tip</span>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 italic">&quot;{tip}&quot;</p>
        </div>
    );
}

export function RiskDiagnostics({ state }: { state: RiskAnalysisState }) {
    if (state.loading) return <RiskCardLoading />;
    if (hasNoRiskData(state)) return <RiskCardEmpty />;
    const data = state.data!;
    return (
        <Card className="rounded-2xl border border-border bg-white/50 dark:bg-card shadow-sm hover:shadow-md transition-shadow h-full">
            <CardHeader className="p-0">
                <div className="flex items-center gap-2 rounded-t-2xl bg-gradient-to-r from-amber-500/15 to-transparent px-4 py-2.5">
                    <CardTitle className="text-xs font-semibold text-foreground">Risk diagnostics</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <RiskAlertList alerts={data.alerts} />
                <AnalyticsTip level={data.summary.risk_level} />
            </CardContent>
        </Card>
    );
}
