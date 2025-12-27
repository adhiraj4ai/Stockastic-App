'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ReactECharts from 'echarts-for-react';
import {
    ChevronLeft,
    Activity,
    Clock,
    Target,
    Database,
    LineChart as LineChartIcon,
    Settings2,
    ChevronDown,
    ChevronUp,
    Globe,
    Lock
} from 'lucide-react';
import api, { mlApi } from '@/lib/api';
import { toast } from 'sonner';
import ForecastResultView from '@/components/forecasts/ForecastResultView';

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
    is_published?: boolean;
    split_dates: {
        train_start?: string;
        train_end?: string;
        val_start?: string;
        val_end?: string;
        test_start?: string;
        test_end?: string;
    };
}

export default function JobDetailPage() {
    const { jobId } = useParams();
    const router = useRouter();
    const [job, setJob] = useState<JobDetails | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isSubscribed = true;

        const fetchJobDetails = async () => {
            try {
                const response = await mlApi.get(`/api/training-jobs/${jobId}/details/`);
                if (isSubscribed) {
                    setJob(prev => {
                        const newData = response.data;
                        // Check for status change to SUCCESS
                        if (prev && prev.status !== 'SUCCESS' && newData.status === 'SUCCESS') {
                            toast.success('Training Model Completed Successfully!');
                        }
                        return newData;
                    });
                }
            } catch (error) {
                console.error('Error fetching job details:', error);
            } finally {
                if (isSubscribed) setLoading(false);
            }
        };

        fetchJobDetails();

        // Polling if running or pending
        const intervalId = setInterval(() => {
            if (job && (job.status === 'PENDING' || job.status === 'RUNNING')) {
                fetchJobDetails();
            }
        }, 3000);

        return () => {
            isSubscribed = false;
            clearInterval(intervalId);
        };
    }, [jobId, job?.status]);

    const handlePublishToggle = async () => {
        if (!job) return;

        const action = job.is_published ? 'unpublish' : 'publish';
        try {
            const response = await mlApi.post(`/api/training-jobs/${jobId}/${action}/`);
            if (response.data) {
                setJob(prev => prev ? { ...prev, is_published: response.data.is_published } : null);
                toast.success(`Model ${action === 'publish' ? 'published' : 'unpublished'} successfully!`);
            }
        } catch (error) {
            console.error(`Error ${action}ing model:`, error);
            toast.error(`Failed to ${action} model.`);
        }
    };

    const chartOption = useMemo(() => {
        if (!job) return {};

        const historicalData = (job.historical_prices || []).map(p => [p.date, p.price]);
        const testData = (job.test_predictions || []).map(p => [p.date, p.price]);
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
                { xAxis: job.split_dates.test_end || (testData.length > 0 ? testData[testData.length - 1][0] : undefined) }
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
            legend: {
                data: ['Historical', 'Test Prediction', 'Forecast', 'Confidence'],
                top: 0,
                textStyle: { fontSize: 11, fontWeight: 'bold' },
                itemGap: 20
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
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
                    name: 'Historical',
                    type: 'line',
                    symbol: 'none',
                    data: historicalData,
                    lineStyle: { color: '#94a3b8', width: 2 },
                    itemStyle: { color: '#94a3b8' },
                    markArea: {
                        data: markAreas_data
                    }
                },
                {
                    name: 'Test Prediction',
                    type: 'line',
                    symbol: 'none',
                    data: testData,
                    lineStyle: { color: '#10b981', width: 2, type: 'dashed' },
                    itemStyle: { color: '#10b981' }
                },
                {
                    name: 'Forecast',
                    type: 'line',
                    symbol: 'none',
                    data: forecastData,
                    lineStyle: { color: '#3b82f6', width: 3 },
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

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </DashboardLayout>
        );
    }

    if (!job) {
        return (
            <DashboardLayout>
                <div className="text-center py-20">
                    <p className="text-slate-500">Job not found or error loading details.</p>
                    <Button variant="ghost" onClick={() => router.back()} className="mt-4">
                        <ChevronLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                </div>
            </DashboardLayout>
        );
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200/50 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest">SUCCESS</Badge>;
            case 'RUNNING':
                return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200/50 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest animate-pulse">RUNNING</Badge>;
            case 'FAILED':
                return <Badge className="bg-red-500/10 text-red-600 border-red-200/50 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest">FAILED</Badge>;
            default:
                return <Badge variant="outline" className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest">{status}</Badge>;
        }
    };

    const formatMetric = (val: string | number | undefined) => {
        if (val === undefined) return 'N/A';
        const num = Number(val);
        return isNaN(num) ? String(val) : num.toFixed(2);
    };

    // Create headerContent based on loading state
    const headerContent = (
        <div className="flex items-center gap-4">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
                title="Back to Monitoring"
            >
                <ChevronLeft className="w-5 h-5" />
            </Button>

            {loading || !job?.symbol ? (
                // Loading skeleton
                <div className="flex items-center gap-3">
                    <div className="h-6 w-20 bg-slate-200 rounded animate-pulse"></div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 pl-2 border-l border-slate-200 ml-2">
                        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse"></div>
                    </div>
                </div>
            ) : (
                // Actual content when loaded
                <>
                    <div className="flex items-center gap-3">
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
                            {job.symbol}
                        </h1>

                        <div className="flex items-center gap-3 text-xs font-semibold text-slate-500 uppercase tracking-widest pl-2 border-l border-slate-200 ml-2">
                            <span>{new Date(job.started_at).toLocaleString()}</span>

                            {job.status === 'SUCCESS' && (
                                <>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-emerald-600 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {job.duration?.toFixed(1)}s
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right side actions */}
                    <div className="flex items-center gap-2 ml-auto">
                        {job.status === 'SUCCESS' && (
                            <Button
                                size="sm"
                                variant={job.is_published ? "outline" : "default"}
                                onClick={handlePublishToggle}
                                className={`text-[10px] h-7 px-3 font-bold tracking-widest uppercase flex items-center gap-1.5 transition-all
                                    ${job.is_published
                                        ? "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700"
                                        : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"}`}
                            >
                                {job.is_published ? (
                                    <>
                                        <Lock className="w-3 h-3" />
                                        Unpublish
                                    </>
                                ) : (
                                    <>
                                        <Globe className="w-3 h-3" />
                                        Publish
                                    </>
                                )}
                            </Button>
                        )}

                        {job.is_published && (
                            <Badge className="bg-emerald-500 text-white border-0 px-2 py-0.5 rounded text-[9px] font-black tracking-tighter uppercase shadow-sm">
                                PUBLISHED
                            </Badge>
                        )}
                    </div>
                </>
            )}
        </div>
    );

    return (
        <DashboardLayout headerContent={headerContent}>
            <div className="px-4 py-2 lg:px-6 lg:py-4 bg-slate-50/50 min-h-screen">
                {/* Content */}
                <ForecastResultView job={job} />
            </div>
        </DashboardLayout>
    );
}
