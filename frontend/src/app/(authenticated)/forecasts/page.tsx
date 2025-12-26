"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, Trash2, Eye, Plus, Activity, CheckCircle, XCircle, Clock, BrainCircuit, ExternalLink, StopCircle } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

interface ForecastModel {
    id: number;
    symbol: string;
    model_type: string;
    trained_at: string;
    test_mape: number;
    test_rmse: number;
    is_active: boolean;
}

interface TrainingJob {
    id: number;
    task_id: string;
    symbol: string;
    model_type: string;
    status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'HALTED';
    started_at: string;
    completed_at: string | null;
    duration: number | null;
    progress_message: string;
    error_message: string;
    result_data?: {
        test_mape?: number;
        test_rmse?: number;
        [key: string]: number | string | undefined;
    };
}

export default function ForecastsPage() {
    const router = useRouter();
    const [models, setModels] = useState<ForecastModel[]>([]);
    const [allJobs, setAllJobs] = useState<TrainingJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [jobToStop, setJobToStop] = useState<number | null>(null);

    // Pagination state
    const [modelsPage, setModelsPage] = useState(1);
    const [modelsPageSize, setModelsPageSize] = useState(10);
    const [modelsTotalPages, setModelsTotalPages] = useState(1);
    const [modelsTotalCount, setModelsTotalCount] = useState(0);

    const [recentJobsPage, setRecentJobsPage] = useState(1);
    const [recentJobsPageSize, setRecentJobsPageSize] = useState(10);
    const [recentJobsTotalPages, setRecentJobsTotalPages] = useState(1);
    const [recentJobsTotalCount, setRecentJobsTotalCount] = useState(0);

    useEffect(() => {
        fetchModels();
        fetchJobs();

        // Poll for job updates every 5 seconds
        const interval = setInterval(fetchJobs, 5000);
        return () => clearInterval(interval);
    }, []);

    // Poll for running jobs every 5 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            fetchJobs();
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchModels = async () => {
        try {
            const response = await api.get(`/api/ml/forecasts/?page=${modelsPage}&page_size=${modelsPageSize}`);
            setModels(response.data.results || response.data);
            if (response.data.count) {
                setModelsTotalCount(response.data.count);
                setModelsTotalPages(Math.ceil(response.data.count / modelsPageSize));
            }
        } catch (error) {
            console.error('Failed to fetch models:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchJobs = async () => {
        try {
            // Fetch all jobs sorted by started_at descending
            const response = await api.get('/api/ml/training-jobs/');
            setAllJobs(response.data.results || response.data);
        } catch (error) {
            console.error('Failed to fetch jobs:', error);
        }
    };

    const handleDeleteModel = async (modelId: number) => {
        if (!confirm('Are you sure you want to delete this model?')) return;

        try {
            await api.delete(`/api/ml/forecasts/${modelId}/`);
            fetchModels();
        } catch (error) {
            console.error('Failed to delete model:', error);
        }
    };

    const handleViewForecast = (symbol: string) => {
        router.push(`/forecasts/${symbol}`);
    };

    const handleStopJob = (jobId: number) => {
        setJobToStop(jobId);
    };

    const confirmStopJob = async () => {
        if (!jobToStop) return;

        try {
            await api.post(`/api/ml/training-jobs/${jobToStop}/stop/`);
            setJobToStop(null);
            fetchJobs(); // Refresh the jobs list
            // Optimization: Optimistically update local state to feel instant
            setAllJobs(jobs => jobs.map(j => j.id === jobToStop ? { ...j, status: 'HALTED' } : j));
            toast.success('Training job halted successfully');
        } catch (error: any) {
            console.error('Failed to stop job:', error);
            const errorMsg = error.response?.data?.error || 'Failed to stop the training job';
            toast.error(errorMsg);
            fetchJobs(); // Refresh to catch up with actual status
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, { color: string; icon: any }> = {
            PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
            RUNNING: { color: 'bg-blue-100 text-blue-800', icon: Activity },
            SUCCESS: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
            FAILED: { color: 'bg-red-100 text-red-800', icon: XCircle },
            HALTED: { color: 'bg-orange-100 text-orange-800', icon: StopCircle }
        };
        const { color, icon: Icon } = variants[status] || variants.PENDING;

        return (
            <Badge className={`${color} flex items-center gap-1`}>
                <Icon className="w-3 h-3" />
                {status}
            </Badge>
        );
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return 'N/A';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    };

    const PaginationControls = ({
        page,
        pageSize,
        totalPages,
        totalCount,
        onPageChange,
        onPageSizeChange
    }: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalCount: number;
        onPageChange: (page: number) => void;
        onPageSizeChange: (size: number) => void;
    }) => (
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50/30 border-t border-slate-100/50 backdrop-blur-sm">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Show</span>
                <select
                    value={pageSize}
                    onChange={(e) => {
                        onPageSizeChange(Number(e.target.value));
                        onPageChange(1);
                    }}
                    className="bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-slate-600 focus:ring-1 focus:ring-blue-100 outline-none transition-all cursor-pointer"
                >
                    {[10, 20, 50, 75, 100].map(size => (
                        <option key={size} value={size}>{size}</option>
                    ))}
                </select>
                <span className="text-[10px] font-bold text-slate-300 ml-1">
                    of {totalCount} records
                </span>
            </div>
            <div className="flex items-center gap-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter tabular-nums">
                    <span className="text-blue-600">{page}</span> / {totalPages}
                </div>
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page === 1}
                        className="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 text-[10px] font-bold"
                    >
                        Prev
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        className="h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 text-[10px] font-bold"
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );

    return (
        <DashboardLayout
            title={
                <div className="flex items-center gap-3">
                    <BrainCircuit className="w-8 h-8 text-blue-600" />
                    <span>ML Forecasting</span>
                </div>
            }
            subtitle="Orchestrate and monitor your predictive intelligence"
        >
            <div className="space-y-3 bg-slate-50/50 min-h-screen">
                <div className="flex justify-between items-center">
                    <Tabs defaultValue="models" className="w-full">
                        <div className="flex justify-between items-center">
                            <TabsList className="bg-gray-100 p-1 rounded-lg w-fit gap-1 border-none">
                                <TabsTrigger
                                    value="models"
                                    className="rounded-md px-6 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all font-medium text-sm text-gray-600 data-[state=active]:text-gray-900"
                                >
                                    Published Models
                                </TabsTrigger>
                                <TabsTrigger
                                    value="monitoring"
                                    className="rounded-md px-6 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all font-medium text-sm text-gray-600 data-[state=active]:text-gray-900 flex items-center gap-2"
                                >
                                    Monitoring
                                    {allJobs.filter(j => j.status === 'RUNNING' || j.status === 'PENDING').length > 0 && (
                                        <Badge className="bg-blue-600 animate-pulse text-white border-none px-1.5 rounded-full text-[9px] h-4 min-w-[16px] flex items-center justify-center">
                                            {allJobs.filter(j => j.status === 'RUNNING' || j.status === 'PENDING').length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                            <Button
                                onClick={() => router.push('/forecasts/train')}
                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors px-4 py-2 text-sm font-semibold rounded-lg"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Train New Model
                            </Button>
                        </div>


                        <TabsContent value="models" className="space-y-4">
                            {loading ? (
                                <div className="text-center py-20 flex flex-col items-center justify-center gap-4">
                                    <div className="relative">
                                        <div className="h-20 w-20 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin"></div>
                                        <Brain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-blue-600" />
                                    </div>
                                    <p className="text-slate-500 font-bold animate-pulse">Analyzing Models...</p>
                                </div>
                            ) : models.length === 0 ? (
                                <Card className="border-dashed border-2 bg-transparent shadow-none border-slate-200 rounded-3xl">
                                    <CardContent className="py-20 text-center">
                                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <Brain className="w-10 h-10 text-slate-400" />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 mb-2">No active models</h3>
                                        <p className="text-slate-500 mb-8 max-w-sm mx-auto font-medium">Start training a machine learning model to begin forecasting stock movements.</p>
                                        <Button
                                            onClick={() => router.push('/forecasts/train')}
                                            variant="outline"
                                            className="rounded-xl px-8 border-slate-200 hover:bg-slate-50 text-slate-600"
                                        >
                                            Initiate First Training
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trained</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test MAPE</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test RMSE</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                            {models.map((model) => (
                                                <tr key={model.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{model.symbol}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide bg-blue-50 text-blue-700">
                                                            {model.model_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">
                                                        {new Date(model.trained_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap font-bold text-green-600">
                                                        {model.test_mape?.toFixed(2)}%
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">
                                                        {model.test_rmse?.toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleViewForecast(model.symbol)}
                                                                className="text-gray-600 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors"
                                                                title="View Forecast"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteModel(model.id)}
                                                                className="text-gray-600 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                                title="Delete Model"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </TabsContent>

                        {/* Monitoring Tab */}
                        <TabsContent value="monitoring" className="space-y-6">
                            {/* All Jobs - Unified Table */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Training Jobs</h3>
                                {allJobs.length === 0 ? (
                                    <Card>
                                        <CardContent className="py-8 text-center text-gray-600">
                                            No training jobs found
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test MAPE</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                                {allJobs.map((job) => (
                                                    <tr key={job.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-mono text-xs">
                                                            <a
                                                                href={`/forecasts/train/${job.id}`}
                                                                className="text-blue-600 hover:underline"
                                                            >
                                                                #{job.task_id?.substring(0, 4)}
                                                            </a>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{job.symbol}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide bg-blue-50 text-blue-700">
                                                                {job.model_type}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(job.status)}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            {job.status === 'SUCCESS' && job.result_data?.test_mape ? (
                                                                <span className="font-bold text-green-600">
                                                                    {job.result_data.test_mape.toFixed(2)}%
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">
                                                            {new Date(job.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-gray-600 text-sm">
                                                            {formatDuration(job.duration)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-1">
                                                                {(job.status === 'RUNNING' || job.status === 'PENDING') && (
                                                                    <button
                                                                        onClick={() => handleStopJob(job.id)}
                                                                        className="text-gray-600 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                                        title="Stop Job"
                                                                    >
                                                                        <StopCircle className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => router.push(`/forecasts/train/${job.id}`)}
                                                                    className="text-gray-600 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors"
                                                                    title="View Details"
                                                                >
                                                                    <ExternalLink className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>


            <Dialog open={!!jobToStop} onOpenChange={(open) => !open && setJobToStop(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Stop Training Job?</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to stop this training job? This action cannot be undone and the job will be marked as halted.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setJobToStop(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmStopJob}>Stop Training</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DashboardLayout >
    );
}
