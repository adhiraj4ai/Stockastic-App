'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Search, ArrowRight, ChevronUp, ChevronDown, TrendingUp, TrendingDown,
    Activity, Crown, Zap, X, ExternalLink, Building2, Layers,
    BarChart3, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import Link from 'next/link';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import {
    AccumulationData, AggressivePattern,
    SmartMoneyData, BrokerDetailData,
} from '@/types/accumulation';
import { TrendBadge } from '@/components/accumulation/TrendBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ReactECharts from 'echarts-for-react';

// ─── Module-level constants (never recreated) ────────────────────────────────

const TIME_RANGES = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '2W', value: '2W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
    { label: '1Y+', value: 'ALL' },
] as const;

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] as const;
const PAGE_SIZE = 20;

const TABLE_COLS = [
    { label: 'Ticker', col: 'symbol', align: 'left', accent: '', hide: '' },
    { label: 'LTP', col: 'close', align: 'right', accent: '', hide: '' },
    { label: 'RSI', col: 'rsi', align: 'right', accent: '', hide: 'lg' },
    { label: 'ROC', col: 'roc', align: 'right', accent: '', hide: 'lg' },
    { label: 'Net Acc.', col: 'net_qty', align: 'right', accent: 'emerald', hide: '' },
    { label: 'Intensity', col: 'accumulation_ratio', align: 'center', accent: '', hide: '' },
    { label: 'Buyers', col: null, align: 'center', accent: '', hide: 'md' },
    { label: 'Sellers', col: null, align: 'center', accent: '', hide: 'md' },
] as const;

type BottomTab = 'aggressive' | 'smart-money';

// ─── Helper components (stable, outside main component) ──────────────────────

function SortIcon({
    col,
    sortConfig,
}: {
    col: string;
    sortConfig: { key: string; direction: 'asc' | 'desc' };
}) {
    if (sortConfig.key !== col) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortConfig.direction === 'asc'
        ? <ChevronUp className="w-3 h-3 text-indigo-400" />
        : <ChevronDown className="w-3 h-3 text-indigo-400" />;
}

function AggressiveCard({
    item,
    variant,
    onSelect,
}: {
    item: AggressivePattern;
    variant: 'accumulator' | 'distributor';
    onSelect: () => void;
}) {
    const isAcc = variant === 'accumulator';
    const brokers = isAcc ? item.producers : item.offloaders;
    const qty = isAcc ? item.institutional_buy : item.institutional_sell;

    return (
        <div
            onClick={onSelect}
            className={cn(
                'group bg-white dark:bg-card border rounded-xl p-4 shadow-sm hover:shadow-md cursor-pointer transition-all',
                isAcc
                    ? 'border-border dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-800/40'
                    : 'border-border dark:border-slate-800 hover:border-rose-200 dark:hover:border-rose-800/40',
            )}
        >
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className={cn(
                        'font-semibold text-base text-slate-900 dark:text-slate-100 transition-colors',
                        isAcc
                            ? 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
                            : 'group-hover:text-rose-600 dark:group-hover:text-rose-400',
                    )}>
                        {item.symbol}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium truncate max-w-[110px]">{item.name}</div>
                </div>
                <div className={cn(
                    'px-2 py-1 rounded-lg text-xs font-semibold border shrink-0',
                    isAcc
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30'
                        : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/30',
                )}>
                    {isAcc ? '+' : ''}{item.intensity.toFixed(1)}%
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 mb-3">
                <div>
                    <div className="text-slate-400 font-bold mb-0.5">{isAcc ? 'Inst. Buy' : 'Inst. Sell'}</div>
                    <div className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{formatNepaliNumber(qty)}</div>
                </div>
                <div>
                    <div className="text-slate-400 font-bold mb-0.5">Avg Vol 20D</div>
                    <div className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatNepaliNumber(Math.round(item.avg_vol_20d))}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-1">
                {brokers?.slice(0, 5).map(p => (
                    <Link href={`/broker/${p}`} key={p} onClick={e => e.stopPropagation()}>
                        <span className={cn(
                            'px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded text-[10px] font-semibold border transition-colors',
                            isAcc
                                ? 'text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                                : 'text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800/30 hover:bg-rose-50 dark:hover:bg-rose-900/30',
                        )}>
                            #{p}
                        </span>
                    </Link>
                ))}
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccumulationDashboard() {
    // Global controls
    const [range, setRange] = useState('1W');
    const [sector, setSector] = useState('All');
    const [sectors, setSectors] = useState<string[]>(['All']);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: keyof AccumulationData; direction: 'asc' | 'desc' }>({
        key: 'net_qty', direction: 'desc',
    });

    // Data
    const [overviewData, setOverviewData] = useState<AccumulationData[]>([]);
    const [aggressiveData, setAggressiveData] = useState<{ accumulators: AggressivePattern[]; distributors: AggressivePattern[] }>({ accumulators: [], distributors: [] });
    const [smartMoneyData, setSmartMoneyData] = useState<SmartMoneyData | null>(null);

    // Loading & Error
    const [loadingOverview, setLoadingOverview] = useState(true);
    const [loadingAggressive, setLoadingAggressive] = useState(true);
    const [loadingSmartMoney, setLoadingSmartMoney] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Master-detail
    const [selectedSymbol, setSelectedSymbol] = useState<AccumulationData | null>(null);
    const [detailData, setDetailData] = useState<BrokerDetailData | null>(null);

    // Bottom tab
    const [activeTab, setActiveTab] = useState<BottomTab>('aggressive');

    // Smart Money local range
    const [smartMoneyRange, setSmartMoneyRange] = useState('1D');

    // Abort controller refs — prevent stale responses overwriting fresh data
    const abortOverview = useRef<AbortController | null>(null);
    const abortDetail = useRef<AbortController | null>(null);
    const abortSmartMoney = useRef<AbortController | null>(null);

    // ─── Debounce search ────────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    // ─── Fetch: Overview + Aggressive in parallel ───────────────────────────
    useEffect(() => {
        abortOverview.current?.abort();
        abortOverview.current = new AbortController();
        const { signal } = abortOverview.current;

        setLoadingOverview(true);
        setLoadingAggressive(true);
        setError(null);

        Promise.all([
            api.get(`/api/stocks/companies/accumulation/?range=${range}`, { signal }),
            api.get(`/api/stocks/companies/aggressive/?range=${range}`, { signal }),
        ])
            .then(([ovRes, aggRes]) => {
                setOverviewData(ovRes.data);
                setAggressiveData(aggRes.data);
                setSectors(['All', ...Array.from(new Set(ovRes.data.map((d: AccumulationData) => d.sector))) as string[]]);
                setPage(1);
            })
            .catch(err => { if (err.name !== 'AbortError') { console.error('Failed to fetch main data', err); setError('Failed to load accumulation data. Please try again.'); } })
            .finally(() => { setLoadingOverview(false); setLoadingAggressive(false); });

        return () => abortOverview.current?.abort();
    }, [range]);

    // ─── Fetch: Smart Money (lazy — only when tab is active, refetch on range) ─
    useEffect(() => {
        if (activeTab !== 'smart-money') return;

        abortSmartMoney.current?.abort();
        abortSmartMoney.current = new AbortController();
        const { signal } = abortSmartMoney.current;

        setLoadingSmartMoney(true);
        api.get(`/api/stocks/floorsheet/smart_money/?range=${smartMoneyRange}`, { signal })
            .then(res => setSmartMoneyData(res.data))
            .catch(err => { if (err.name !== 'AbortError') console.error('Failed to fetch smart money', err); })
            .finally(() => setLoadingSmartMoney(false));

        return () => abortSmartMoney.current?.abort();
    }, [activeTab, smartMoneyRange]);

    // ─── Fetch: Detail broker chart (on symbol select or range change) ───────
    useEffect(() => {
        if (!selectedSymbol) return;

        abortDetail.current?.abort();
        abortDetail.current = new AbortController();
        const { signal } = abortDetail.current;

        setLoadingDetail(true);
        setDetailData(null);
        api.get(`/api/stocks/companies/brokers_graph/?symbol=${selectedSymbol.symbol}&range=${range}`, { signal })
            .then(res => setDetailData({
                history: res.data.history || [],
                topBrokers: res.data.top_brokers || [],
                buyLeaders: res.data.buy_leaders || [],
                sellLeaders: res.data.sell_leaders || [],
            }))
            .catch(err => { if (err.name !== 'AbortError') console.error('Failed to fetch detail', err); })
            .finally(() => setLoadingDetail(false));

        return () => abortDetail.current?.abort();
    }, [selectedSymbol?.symbol, range]);

    // ─── Derived / memoised ──────────────────────────────────────────────────

    const filteredOverview = useMemo(() => {
        const q = debouncedSearch.toLowerCase();
        return [...overviewData]
            .filter(d =>
                (sector === 'All' || d.sector === sector) &&
                (!q || d.symbol.toLowerCase().includes(q) || d.name.toLowerCase().includes(q))
            )
            .sort((a, b) => {
                const av = a[sortConfig.key] as any;
                const bv = b[sortConfig.key] as any;
                if (typeof av === 'number' && typeof bv === 'number')
                    return sortConfig.direction === 'asc' ? av - bv : bv - av;
                return sortConfig.direction === 'asc'
                    ? String(av).localeCompare(String(bv))
                    : String(bv).localeCompare(String(av));
            });
    }, [overviewData, sector, debouncedSearch, sortConfig]);

    const pagedRows = useMemo(() => filteredOverview.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredOverview, page]);
    const totalPages = Math.ceil(filteredOverview.length / PAGE_SIZE) || 1;

    const kpi = useMemo(() => ({
        accCount: overviewData.filter(d => d.net_qty > 0).length,
        distCount: overviewData.filter(d => d.net_qty < 0).length,
        totalNet: overviewData.reduce((s, d) => s + d.net_qty, 0),
        aggressiveCount: aggressiveData.accumulators.length + aggressiveData.distributors.length,
    }), [overviewData, aggressiveData]);

    const [isAggressiveAcc, isAggressiveDist] = useMemo(() => [
        aggressiveData.accumulators.some(a => a.symbol === selectedSymbol?.symbol),
        aggressiveData.distributors.some(a => a.symbol === selectedSymbol?.symbol),
    ], [aggressiveData, selectedSymbol?.symbol]);

    // ─── Handlers ────────────────────────────────────────────────────────────

    const handleSort = useCallback((key: keyof AccumulationData) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
        setPage(1);
    }, []);

    const handleRangeChange = useCallback((val: string) => {
        setRange(val);
        // page reset handled in overview fetch effect
    }, []);

    const handleSectorChange = useCallback((val: string) => {
        setSector(val);
        setPage(1);
    }, []);

    const getDetailChartOption = useCallback(() => {
        if (!detailData?.history.length) return {};
        const brokers = detailData.topBrokers.slice(0, 5);
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(15,23,42,0.92)',
                borderRadius: 8,
                padding: [8, 12],
                textStyle: { color: '#e2e8f0', fontSize: 11 },
                extraCssText: 'border:1px solid rgba(255,255,255,0.08)',
            },
            legend: {
                data: brokers.map(b => `#${b}`),
                bottom: 0, icon: 'circle', itemGap: 10,
                textStyle: { color: '#94a3b8', fontSize: 9 },
            },
            grid: { left: '2%', right: '2%', bottom: '18%', top: '2%', containLabel: true },
            xAxis: {
                type: 'category', boundaryGap: false,
                data: detailData.history.map(d => d.date),
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
                axisTick: { show: false },
                axisLabel: { color: '#475569', fontSize: 8, rotate: 30 },
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
                axisLabel: {
                    color: '#475569', fontSize: 8,
                    formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v),
                },
            },
            series: brokers.map((broker, i) => ({
                name: `#${broker}`, type: 'line',
                data: detailData.history.map(d => d[broker] || 0),
                smooth: true, showSymbol: false,
                lineStyle: { width: 1.5, color: CHART_COLORS[i % CHART_COLORS.length] },
                itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: CHART_COLORS[i % CHART_COLORS.length] + '28' },
                            { offset: 1, color: CHART_COLORS[i % CHART_COLORS.length] + '00' },
                        ],
                    },
                },
            })),
        };
    }, [detailData]);

    // ─── Render ───────────────────────────────────────────────────────────────

    if (error && !loadingOverview && overviewData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <AlertTriangle className="w-10 h-10 text-amber-500" />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-400">{error}</p>
                <Button variant="outline" onClick={() => setRange(range)} className="text-xs font-bold">
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-5 min-h-screen">

            {/* ═══ Global Controls Bar ════════════════════════════════════════ */}
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-lg px-4 py-3 flex flex-col xl:flex-row items-stretch xl:items-center gap-3 flex-wrap">
                <div className="bg-slate-50 dark:bg-card p-1 rounded-xl border border-border dark:border-border flex overflow-x-auto no-scrollbar shrink-0">
                    {TIME_RANGES.map(t => (
                        <button key={t.value} onClick={() => handleRangeChange(t.value)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 tracking-tight whitespace-nowrap',
                                range === t.value
                                    ? 'bg-orange-500 text-white shadow'
                                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                            )}>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden xl:block" />

                <div className="flex items-center gap-2 bg-slate-50 dark:bg-card px-3 py-1 rounded-xl border border-border dark:border-border shrink-0">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select value={sector} onChange={e => handleSectorChange(e.target.value)}
                        className="bg-transparent border-none text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none min-w-[120px] pr-1">
                        {sectors.map(s => <option key={s} value={s} className="bg-white dark:bg-card">{s}</option>)}
                    </select>
                </div>

                <div className="relative group flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    <Input
                        placeholder="Search symbol or name..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 h-9 rounded-xl bg-slate-50 dark:bg-card border-border dark:border-border text-xs font-bold focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold rounded-lg border border-emerald-100 dark:border-emerald-800/30">
                        ↑ {kpi.accCount} acc
                    </span>
                    <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 text-[11px] font-semibold rounded-lg border border-rose-100 dark:border-rose-800/30">
                        ↓ {kpi.distCount} dist
                    </span>
                </div>
            </div>

            {/* ═══ KPI Cards ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {([
                    {
                        label: 'Accumulating', value: `${kpi.accCount}`, unit: 'stocks',
                        sub: `${overviewData.length ? ((kpi.accCount / overviewData.length) * 100).toFixed(0) : 0}% of universe`,
                        icon: <TrendingUp className="w-5 h-5" />,
                        cls: { wrap: 'border-emerald-100 dark:border-emerald-900/20', icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', val: 'text-emerald-700 dark:text-emerald-400' },
                    },
                    {
                        label: 'Distributing', value: `${kpi.distCount}`, unit: 'stocks',
                        sub: `${overviewData.length ? ((kpi.distCount / overviewData.length) * 100).toFixed(0) : 0}% of universe`,
                        icon: <TrendingDown className="w-5 h-5" />,
                        cls: { wrap: 'border-rose-100 dark:border-rose-900/20', icon: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400', val: 'text-rose-700 dark:text-rose-400' },
                    },
                    {
                        label: 'Net Inst. Flow', value: `${kpi.totalNet >= 0 ? '+' : '-'}${formatNepaliNumber(Math.abs(kpi.totalNet))}`, unit: '',
                        sub: kpi.totalNet >= 0 ? 'Net buying pressure' : 'Net selling pressure',
                        icon: <Activity className="w-5 h-5" />,
                        cls: { wrap: 'border-indigo-100 dark:border-indigo-900/20', icon: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400', val: 'text-indigo-700 dark:text-indigo-400' },
                    },
                    {
                        label: 'Aggressive Movers', value: `${kpi.aggressiveCount}`, unit: 'signals',
                        sub: `${aggressiveData.accumulators.length} acc / ${aggressiveData.distributors.length} dist`,
                        icon: <Zap className="w-5 h-5" />,
                        cls: { wrap: 'border-amber-100 dark:border-amber-900/20', icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', val: 'text-amber-700 dark:text-amber-400' },
                    },
                ] as const).map((stat, i) => (
                    <div key={i} className={cn('bg-white dark:bg-card rounded-2xl border p-5 shadow-sm flex items-start gap-4 hover:shadow-md transition-all', stat.cls.wrap)}>
                        <div className={cn('p-2.5 rounded-xl shrink-0', stat.cls.icon)}>{stat.icon}</div>
                        <div className="min-w-0">
                            <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 truncate">{stat.label}</div>
                            <div className={cn('text-xl font-semibold tracking-tight', stat.cls.val)}>
                                {stat.value}<span className="text-sm ml-1 opacity-60">{stat.unit}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{stat.sub}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ═══ Master + Detail Panel ══════════════════════════════════════ */}
            <div className={cn(
                'grid gap-4 transition-all duration-300',
                selectedSymbol ? 'grid-cols-1 xl:grid-cols-[1fr_390px]' : 'grid-cols-1',
            )}>

                {/* ─── Master Table ──────────────────────────────────────────── */}
                <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-border dark:border-border bg-slate-50/50 dark:bg-muted flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Accumulation Overview</span>
                            <span className="text-[10px] font-semibold text-slate-400 px-2 py-0.5 bg-slate-100 dark:bg-muted rounded-full shrink-0">
                                {filteredOverview.length}
                            </span>
                        </div>
                        {selectedSymbol && (
                            <button onClick={() => setSelectedSymbol(null)}
                                className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 shrink-0 transition-colors">
                                <X className="w-3.5 h-3.5" /> Clear
                            </button>
                        )}
                    </div>

                    {loadingOverview ? <PageLoader text="Processing floor-sheet data..." /> : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr className="h-10 bg-slate-50/60 dark:bg-slate-800/20">
                                            {TABLE_COLS.map(h => (
                                                <th key={h.label}
                                                    onClick={() => h.col && handleSort(h.col as keyof AccumulationData)}
                                                    className={cn(
                                                        'px-4 py-2 sticky top-0 z-10 bg-slate-50/90 dark:bg-card/90 border-b border-border dark:border-slate-800 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                                                        h.col ? 'cursor-pointer hover:text-indigo-500' : '',
                                                        h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : 'text-left',
                                                        h.accent === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400',
                                                        h.hide === 'lg' ? 'hidden lg:table-cell' : h.hide === 'md' ? 'hidden md:table-cell' : '',
                                                    )}>
                                                    <div className={cn('flex items-center gap-1',
                                                        h.align === 'right' ? 'justify-end' : h.align === 'center' ? 'justify-center' : '',
                                                    )}>
                                                        {h.label}
                                                        {h.col && <SortIcon col={h.col} sortConfig={sortConfig} />}
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="w-6 sticky top-0 z-10 bg-slate-50/90 dark:bg-card/90 border-b border-border dark:border-slate-800" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="h-40 text-center text-slate-400 dark:text-slate-500 text-sm">
                                                    No results for current filters.
                                                </td>
                                            </tr>
                                        ) : pagedRows.map(item => (
                                            <tr
                                                key={item.symbol}
                                                onClick={() => setSelectedSymbol(prev => prev?.symbol === item.symbol ? null : item)}
                                                className={cn(
                                                    'group border-b border-slate-50 dark:border-slate-800/50 last:border-0 transition-colors duration-100 cursor-pointer border-l-[3px] animate-in fade-in duration-150',
                                                    selectedSymbol?.symbol === item.symbol
                                                        ? 'bg-indigo-50/60 dark:bg-indigo-900/10 border-l-indigo-500'
                                                        : item.net_qty > 0
                                                        ? 'hover:bg-emerald-50/20 dark:hover:bg-emerald-900/5 border-l-emerald-300/40 hover:border-l-emerald-500'
                                                        : item.net_qty < 0
                                                        ? 'hover:bg-rose-50/20 dark:hover:bg-rose-900/5 border-l-rose-300/40 hover:border-l-rose-500'
                                                        : 'hover:bg-slate-50/40 dark:hover:bg-slate-800/20 border-l-transparent',
                                                )}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-sm text-slate-900 dark:text-indigo-300 leading-none">{item.symbol}</div>
                                                    <div className="text-[9px] text-slate-400 font-medium truncate max-w-[88px] mt-0.5 hidden sm:block">{item.name}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                                                    {formatRupees(item.close, 1)}
                                                </td>
                                                <td className="px-4 py-3 text-right hidden lg:table-cell">
                                                    {item.rsi != null ? (
                                                        <span className={cn(
                                                            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                                                            item.rsi >= 70 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                                                : item.rsi <= 30 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
                                                        )}>{item.rsi.toFixed(1)}</span>
                                                    ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right hidden lg:table-cell">
                                                    <span className={cn('text-xs font-semibold tabular-nums',
                                                        item.roc != null && item.roc >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                                                    )}>
                                                        {item.roc != null ? `${item.roc >= 0 ? '+' : ''}${item.roc.toFixed(2)}%` : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className={cn('text-sm font-semibold tabular-nums',
                                                        item.net_qty >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                                                    )}>
                                                        {item.net_qty >= 0 ? '+' : ''}{formatNepaliNumber(item.net_qty)}
                                                    </span>
                                                </td>
                                                {/* Intensity bar — CSS transition, no framer-motion */}
                                                <td className="px-4 py-3 w-[130px]">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 bg-slate-100 dark:bg-muted rounded-full h-1.5 overflow-hidden">
                                                            <div
                                                                style={{ width: `${Math.min(item.accumulation_ratio, 100)}%`, transition: 'width 0.4s ease-out' }}
                                                                className={cn('h-full rounded-full',
                                                                    item.net_qty >= 0 ? 'bg-emerald-500' : 'bg-rose-500',
                                                                )}
                                                            />
                                                        </div>
                                                        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 w-7 text-right tabular-nums shrink-0">
                                                            {item.accumulation_ratio.toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 hidden md:table-cell">
                                                    <div className="flex gap-1 justify-center">
                                                        {item.top_buyers?.slice(0, 3).map(b => (
                                                            <span key={b} className="w-6 h-6 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded text-[9px] font-semibold border border-emerald-100 dark:border-emerald-800/30">
                                                                {b}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 hidden md:table-cell">
                                                    <div className="flex gap-1 justify-center">
                                                        {item.top_sellers?.slice(0, 3).map(b => (
                                                            <span key={b} className="w-6 h-6 flex items-center justify-center bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded text-[9px] font-semibold border border-rose-100 dark:border-rose-800/30">
                                                                {b}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3">
                                                    <ChevronRight className={cn(
                                                        'w-4 h-4 transition-all duration-200 shrink-0',
                                                        selectedSymbol?.symbol === item.symbol
                                                            ? 'text-indigo-500 rotate-90'
                                                            : 'text-slate-300 dark:text-slate-700 group-hover:text-slate-500',
                                                    )} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {filteredOverview.length > PAGE_SIZE && (
                                <div className="px-5 py-3 border-t border-border dark:border-border bg-slate-50/30 dark:bg-white/[0.01] flex items-center justify-between">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{filteredOverview.length} total</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-semibold text-slate-400">{page} / {totalPages}</span>
                                        <div className="flex gap-1.5">
                                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                                className="h-7 px-3 text-[10px] font-semibold rounded-lg border-slate-200 dark:border-border">Prev</Button>
                                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                                                className="h-7 px-3 text-[10px] font-semibold rounded-lg border-slate-200 dark:border-border">Next</Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ─── Detail Panel (framer-motion kept for mount/unmount slide) ─ */}
                <AnimatePresence>
                    {selectedSymbol && (
                        <motion.div
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 24 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden flex flex-col"
                        >
                            {/* Symbol Header */}
                            <div className="p-5 border-b border-border bg-muted/40">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <div className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">{selectedSymbol.symbol}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[210px] mt-0.5">{selectedSymbol.name}</div>
                                        <span className="mt-1.5 inline-block text-[9px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full font-semibold uppercase tracking-wider">
                                            {selectedSymbol.sector}
                                        </span>
                                    </div>
                                    <button onClick={() => setSelectedSymbol(null)}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    {([
                                        { label: 'LTP', val: formatRupees(selectedSymbol.close, 1), cls: 'text-slate-900 dark:text-slate-100' },
                                        {
                                            label: 'RSI', val: selectedSymbol.rsi?.toFixed(1) ?? '—',
                                            cls: selectedSymbol.rsi != null
                                                ? selectedSymbol.rsi >= 70 ? 'text-rose-600 dark:text-rose-400'
                                                    : selectedSymbol.rsi <= 30 ? 'text-emerald-600 dark:text-emerald-400'
                                                    : 'text-slate-700 dark:text-slate-200'
                                                : 'text-slate-400',
                                        },
                                        {
                                            label: 'ROC',
                                            val: selectedSymbol.roc != null ? `${selectedSymbol.roc >= 0 ? '+' : ''}${selectedSymbol.roc.toFixed(2)}%` : '—',
                                            cls: selectedSymbol.roc != null && selectedSymbol.roc >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                                        },
                                    ] as const).map(m => (
                                        <div key={m.label} className="bg-white/60 dark:bg-card rounded-xl p-2.5 border border-border dark:border-border">
                                            <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{m.label}</div>
                                            <div className={cn('text-base font-semibold font-mono tabular-nums', m.cls)}>{m.val}</div>
                                        </div>
                                    ))}
                                </div>

                                {(isAggressiveAcc || isAggressiveDist) && (
                                    <div className={cn(
                                        'mt-3 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold',
                                        isAggressiveAcc
                                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400'
                                            : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/30 text-rose-700 dark:text-rose-400',
                                    )}>
                                        <Zap className="w-3.5 h-3.5" />
                                        {isAggressiveAcc ? 'Aggressive Accumulator Signal' : 'Aggressive Distributor Signal'}
                                    </div>
                                )}
                            </div>

                            {/* Net Accumulation Bar — CSS transition */}
                            <div className="px-5 py-4 border-b border-border dark:border-border">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Net Accumulation ({range})</span>
                                    <span className={cn('text-sm font-semibold tabular-nums',
                                        selectedSymbol.net_qty >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                                    )}>
                                        {selectedSymbol.net_qty >= 0 ? '+' : ''}{formatNepaliNumber(selectedSymbol.net_qty)}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-muted rounded-full h-2 overflow-hidden">
                                    <div
                                        style={{ width: `${Math.min(selectedSymbol.accumulation_ratio, 100)}%`, transition: 'width 0.5s ease-out' }}
                                        className={cn('h-full rounded-full',
                                            selectedSymbol.net_qty >= 0
                                                ? 'bg-emerald-500'
                                                : 'bg-rose-500',
                                        )}
                                    />
                                </div>
                                <div className="flex justify-between mt-1.5">
                                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Buy Intensity</span>
                                    <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{selectedSymbol.accumulation_ratio.toFixed(1)}%</span>
                                </div>
                            </div>

                            {/* Broker Flow Chart */}
                            <div className="px-5 pt-4 pb-2 border-b border-border dark:border-border">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Broker Flow Chart</span>
                                    {loadingDetail && <span className="text-[9px] font-semibold text-indigo-500 animate-pulse">Loading...</span>}
                                </div>
                                {loadingDetail ? (
                                    <div className="h-[170px] flex items-center justify-center">
                                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : detailData && detailData.history.length > 0 ? (
                                    <ReactECharts option={getDetailChartOption()} style={{ height: '170px' }} opts={{ renderer: 'svg' }} />
                                ) : (
                                    <div className="h-[170px] flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs font-bold">
                                        No chart data available
                                    </div>
                                )}
                            </div>

                            {/* Buy / Sell Leaders */}
                            {detailData && (detailData.buyLeaders.length > 0 || detailData.sellLeaders.length > 0) && (
                                <div className="px-5 py-4 border-b border-border dark:border-border grid grid-cols-2 gap-3">
                                    {([
                                        { title: 'Top Buyers', items: detailData.buyLeaders.slice(0, 4), isGreen: true },
                                        { title: 'Top Sellers', items: detailData.sellLeaders.slice(0, 4), isGreen: false },
                                    ] as const).map(side => (
                                        <div key={side.title}>
                                            <div className={cn('text-[9px] font-semibold uppercase tracking-wider mb-2',
                                                side.isGreen ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                                            )}>{side.title}</div>
                                            <div className="space-y-1">
                                                {side.items.map((l, i) => (
                                                    <div key={i} className={cn(
                                                        'flex items-center justify-between rounded-lg px-2 py-1.5',
                                                        side.isGreen ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : 'bg-rose-50/60 dark:bg-rose-900/10',
                                                    )}>
                                                        <Link href={`/broker/${l.broker}`} onClick={e => e.stopPropagation()}>
                                                            <span className={cn('text-[10px] font-semibold hover:underline',
                                                                side.isGreen ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400',
                                                            )}>#{l.broker}</span>
                                                        </Link>
                                                        <span className={cn('text-[10px] font-semibold tabular-nums',
                                                            side.isGreen ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                                                        )}>
                                                            {side.isGreen ? '+' : ''}{formatNepaliNumber(Math.abs(l.net_qty ?? l.buy_qty ?? l.sell_qty ?? 0))}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div className="px-5 py-4 mt-auto flex gap-2 flex-wrap">
                                <Link href={`/ticker/${selectedSymbol.symbol}`} className="flex-1 min-w-[100px]">
                                    <Button className="w-full h-9 text-[11px] font-semibold bg-slate-900 dark:bg-indigo-600 hover:bg-black dark:hover:bg-indigo-700 text-white rounded-xl gap-1.5 shadow-md">
                                        <ExternalLink className="w-3.5 h-3.5" /> Full Analysis
                                    </Button>
                                </Link>
                                <Link href={`/accumulation/navigator?symbol=${selectedSymbol.symbol}`}>
                                    <Button variant="outline" className="h-9 px-3 text-[11px] font-semibold rounded-xl border-slate-200 dark:border-border gap-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
                                        <Activity className="w-3.5 h-3.5" />
                                    </Button>
                                </Link>
                                <Link href={`/accumulation/history?symbol=${selectedSymbol.symbol}`}>
                                    <Button variant="outline" className="h-9 px-3 text-[11px] font-semibold rounded-xl border-slate-200 dark:border-border gap-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
                                        <BarChart3 className="w-3.5 h-3.5" />
                                    </Button>
                                </Link>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ═══ Bottom Tabbed Section ══════════════════════════════════════ */}
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden">
                <div className="border-b border-border dark:border-border bg-slate-50/50 dark:bg-muted px-5 flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {([
                        { key: 'aggressive', label: 'Aggressive Patterns', icon: <Zap className="w-3.5 h-3.5" /> },
                        { key: 'smart-money', label: 'Smart Money', icon: <Crown className="w-3.5 h-3.5" /> },
                    ] as { key: BottomTab; label: string; icon: React.ReactNode }[]).map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'flex items-center gap-2 px-4 py-4 text-xs font-semibold tracking-tight border-b-2 transition-all whitespace-nowrap',
                                activeTab === tab.key
                                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                            )}>
                            {tab.icon}{tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-5">

                    {/* ── Aggressive Patterns ──────────────────────────────── */}
                    {activeTab === 'aggressive' && (
                        loadingAggressive ? <PageLoader text="Scanning for aggressive patterns..." /> : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {([
                                    { variant: 'accumulator' as const, items: aggressiveData.accumulators, label: 'Aggressive Accumulators', isGreen: true },
                                    { variant: 'distributor' as const, items: aggressiveData.distributors, label: 'Aggressive Distributors', isGreen: false },
                                ]).map(col => (
                                    <div key={col.variant}>
                                        <h3 className={cn('flex items-center gap-2 text-sm font-semibold mb-4',
                                            col.isGreen ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400',
                                        )}>
                                            {col.isGreen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            {col.label}
                                            <span className={cn('ml-auto text-[10px] px-2 py-0.5 rounded-full border',
                                                col.isGreen
                                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30'
                                                    : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/30',
                                            )}>
                                                {col.items.length}
                                            </span>
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
                                            {col.items.length === 0 ? (
                                                <div className="col-span-2 p-8 text-center text-slate-400 text-sm bg-slate-50 dark:bg-card rounded-xl">
                                                    No {col.isGreen ? 'aggressive accumulation' : 'aggressive distribution'} detected
                                                </div>
                                            ) : col.items.map((item, idx) => (
                                                <AggressiveCard
                                                    key={idx}
                                                    item={item}
                                                    variant={col.variant}
                                                    onSelect={() => setSelectedSymbol(overviewData.find(d => d.symbol === item.symbol) ?? null)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* ── Smart Money ───────────────────────────────────────── */}
                    {activeTab === 'smart-money' && (
                        <>
                            <div className="flex items-center gap-1.5 mb-5">
                                {(['1D', '2D', '3D', '1W', '1M', '3M', '6M'] as const).map(r => (
                                    <button key={r} onClick={() => setSmartMoneyRange(r)}
                                        className={cn(
                                            'px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-all',
                                            smartMoneyRange === r
                                                ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-amber-300 dark:hover:border-amber-700 hover:text-amber-600 dark:hover:text-amber-400',
                                        )}>{r}</button>
                                ))}
                            </div>
                        {loadingSmartMoney ? <PageLoader text="Loading smart money signals..." /> : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div>
                                    <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400 mb-4">
                                        <Crown className="w-4 h-4 fill-current" />
                                        Smart Broker Leaderboard
                                    </h3>
                                    <div className="space-y-2">
                                        {!smartMoneyData?.leaderboard?.length ? (
                                            <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 dark:bg-card rounded-xl">No leaderboard data</div>
                                        ) : smartMoneyData.leaderboard.map((broker, idx) => (
                                            <Link href={`/broker/${broker.broker_id}`} key={broker.broker_id}>
                                                <div className="flex items-center gap-3 p-3 bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800 hover:border-amber-200 dark:hover:border-amber-800/30 transition-all">
                                                    <div className={cn(
                                                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                                                        idx === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
                                                            : idx === 1 ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                            : idx === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                                                            : 'bg-slate-50 text-slate-400 dark:bg-card dark:text-slate-500',
                                                    )}>{idx + 1}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">Broker #{broker.broker_id}</div>
                                                        <div className="text-[10px] text-slate-400">{broker.rank} Tier</div>
                                                    </div>
                                                    <div className="text-sm font-semibold text-amber-600 dark:text-amber-400 shrink-0">{broker.score} pts</div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>

                                <div className="lg:col-span-2">
                                    <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-4">
                                        <Zap className="w-4 h-4 fill-current" />
                                        Active Whale Signals
                                        {smartMoneyData?.signals && smartMoneyData.signals.length > 0 && (
                                            <span className="ml-auto text-[10px] px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-800/30">
                                                {smartMoneyData.signals[0].date}
                                            </span>
                                        )}
                                    </h3>
                                    <div className="overflow-x-auto rounded-xl border border-border dark:border-slate-800">
                                        <table className="w-full text-xs">
                                            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-border dark:border-slate-800">
                                                <tr>
                                                    {['Broker', 'Symbol', 'Qty', 'Avg Price', 'LTP', 'Amount'].map(h => (
                                                        <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                                {!smartMoneyData?.signals?.length ? (
                                                    <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-sm">No whale signals detected recently</td></tr>
                                                ) : smartMoneyData.signals.map((signal, idx) => (
                                                    <tr key={idx} className="hover:bg-amber-50/30 dark:hover:bg-amber-900/5 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <Link href={`/broker/${signal.broker_id}`}>
                                                                <span className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg font-semibold border border-amber-100 dark:border-amber-800/30 hover:bg-amber-100 transition-colors text-[10px]">
                                                                    #{signal.broker_id}
                                                                </span>
                                                            </Link>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <Link href={`/ticker/${signal.symbol}`}>
                                                                <span className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">{signal.symbol}</span>
                                                            </Link>
                                                        </td>
                                                        <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">{signal.qty.toLocaleString()}</td>
                                                        <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 tabular-nums">{formatRupees(signal.avg_buy_price, 0)}</td>
                                                        <td className="px-4 py-3 font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{formatRupees(signal.ltp, 0)}</td>
                                                        <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatRupees(signal.amount, 0)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
