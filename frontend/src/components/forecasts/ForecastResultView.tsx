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
    CheckCircle
} from 'lucide-react';

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

export default function ForecastResultView({ job }: ForecastResultViewProps) {
    const [logsExpanded, setLogsExpanded] = useState(false);

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
                itemGap: 20
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
                return <Badge variant="outline" className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest">{status}</Badge>;
        }
    };

    const formatMetric = (val: string | number | undefined) => {
        if (val === undefined) return 'N/A';
        const num = Number(val);
        return isNaN(num) ? String(val) : num.toFixed(2);
    };

    return (
        <div className="space-y-8">
            {/* Analytics Chart - First */}
            <Card className="border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100/50 px-8 py-6">
                    <CardTitle className="text-sm font-bold text-slate-500 flex items-center gap-2">
                        <LineChartIcon className="w-5 h-5 text-blue-600" />
                        Performance & Forecast
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                    <div className="h-[450px] w-full">
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
            <Card className="border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100/50 px-8 py-6">
                    <CardTitle className="text-sm font-bold text-slate-500 flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-blue-600" />
                        Training Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        <div>
                            <div className="text-xs text-slate-500 mb-1 font-medium">Model Type</div>
                            <div className="text-sm font-bold text-slate-900">{job.model_type}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 mb-1 font-medium">Symbol</div>
                            <div className="text-sm font-bold text-slate-900">{job.symbol}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 mb-1 font-medium">Duration</div>
                            <div className="text-sm font-bold text-slate-900">{job.duration ? `${job.duration.toFixed(1)}s` : 'N/A'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 mb-1 font-medium">Status</div>
                            <div className="text-sm font-bold">{getStatusBadge(job.status)}</div>
                        </div>
                        {job.hyperparameters && Object.entries(job.hyperparameters).map(([key, value]) => (
                            <div key={key}>
                                <div className="text-xs text-slate-500 mb-1 font-medium capitalize">{key.replace(/_/g, ' ')}</div>
                                <div className="text-sm font-bold text-slate-900">
                                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Metrics Table - Third */}
            <Card className="border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100/50 px-8 py-6">
                    <CardTitle className="text-sm font-bold text-slate-500 flex items-center gap-2">
                        <Target className="w-5 h-5 text-blue-600" />
                        Evaluation Metrics
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50/50 border-b border-slate-100">
                                <tr>
                                    <th className="px-8 py-4 text-left text-xs font-bold text-slate-600">Metric</th>
                                    <th className="px-8 py-4 text-left text-xs font-bold text-slate-600">Value</th>
                                    <th className="px-8 py-4 text-left text-xs font-bold text-slate-600">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-semibold text-slate-700">Test MAPE</td>
                                    <td className="px-8 py-4 text-sm font-bold text-blue-600 tabular-nums">{formatMetric(job.result_data?.test_mape)}%</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">Mean Absolute Percentage Error</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-semibold text-slate-700">Test RMSE</td>
                                    <td className="px-8 py-4 text-sm font-bold text-slate-900 tabular-nums">{formatMetric(job.result_data?.test_rmse)}</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">Root Mean Squared Error</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-semibold text-slate-700">Test MAE</td>
                                    <td className="px-8 py-4 text-sm font-bold text-slate-900 tabular-nums">{formatMetric(job.result_data?.test_mae)}</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">Mean Absolute Error</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-semibold text-slate-700">R² Score</td>
                                    <td className="px-8 py-4 text-sm font-bold text-emerald-600 tabular-nums">{formatMetric(job.result_data?.test_r2)}</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">Coefficient of Determination</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-semibold text-slate-700">Training Samples</td>
                                    <td className="px-8 py-4 text-sm font-bold text-slate-900 tabular-nums">{job.result_data?.training_samples || 'N/A'}</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">Number of samples used for training</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-semibold text-slate-700">Validation Samples</td>
                                    <td className="px-8 py-4 text-sm font-bold text-slate-900 tabular-nums">{job.result_data?.validation_samples || 'N/A'}</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">Number of samples used for validation</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-semibold text-slate-700">Test Samples</td>
                                    <td className="px-8 py-4 text-sm font-bold text-slate-900 tabular-nums">{job.result_data?.test_samples || 'N/A'}</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">Number of samples used for testing</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-4 text-sm font-semibold text-slate-700">Forecast Horizon</td>
                                    <td className="px-8 py-4 text-sm font-bold text-emerald-600 tabular-nums">{job.result_data?.forecast_days || '30'} Days</td>
                                    <td className="px-8 py-4 text-xs text-slate-500">Number of days forecasted into the future</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Collapsible Logs */}
            <Card className={`border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white rounded-3xl overflow-hidden transition-all duration-300 ${logsExpanded ? '' : 'h-fit'}`}>
                <CardHeader
                    className="bg-slate-50/30 border-b border-slate-100/50 px-8 py-5 cursor-pointer hover:bg-slate-50/80 transition-colors"
                    onClick={() => setLogsExpanded(!logsExpanded)}
                >
                    <CardTitle className="text-xs font-bold text-slate-500 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-600" />
                            Training Logs
                        </div>
                        <div className="flex items-center gap-2">
                            {!logsExpanded && (
                                <Badge variant={job.status === 'SUCCESS' ? 'default' : 'destructive'} className="text-[10px] h-5 px-2">
                                    {job.status}
                                </Badge>
                            )}
                            {logsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                    </CardTitle>
                </CardHeader>

                <div className={`transition-all duration-300 overflow-hidden ${logsExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <CardContent className="p-8">
                        <div className="bg-slate-900 rounded-xl p-6 max-h-96 overflow-y-auto custom-scrollbar">
                            <div className="font-mono text-xs space-y-2">
                                {job.progress_message ? (
                                    job.progress_message.split('\n').map((line, idx) => (
                                        <div key={idx} className="flex gap-3">
                                            <span className="text-slate-500 select-none">{String(idx + 1).padStart(3, '0')}</span>
                                            <span className="text-green-400">{line || ' '}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-slate-500 italic">No training logs available yet.</div>
                                )}
                                {job.status === 'FAILURE' && job.error_message && (
                                    <div className="text-red-400 mt-2 pt-2 border-t border-red-900/50">
                                        ❌ {job.error_message}
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </div>
            </Card>
        </div >
    );
}
