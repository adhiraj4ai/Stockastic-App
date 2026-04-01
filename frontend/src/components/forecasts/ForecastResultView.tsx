import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Activity,
    Target,
    Database,
    Clock,
    LineChart as LineChartIcon,
    Settings2,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    Info
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface JobDetails {
    id: number;
    task_id: string;
    symbol: string;
    model_type: string;
    status: string;
    started_at: string;
    completed_at: string;
    duration: number;
    progress_message: string;
    error_message: string;
    hyperparameters: Record<string, string | number | boolean>;
    result_data: Record<string, number | string>;
    historical_prices: Array<{ date: string; price: number }>;
    actual_test_data: Array<{ date: string; price: number }>;
    test_predictions: Array<{ date: string; price: number }>;
    future_forecasts: Array<{ date: string; price: number; upper?: number; lower?: number }>;
    split_dates: {
        train_start?: string;
        train_end?: string;
        val_start?: string;
        val_end?: string;
        test_start?: string;
        test_end?: string;
    };
}

interface ForecastResultViewProps {
    job: JobDetails;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'NPR',
        maximumFractionDigits: 2
    }).format(value);
};

export default function ForecastResultView({ job }: ForecastResultViewProps) {
    const [logsExpanded, setLogsExpanded] = useState(false); // Can be removed later if unused

    const chartOption = useMemo(() => {
        if (!job) return {};

        const actualTestData = (job.actual_test_data || []).map(p => [p.date, p.price]);
        const testPredData = (job.test_predictions || []).map(p => [p.date, p.price]);
        const forecastData = (job.future_forecasts || []).map(p => [p.date, p.price]);

        const lowerData = (job.future_forecasts || []).map(p => [p.date, p.lower || p.price]);
        const upperDiffData = (job.future_forecasts || []).map(p => [p.date, (p.upper || p.price) - (p.lower || p.price)]);

        // Mark Areas for splits
        const markAreas_data = [];
        if (job.split_dates?.train_start && job.split_dates?.train_end) {
            markAreas_data.push([
                { name: 'TRAINING', xAxis: job.split_dates.train_start, itemStyle: { color: 'rgba(59, 130, 246, 0.05)' }, label: { color: '#94a3b8', fontSize: 10, position: 'insideTopLeft' } },
                { xAxis: job.split_dates.train_end }
            ]);
        }
        if (job.split_dates?.val_start && job.split_dates?.val_end) {
            markAreas_data.push([
                { name: 'VALIDATION', xAxis: job.split_dates.val_start, itemStyle: { color: 'rgba(245, 158, 11, 0.05)' }, label: { color: '#d97706', fontSize: 10, position: 'insideTopLeft' } },
                { xAxis: job.split_dates.val_end }
            ]);
        }
        if (job.split_dates?.test_start) {
            markAreas_data.push([
                { name: 'TEST', xAxis: job.split_dates.test_start, itemStyle: { color: 'rgba(16, 185, 129, 0.05)' }, label: { color: '#059669', fontSize: 10, position: 'insideTopLeft' } },
                { xAxis: job.split_dates.test_end || (testPredData.length > 0 ? testPredData[testPredData.length - 1][0] : undefined) }
            ]);
        }

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#eee',
                borderWidth: 1,
                textStyle: { color: '#333', fontSize: 12 },
                axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } }
            },
            toolbox: {
                feature: {
                    dataZoom: {
                        yAxisIndex: 'none',
                        title: { zoom: 'Zoom', back: 'Reset' }
                    },
                    restore: { title: 'Restore' },
                    saveAsImage: { title: 'Save as Image' }
                },
                right: 20,
                top: 10
            },
            dataZoom: [
                {
                    type: 'slider',
                    show: true,
                    xAxisIndex: [0],
                    start: 0,
                    end: 100,
                    bottom: 10
                },
                {
                    type: 'inside',
                    xAxisIndex: [0],
                    start: 0,
                    end: 100
                }
            ],
            legend: {
                data: ['Training Data', 'Actual Test Data', 'Test Prediction', 'Forecast', 'Confidence'],
                top: 0,
                textStyle: { fontSize: 11, fontWeight: 'bold' },
                itemGap: 20,
                selected: { 'Training Data': false }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'time',
                boundaryGap: false,
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: { color: '#64748b', fontSize: 11, fontWeight: 'bold' },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLine: { show: false },
                axisLabel: { color: '#64748b', fontSize: 11 },
                splitLine: { lineStyle: { color: '#f1f5f9' } }
            },
            series: [
                {
                    name: 'Training Data',
                    type: 'line',
                    symbol: 'none',
                    data: (job.historical_prices || []).map(p => [p.date, p.price]),
                    lineStyle: { color: '#94a3b8', width: 1.5 },
                    itemStyle: { color: '#94a3b8' },
                    markArea: {
                        data: markAreas_data
                    }
                },
                {
                    name: 'Actual Test Data',
                    type: 'line',
                    symbol: 'none',
                    data: actualTestData,
                    lineStyle: { color: '#10b981', width: 2 },
                    itemStyle: { color: '#10b981' }
                },
                {
                    name: 'Test Prediction',
                    type: 'line',
                    symbol: 'none',
                    data: testPredData,
                    lineStyle: { color: '#f97316', width: 2, type: 'dashed' },
                    itemStyle: { color: '#f97316' }
                },
                {
                    name: 'Forecast',
                    type: 'line',
                    symbol: 'none',
                    data: forecastData,
                    lineStyle: { color: '#3b82f6', width: 2 },
                    itemStyle: { color: '#3b82f6' }
                },
                {
                    name: 'L',
                    type: 'line',
                    data: lowerData,
                    lineStyle: { opacity: 0 },
                    stack: 'confidence-band',
                    symbol: 'none'
                },
                {
                    name: 'Confidence',
                    type: 'line',
                    data: upperDiffData,
                    lineStyle: { opacity: 0 },
                    areaStyle: { color: '#3b82f6', opacity: 0.1 },
                    stack: 'confidence-band',
                    symbol: 'none'
                }
            ]
        };
    }, [job]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200/50 px-3 py-1 rounded-full text-[10px] font-bold">Success</Badge>;
            case 'RUNNING':
                return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200/50 px-3 py-1 rounded-full text-[10px] font-bold animate-pulse">Running</Badge>;
            case 'FAILED':
                return <Badge className="bg-red-500/10 text-red-600 border-red-200/50 px-3 py-1 rounded-full text-[10px] font-bold">Failed</Badge>;
            default:
                return <Badge variant="outline" className="px-3 py-1 rounded-full text-[10px] font-bold tracking-tight">{status}</Badge>;
        }
    };

    const formatMetric = (val: string | number | undefined) => {
        if (val === undefined) return 'N/A';
        const num = Number(val);
        return isNaN(num) ? String(val) : num.toFixed(2);
    };

    return (
        <div className="space-y-2">
            {/* Analytics Chart - First */}
            <Card className="border-0 shadow-[0_2px_10px_rgb(0,0,0,0.02)] bg-white rounded-xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100/50 px-4 py-2">
                    <CardTitle className="text-lg font-bold text-slate-700 flex items-center gap-2">
                        <LineChartIcon className="w-5 h-5 text-blue-600" />
                        Performance & Forecast
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                    <div className="h-[320px] w-full">
                        <ReactECharts
                            option={chartOption}
                            style={{ height: '100%', width: '100%' }}
                            notMerge={true}
                            lazyUpdate={true}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Training Configuration - Second */}
            <Card className="border-0 shadow-[0_2px_10px_rgb(0,0,0,0.02)] bg-white rounded-xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100/50 px-4 py-2">
                    <CardTitle className="text-base font-bold text-slate-700 flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-blue-600" />
                        Training Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-4 py-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-1.5">
                        <div>
                            <div className="text-[10px] text-slate-400 mb-0.5 font-medium tracking-tight">Model</div>
                            <div className="text-xs font-bold text-slate-900 tracking-tight">{job.model_type}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 mb-0.5 font-medium tracking-tight">Symbol</div>
                            <div className="text-xs font-bold text-slate-900 tracking-tight">{job.symbol}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 mb-0.5 font-medium tracking-tight">Duration</div>
                            <div className="text-xs font-bold text-slate-900 tracking-tight">{job.duration ? `${job.duration.toFixed(1)}s` : 'N/A'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 mb-0.5 font-medium tracking-tight">Status</div>
                            <div className="text-xs font-bold">{getStatusBadge(job.status)}</div>
                        </div>
                        {job.hyperparameters && Object.entries(job.hyperparameters).map(([key, value]) => (
                            <div key={key}>
                                <div className="text-[10px] text-slate-400 mb-0.5 font-medium tracking-tight truncate" title={key.replace(/_/g, ' ')}>
                                    {key.replace(/_/g, ' ')}
                                </div>
                                <div className="text-xs font-bold text-slate-900 truncate tracking-tight">
                                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Metrics Table */}
                <Card className="border-0 shadow-[0_2px_10px_rgb(0,0,0,0.02)] bg-white rounded-xl overflow-hidden h-full">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100/50 px-4 py-2">
                        <CardTitle className="text-base font-bold text-slate-700 flex items-center gap-2">
                            <Target className="w-4 h-4 text-blue-600" />
                            Evaluation Metrics
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-600 tracking-tight">Metric</th>
                                        <th className="px-4 py-2 text-right text-[10px] font-semibold text-slate-600 tracking-tight">Value</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {[
                                        { label: 'Test MAPE', value: job.result_data?.test_mape, unit: '%', desc: 'Mean Absolute Percentage Error - Lower is better', color: 'text-blue-600' },
                                        { label: 'Test RMSE', value: job.result_data?.test_rmse, unit: '', desc: 'Root Mean Squared Error - Lower is better', color: 'text-slate-900' },
                                        { label: 'Test MAE', value: job.result_data?.test_mae, unit: '', desc: 'Mean Absolute Error - Lower is better', color: 'text-slate-900' },
                                        { label: 'R² Score', value: job.result_data?.test_r2, unit: '', desc: 'Coefficient of Determination - Higher is better', color: 'text-emerald-600' },
                                        { label: 'Training Samples', value: job.result_data?.training_samples, unit: '', desc: 'Number of samples used for training', color: 'text-slate-900' },
                                        { label: 'Val Samples', value: job.result_data?.validation_samples, unit: '', desc: 'Number of samples used for validation', color: 'text-slate-900' },
                                        { label: 'Test Samples', value: job.result_data?.test_samples, unit: '', desc: 'Number of samples used for testing', color: 'text-slate-900' },
                                        { label: 'Horizon', value: job.result_data?.forecast_days || '30', unit: ' d', desc: 'Number of days forecasted into the future', color: 'text-emerald-600' }
                                    ].map((metric, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-1.5 text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                                                {metric.label}
                                                <TooltipProvider>
                                                    <Tooltip delayDuration={0}>
                                                        <TooltipTrigger>
                                                            <Info className="w-3 h-3 text-slate-400 hover:text-blue-500 transition-colors" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="text-[10px]">{metric.desc}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </td>
                                            <td className={`px-4 py-1.5 text-[11px] font-bold text-right tabular-nums ${metric.color}`}>
                                                {formatMetric(metric.value)}{metric.unit}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Forecast Data Table */}
                <Card className="border-0 shadow-[0_2px_10px_rgb(0,0,0,0.02)] bg-white rounded-xl overflow-hidden h-full">
                    <CardHeader className="bg-slate-50/30 border-b border-slate-100/50 px-4 py-2">
                        <CardTitle className="text-base font-bold text-slate-700 flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-600" />
                            Forecast Points
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 tracking-tight">Date</th>
                                        <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 tracking-tight">Price</th>
                                        <th className="px-4 py-2 text-[10px] font-semibold text-slate-500 tracking-tight text-right">Range</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {job.future_forecasts && job.future_forecasts.length > 0 ? (
                                        job.future_forecasts.map((point, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-1.5 text-[11px] font-medium text-slate-700">
                                                    {new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </td>
                                                <td className="px-4 py-1.5 text-[11px] font-bold text-blue-600 tabular-nums">
                                                    {formatCurrency(point.price)}
                                                </td>
                                                <td className="px-4 py-1.5 text-[10px] text-slate-50 text-right tabular-nums">
                                                    {point.lower ? `${Math.round(point.lower)} - ${Math.round(point.upper || 0)}` : '-'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-4 text-center text-[10px] text-slate-400 italic">
                                                No forecast data available.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
