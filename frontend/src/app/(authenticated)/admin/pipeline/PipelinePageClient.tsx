'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import {
    Play,
    TrendingUp, TrendingDown, Activity, DollarSign, Zap, BarChart3, Globe, ShieldAlert,
    HeartPulse, LineChart, LayoutDashboard, Search, Clock,
    Command, Wallet, Lightbulb, MessageSquare, Building2,
    Droplets, Boxes, Factory, ShoppingBag, Hotel, Plane, Phone, HardHat, ShieldCheck,
    Coins, PieChart, Flame, Terminal,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Server,
    UploadCloud,
    FileJson,
    Cpu,
    History,
    Radar,
    Gauge
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import { format } from "date-fns"
import { Calendar as CalendarIcon, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UploadHistoryTable from './components/UploadHistoryTable';
import { PipelineStep } from './components/PipelineStep';

// Add some basic styles for the log viewer
import { Loader2 } from 'lucide-react';

interface LogEntry {
    type: 'log' | 'status' | 'error';
    message: string;
    timestamp: Date;
}

export default function PipelinePage() {
    const [uploading, setUploading] = useState(false);
    const [logs, setLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);

    // Signal Generation State
    const [signalStatus, setSignalStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [signalLogs, setSignalLogs] = useState<LogEntry[]>([]);
    const [showSignalLogs, setShowSignalLogs] = useState(false);

    // Technical Indicators State
    const [indicatorStatus, setIndicatorStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [indicatorLogs, setIndicatorLogs] = useState<LogEntry[]>([]);
    const [showIndicatorLogs, setShowIndicatorLogs] = useState(false);

    // Optimization State
    const [optimizationStatus, setOptimizationStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [optimizationLogs, setOptimizationLogs] = useState<LogEntry[]>([]);
    const [showOptimizationLogs, setShowOptimizationLogs] = useState(false);

    // Broker Analysis State
    const [brokerStatus, setBrokerStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [brokerLogs, setBrokerLogs] = useState<LogEntry[]>([]);
    const [showBrokerLogs, setShowBrokerLogs] = useState(false);
    const [brokerMode, setBrokerMode] = useState<'full' | 'delta'>('delta');

    // Intel Signal Generation State
    const [intelStatus, setIntelStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [intelLogs, setIntelLogs] = useState<LogEntry[]>([]);
    const [showIntelLogs, setShowIntelLogs] = useState(false);

    // Signal Evaluation State
    const [evaluationStatus, setEvaluationStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [evaluationLogs, setEvaluationLogs] = useState<LogEntry[]>([]);
    const [showEvaluationLogs, setShowEvaluationLogs] = useState(false);

    // Abort controllers for stopping processes
    const indicatorAbortController = useRef<AbortController | null>(null);
    const optimizationAbortController = useRef<AbortController | null>(null);
    const signalAbortController = useRef<AbortController | null>(null);
    const brokerAbortController = useRef<AbortController | null>(null);
    const intelAbortController = useRef<AbortController | null>(null);
    const evaluationAbortController = useRef<AbortController | null>(null);

    // Track log IDs for abort functionality
    const [indicatorLogId, setIndicatorLogId] = useState<number | null>(null);
    const [optimizationLogId, setOptimizationLogId] = useState<number | null>(null);
    const [signalLogId, setSignalLogId] = useState<number | null>(null);
    const [brokerLogId, setBrokerLogId] = useState<number | null>(null);
    const [intelLogId, setIntelLogId] = useState<number | null>(null);
    const [evaluationLogId, setEvaluationLogId] = useState<number | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchHistory = async (page = 1) => {
        setLogsLoading(true);
        try {
            const res = await api.get(`/api/stocks/pipeline/history/?page=${page}&page_size=10`);
            setLogs(res.data.results);
            setCurrentPage(res.data.page);
            setTotalPages(res.data.pages);
        } catch (err) {
            console.error('Failed to fetch history', err);
        } finally {
            setLogsLoading(false);
        }
    };

    const handlePageChange = (page: number) => {
        fetchHistory(page);
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const handleRunIndicators = async () => {
        if (indicatorStatus === 'running') return;

        setIndicatorStatus('running');
        setIndicatorLogs([]);
        setShowIndicatorLogs(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${apiUrl}/api/stocks/pipeline/trigger_indicators_stream/`;

        // Create abort controller
        indicatorAbortController.current = new AbortController();

        try {
            const response = await fetch(url, {
                credentials: 'include',
                signal: indicatorAbortController.current.signal,
            });

            if (!response.ok) {
                if (response.status === 401) {
                    toast.error("Session expired. Please login again.");
                } else {
                    toast.error(`Connection failed: ${response.statusText}`);
                }
                setIndicatorStatus('error');
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                toast.error("Failed to initialize stream reader");
                setIndicatorStatus('error');
                return;
            }

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    try {
                        const jsonStr = trimmedLine.substring(6);
                        const data = JSON.parse(jsonStr);

                        if (data.type === 'init') {
                            setIndicatorLogId(data.log_id);
                            continue;
                        }

                        if (data.type === 'done') {
                            setIndicatorStatus('completed');
                            toast.success("Indicators updated successfully!");
                            fetchHistory();
                            return;
                        }

                        if (data.type === 'error') {
                            setIndicatorStatus('error');
                            toast.error(data.message || "Error updating indicators");
                            return;
                        }

                        if (data.type === 'log' || data.type === 'status') {
                            setIndicatorLogs(prev => [...prev, {
                                type: data.type as any,
                                message: data.message,
                                timestamp: new Date()
                            }]);
                        }
                    } catch (e) {
                        console.error('Error parsing stream line:', trimmedLine, e);
                    }
                }
            }

        } catch (error: any) {
            // Ignore abort errors - they're expected when user stops the process
            if (error.name === 'AbortError') {
                return;
            }
            console.error("Stream fetch failed:", error);
            setIndicatorStatus('error');
            toast.error("Connection to log stream lost");
        }
    };

    const handleRunSignals = async () => {
        if (signalStatus === 'running') return;

        setSignalStatus('running');
        setSignalLogs([]);
        setShowSignalLogs(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${apiUrl}/api/stocks/pipeline/generate_signals_stream/`;

        // Create abort controller
        signalAbortController.current = new AbortController();

        try {
            const response = await fetch(url, {
                credentials: 'include',
                signal: signalAbortController.current.signal,
            });

            if (!response.ok) {
                if (response.status === 401) {
                    toast.error("Session expired. Please login again.");
                    // Optionally redirect to login here
                } else {
                    toast.error(`Connection failed: ${response.statusText}`);
                }
                setSignalStatus('error');
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                toast.error("Failed to initialize stream reader");
                setSignalStatus('error');
                return;
            }

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep the last partial line in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    try {
                        const jsonStr = trimmedLine.substring(6); // Remove 'data: ' prefix
                        const data = JSON.parse(jsonStr);

                        if (data.type === 'init') {
                            setSignalLogId(data.log_id);
                            continue;
                        }

                        if (data.type === 'done') {
                            setSignalStatus('completed');
                            toast.success("Signal generation complete!");
                            fetchHistory();
                            return; // Stop reading
                        }

                        if (data.type === 'error') {
                            setSignalStatus('error');
                            toast.error(data.message || "Error during signal generation");
                            return; // Stop reading
                        }

                        if (data.type === 'log' || data.type === 'status') {
                            setSignalLogs(prev => [...prev, {
                                type: data.type as any,
                                message: data.message,
                                timestamp: new Date()
                            }]);
                        }
                    } catch (e) {
                        console.error('Error parsing stream line:', trimmedLine, e);
                    }
                }
            }

        } catch (error: any) {
            // Ignore abort errors - they're expected when user stops the process
            if (error.name === 'AbortError') {
                return;
            }
            console.error("Stream fetch failed:", error);
            setSignalStatus('error');
            toast.error("Connection to log stream lost");
        }
    };

    const handleRunOptimization = async () => {
        if (optimizationStatus === 'running') return;

        setOptimizationStatus('running');
        setOptimizationLogs([]);
        setShowOptimizationLogs(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${apiUrl}/api/stocks/pipeline/optimize_strategies_stream/?all_symbols=true`;

        // Create abort controller
        optimizationAbortController.current = new AbortController();

        try {
            const response = await fetch(url, {
                credentials: 'include',
                signal: optimizationAbortController.current.signal,
            });

            if (!response.ok) {
                setOptimizationStatus('error');
                toast.error(`Connection failed: ${response.statusText}`);
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                setOptimizationStatus('error');
                return;
            }

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmedLine.substring(6));

                        if (data.type === 'init') {
                            setOptimizationLogId(data.log_id);
                            continue;
                        }

                        if (data.type === 'done') {
                            setOptimizationStatus('completed');
                            toast.success("Optimization complete!");
                            fetchHistory();
                            return;
                        }
                        if (data.type === 'error') {
                            setOptimizationStatus('error');
                            toast.error(data.message);
                            return;
                        }
                        if (data.type === 'log' || data.type === 'status') {
                            setOptimizationLogs(prev => [...prev, {
                                type: data.type as any,
                                message: data.message,
                                timestamp: new Date()
                            }]);
                        }
                    } catch (e) { }
                }
            }
        } catch (error: any) {
            // Ignore abort errors - they're expected when user stops the process
            if (error.name === 'AbortError') {
                return;
            }
            setOptimizationStatus('error');
            toast.error("Connection lost");
        }
    };

    const handleRunBroker = async () => {
        if (brokerStatus === 'running') return;

        setBrokerStatus('running');
        setBrokerLogs([]);
        setShowBrokerLogs(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${apiUrl}/api/stocks/pipeline/update_broker_analysis_stream/?mode=${brokerMode}`;

        brokerAbortController.current = new AbortController();

        try {
            const response = await fetch(url, {
                credentials: 'include',
                signal: brokerAbortController.current.signal,
            });

            if (!response.ok) {
                setBrokerStatus('error');
                toast.error(`Connection failed: ${response.statusText}`);
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                setBrokerStatus('error');
                return;
            }

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmedLine.substring(6));

                        if (data.type === 'init') {
                            setBrokerLogId(data.log_id);
                            continue;
                        }

                        if (data.type === 'done') {
                            setBrokerStatus('completed');
                            toast.success("Broker analysis complete!");
                            fetchHistory();
                            return;
                        }
                        if (data.type === 'error') {
                            setBrokerStatus('error');
                            toast.error(data.message);
                            return;
                        }
                        if (data.type === 'log' || data.type === 'status') {
                            setBrokerLogs(prev => [...prev, {
                                type: data.type as any,
                                message: data.message,
                                timestamp: new Date()
                            }]);
                        }
                    } catch (e) { }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') return;
            setBrokerStatus('error');
            toast.error("Connection lost");
        }
    };

    const handleRunIntelSignals = async () => {
        if (intelStatus === 'running') return;

        setIntelStatus('running');
        setIntelLogs([]);
        setShowIntelLogs(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${apiUrl}/api/stocks/pipeline/generate_all_signals_stream/`;

        intelAbortController.current = new AbortController();

        try {
            const response = await fetch(url, {
                credentials: 'include',
                signal: intelAbortController.current.signal,
            });

            if (!response.ok) {
                setIntelStatus('error');
                toast.error(`Connection failed: ${response.statusText}`);
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                setIntelStatus('error');
                return;
            }

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmedLine.substring(6));

                        if (data.type === 'init') {
                            setIntelLogId(data.log_id);
                            continue;
                        }

                        if (data.type === 'done') {
                            setIntelStatus('completed');
                            toast.success("All intel signals generated successfully!");
                            fetchHistory();
                            return;
                        }
                        if (data.type === 'error') {
                            setIntelStatus('error');
                            toast.error(data.message);
                            return;
                        }
                        if (data.type === 'log' || data.type === 'status') {
                            setIntelLogs(prev => [...prev, {
                                type: data.type as any,
                                message: data.message,
                                timestamp: new Date()
                            }]);
                        }
                    } catch (e) { }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') return;
            setIntelStatus('error');
            toast.error("Connection lost");
        }
    };

    const handleRunEvaluation = async () => {
        if (evaluationStatus === 'running') return;

        setEvaluationStatus('running');
        setEvaluationLogs([]);
        setShowEvaluationLogs(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${apiUrl}/api/stocks/pipeline/trigger_evaluation_stream/`;

        evaluationAbortController.current = new AbortController();

        try {
            const response = await fetch(url, {
                credentials: 'include',
                signal: evaluationAbortController.current.signal,
            });

            if (!response.ok) {
                setEvaluationStatus('error');
                toast.error(`Connection failed: ${response.statusText}`);
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                setEvaluationStatus('error');
                return;
            }

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(trimmedLine.substring(6));

                        if (data.type === 'init') {
                            setEvaluationLogId(data.log_id);
                            continue;
                        }

                        if (data.type === 'done') {
                            setEvaluationStatus('completed');
                            toast.success("Signal evaluation complete!");
                            fetchHistory();
                            return;
                        }
                        if (data.type === 'error') {
                            setEvaluationStatus('error');
                            toast.error(data.message);
                            return;
                        }
                        if (data.type === 'log' || data.type === 'status') {
                            setEvaluationLogs(prev => [...prev, {
                                type: data.type as any,
                                message: data.message,
                                timestamp: new Date()
                            }]);
                        }
                    } catch (e) { }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') return;
            setEvaluationStatus('error');
            toast.error("Connection lost");
        }
    };

    const handleStopIntelSignals = async () => {
        if (intelAbortController.current) {
            intelAbortController.current.abort();
            intelAbortController.current = null;
            setIntelStatus('idle');

            if (intelLogId) {
                try {
                    await api.post('/api/stocks/pipeline/abort_log/', { log_id: intelLogId });
                    fetchHistory();
                } catch (err) {
                    console.error('Failed to mark log as aborted:', err);
                }
            }
            toast.info("Stopped intel signal generation");
        }
    };

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const file = acceptedFiles[0];

        const formData = new FormData();
        formData.append('file', file);

        setUploading(true);
        try {
            const res = await api.post('/api/stocks/pipeline/upload_floorsheet/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            toast.success(res.data.message || 'File uploaded successfully');
            fetchHistory();
        } catch (err: any) {
            console.error(err);
            toast.error(err.response?.data?.error || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleStopIndicators = async () => {
        if (indicatorAbortController.current) {
            indicatorAbortController.current.abort();
            indicatorAbortController.current = null;
            setIndicatorStatus('idle');

            // Mark log as aborted
            if (indicatorLogId) {
                try {
                    await api.post('/api/stocks/pipeline/abort_log/', { log_id: indicatorLogId });
                    fetchHistory();
                } catch (err) {
                    console.error('Failed to mark log as aborted:', err);
                }
            }

            toast.info("Stopped technical indicators update");
        }
    };

    const handleStopOptimization = async () => {
        if (optimizationAbortController.current) {
            optimizationAbortController.current.abort();
            optimizationAbortController.current = null;
            setOptimizationStatus('idle');

            // Mark log as aborted
            if (optimizationLogId) {
                try {
                    await api.post('/api/stocks/pipeline/abort_log/', { log_id: optimizationLogId });
                    fetchHistory();
                } catch (err) {
                    console.error('Failed to mark log as aborted:', err);
                }
            }

            toast.info("Stopped strategy optimization");
        }
    };

    const handleStopSignals = async () => {
        if (signalAbortController.current) {
            signalAbortController.current.abort();
            signalAbortController.current = null;
            setSignalStatus('idle');

            // Mark log as aborted
            if (signalLogId) {
                try {
                    await api.post('/api/stocks/pipeline/abort_log/', { log_id: signalLogId });
                    fetchHistory();
                } catch (err) {
                    console.error('Failed to mark log as aborted:', err);
                }
            }

            toast.info("Stopped signal generation");
        }
    };

    const handleStopBroker = async () => {
        if (brokerAbortController.current) {
            brokerAbortController.current.abort();
            brokerAbortController.current = null;
            setBrokerStatus('idle');

            if (brokerLogId) {
                try {
                    await api.post('/api/stocks/pipeline/abort_log/', { log_id: brokerLogId });
                    fetchHistory();
                } catch (err) {
                    console.error('Failed to mark log as aborted:', err);
                }
            }
            toast.info("Stopped broker analysis");
        }
    };

    const handleStopEvaluation = async () => {
        if (evaluationAbortController.current) {
            evaluationAbortController.current.abort();
            evaluationAbortController.current = null;
            setEvaluationStatus('idle');

            if (evaluationLogId) {
                try {
                    await api.post('/api/stocks/pipeline/abort_log/', { log_id: evaluationLogId });
                    fetchHistory();
                } catch (err) {
                    console.error('Failed to mark log as aborted:', err);
                }
            }
            toast.info("Stopped signal evaluation");
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/json': ['.json']
        },
        maxFiles: 1
    });

    return (
        <DashboardLayout title="Market Pipeline" hideHeader={true}>
            <div className="w-full px-8 space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Main Pipeline Steps */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 mb-2 px-2">
                            <Activity className="w-5 h-5 text-blue-600 dark:text-indigo-400" />
                            <h2 className="font-bold text-gray-900 dark:text-slate-100 text-lg text-[11px]">Active pipeline steps</h2>
                        </div>

                        {/* Step 1: Floorsheet */}
                        <Card className="overflow-hidden border-none shadow-none bg-transparent">
                            <div
                                {...getRootProps()}
                                className={cn(
                                    "group relative rounded-2xl border-2 border-dashed p-4 transition-all duration-300",
                                    isDragActive ? "border-blue-500 bg-blue-50/50 dark:border-indigo-500 dark:bg-indigo-900/20 scale-[1.01]" : "border-gray-100 dark:border-slate-800 bg-white dark:bg-card hover:border-blue-200 dark:hover:border-indigo-700",
                                    uploading && "opacity-50 pointer-events-none"
                                )}
                            >
                                <input {...getInputProps()} />
                                <div className="flex items-start gap-4">
                                    <div className={cn(
                                        "p-3 rounded-2xl transition-colors",
                                        isDragActive ? "bg-blue-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover:bg-blue-50 dark:group-hover:bg-indigo-900/30 group-hover:text-blue-500 dark:group-hover:text-indigo-400"
                                    )}>
                                        <FileJson className="w-6 h-6" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">1. Upload Floorsheet</h3>
                                        <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 font-medium leading-relaxed">Drag and drop the latest floorsheet JSON to update accumulation data.</p>
                                        {uploading && (
                                            <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-slate-100/50 dark:bg-muted border border-border dark:border-border">
                                            <Terminal size={12} className="text-indigo-500" />
                                            <span className="text-[10px] font-semibold tracking-wider text-indigo-600/70 dark:text-indigo-400/60 uppercase">Process output</span>
                                        </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Step 2: Daily Prices */}
                        <div className="group bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800 p-4 space-y-4 shadow-sm hover:border-blue-200 dark:hover:border-indigo-700 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover:bg-blue-50 dark:group-hover:bg-indigo-900/30 group-hover:text-blue-500 dark:group-hover:text-indigo-400 transition-colors">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">2. Sync Daily Prices</h3>
                                    <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 font-medium leading-relaxed">Ingest previous day market close data from GitHub or manual upload.</p>
                                </div>
                            </div>
                            <DailyPriceUpload onSuccess={fetchHistory} />
                        </div>

                        {/* Step 3: Update Broker Data & Accumulation */}
                        <PipelineStep
                            title="3. Update Broker Data & Accumulation"
                            description="Refresh buyer/seller statistics and recalculate market accumulation history based on uploaded floorsheet."
                            status={brokerStatus}
                            icon={<Zap className="w-5 h-5" />}
                            onRun={handleRunBroker}
                            onStop={handleStopBroker}
                            logs={brokerLogs}
                            showLogs={showBrokerLogs}
                            onToggleLogs={() => setShowBrokerLogs(!showBrokerLogs)}
                            extraControls={
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-tighter">Mode:</span>
                                    <Tabs
                                        value={brokerMode}
                                        onValueChange={(v) => setBrokerMode(v as 'full' | 'delta')}
                                        className="w-auto"
                                    >
                                        <TabsList className="h-7 p-0.5 bg-gray-100 dark:bg-slate-800 rounded-lg">
                                            <TabsTrigger
                                                value="delta"
                                                className="h-6 px-3 text-[10px] font-bold rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-orange-500"
                                            >
                                                Partial
                                            </TabsTrigger>
                                            <TabsTrigger
                                                value="full"
                                                className="h-6 px-3 text-[10px] font-bold rounded-md data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-orange-500"
                                            >
                                                Full
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                </div>
                            }
                        />

                        {/* Step 4: Update Technical Indicators */}
                        <PipelineStep
                            title="4. Update Technical Indicators"
                            description="Recalculate RSI, MACD, SMAs, and Sector stats for all stocks."
                            status={indicatorStatus}
                            icon={<Activity className="w-5 h-5" />}
                            onRun={handleRunIndicators}
                            onStop={handleStopIndicators}
                            logs={indicatorLogs}
                            showLogs={showIndicatorLogs}
                            onToggleLogs={() => setShowIndicatorLogs(!showIndicatorLogs)}
                        />

                        {/* Step 5: Global Strategy Optimization */}
                        <PipelineStep
                            title="5. Global Strategy Training"
                            description="Scan entire market to discover optimal parameters for each sector and symbol. Recommended before signal generation."
                            status={optimizationStatus}
                            icon={<Zap className="w-5 h-5" />}
                            onRun={handleRunOptimization}
                            onStop={handleStopOptimization}
                            logs={optimizationLogs}
                            showLogs={showOptimizationLogs}
                            onToggleLogs={() => setShowOptimizationLogs(!showOptimizationLogs)}
                        />

                        {/* Step 6: Signal Generation (The new "Boot Process") */}
                        <PipelineStep
                            title="6. Generate Strategy Signals"
                            description="Run backtests using optimized parameters to generate fresh BUY/SELL recommendations."
                            status={signalStatus}
                            icon={<Cpu className="w-5 h-5" />}
                            onRun={handleRunSignals}
                            onStop={handleStopSignals}
                            logs={signalLogs}
                            showLogs={showSignalLogs}
                            onToggleLogs={() => setShowSignalLogs(!showSignalLogs)}
                        />

                        {/* Step 7: Generate All Intel Signals */}
                        <PipelineStep
                            title="7. Generate All Intel Signals"
                            description="Generate Smart Money, Broker Accumulation, Smart Crossover, and Ichimoku signals. Stores data for Signal Intelligence page."
                            status={intelStatus}
                            icon={<Radar className="w-5 h-5" />}
                            onRun={handleRunIntelSignals}
                            onStop={handleStopIntelSignals}
                            logs={intelLogs}
                            showLogs={showIntelLogs}
                            onToggleLogs={() => setShowIntelLogs(!showIntelLogs)}
                        />

                        {/* Step 8: Signal Evaluation */}
                        <PipelineStep
                            title="8. Evaluate Active Signals"
                            description="Compare active signals against latest prices to mark them as WON or LOST and update accuracy metrics."
                            status={evaluationStatus}
                            icon={<Gauge className="w-5 h-5" />}
                            onRun={handleRunEvaluation}
                            onStop={handleStopEvaluation}
                            logs={evaluationLogs}
                            showLogs={showEvaluationLogs}
                            onToggleLogs={() => setShowEvaluationLogs(!showEvaluationLogs)}
                        />
                    </div>

                    {/* Upload History */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2 px-2">
                            <History className="w-5 h-5 text-blue-600 dark:text-indigo-400" />
                            <h2 className="font-bold text-gray-900 dark:text-slate-100 text-lg text-[11px]">Pipeline history</h2>
                        </div>

                        <UploadHistoryTable
                            logs={logs}
                            loading={logsLoading}
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                        />
                    </div>
                </div>
            </div>
        </DashboardLayout >
    );
}

// Keeping the DailyPriceUpload component but making it cleaner
function DailyPriceUpload({ onSuccess }: { onSuccess?: () => void }) {
    const [date, setDate] = useState<Date>();
    const [fetchingGithub, setFetchingGithub] = useState(false);
    const [uploading, setUploading] = useState(false);

    const isTradingDay = (d: Date) => {
        const day = d.getDay();
        return day !== 0 && day !== 6;
    };

    const handleGithubFetch = async () => {
        if (!date) {
            toast.error("Please select a date first");
            return;
        }
        const dateStr = format(date, 'yyyy-MM-dd');
        setFetchingGithub(true);
        try {
            const res = await api.post('/api/stocks/pipeline/fetch_daily_prices_from_github/', {
                date: dateStr
            });
            toast.success(res.data.message || 'Successfully fetched prices');
            if (onSuccess) onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Failed to fetch");
        } finally {
            setFetchingGithub(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 bg-gray-50/50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-wider">Trading date</label>
                </div>
                <div className="flex gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="flex-1 justify-start font-medium rounded-xl border-gray-200 dark:border-slate-800 dark:bg-card">
                                <CalendarIcon className="mr-2 h-4 w-4 text-blue-500 dark:text-indigo-400" />
                                {date ? format(date, "PPP") : "Select date..."}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl overflow-hidden shadow-sm">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={setDate}
                                disabled={(d) => d > new Date() || d.getDay() === 0 || d.getDay() === 6}
                            />
                        </PopoverContent>
                    </Popover>
                    <Button
                        onClick={handleGithubFetch}
                        disabled={fetchingGithub || !date}
                        className="bg-blue-600 hover:bg-blue-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 rounded-xl"
                    >
                        {fetchingGithub ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    </Button>
                </div>
            </div>
        </div>
    );
}
