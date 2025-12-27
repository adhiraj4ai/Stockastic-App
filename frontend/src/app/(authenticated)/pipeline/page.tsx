'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import {
    Play,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Clock,
    Server,
    Activity,
    UploadCloud,
    FileJson,
    Cpu,
    Zap,
    History
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

interface LogEntry {
    type: 'log' | 'status' | 'error';
    message: string;
    timestamp: Date;
}

export default function PipelinePage() {
    const [uploading, setUploading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

    // Signal Generation State
    const [signalStatus, setSignalStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [signalLogs, setSignalLogs] = useState<LogEntry[]>([]);
    const [showSignalLogs, setShowSignalLogs] = useState(false);

    // Technical Indicators State
    const [indicatorStatus, setIndicatorStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [indicatorLogs, setIndicatorLogs] = useState<LogEntry[]>([]);
    const [showIndicatorLogs, setShowIndicatorLogs] = useState(false);

    const fetchHistory = async () => {
        setLogsLoading(true);
        try {
            const res = await api.get('/api/stocks/pipeline/history/');
            setLogs(res.data.results);
        } catch (err) {
            console.error('Failed to fetch history', err);
        } finally {
            setLogsLoading(false);
        }
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
        const token = localStorage.getItem('access_token');

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
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

                        if (data.type === 'done') {
                            setIndicatorStatus('completed');
                            toast.success("Indicators updated successfully!");
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

        } catch (error) {
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
        const token = localStorage.getItem('access_token');

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
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

                        if (data.type === 'done') {
                            setSignalStatus('completed');
                            toast.success("Signal generation complete!");
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

        } catch (error) {
            console.error("Stream fetch failed:", error);
            setSignalStatus('error');
            toast.error("Connection to log stream lost");
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

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/json': ['.json']
        },
        maxFiles: 1
    });

    return (
        <DashboardLayout title="Market Pipeline">
            <div className="max-w-6xl mx-auto space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider">
                            <Zap className="w-3 h-3" />
                            Data Ingestion Engine
                        </div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Market Data Pipeline</h1>
                        <p className="text-gray-500 max-w-xl">
                            Process floorsheets, daily prices, and generate strategic signals in a single, unified workflow.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            className="rounded-xl gap-2 border-gray-200 hover:bg-gray-50"
                            onClick={fetchHistory}
                        >
                            <RefreshCw className={cn("w-4 h-4 text-gray-400", logsLoading && "animate-spin")} />
                            Refresh History
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Pipeline Steps */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center gap-3 mb-2 px-2">
                            <Activity className="w-5 h-5 text-blue-600" />
                            <h2 className="font-bold text-gray-900 text-lg uppercase tracking-widest text-[11px]">Active Pipeline Steps</h2>
                        </div>

                        {/* Step 1: Floorsheet */}
                        <Card className="overflow-hidden border-none shadow-none bg-transparent">
                            <div
                                {...getRootProps()}
                                className={cn(
                                    "group relative rounded-2xl border-2 border-dashed p-8 transition-all duration-300",
                                    isDragActive ? "border-blue-500 bg-blue-50/50 scale-[1.01]" : "border-gray-100 bg-white hover:border-blue-200",
                                    uploading && "opacity-50 pointer-events-none"
                                )}
                            >
                                <input {...getInputProps()} />
                                <div className="flex items-start gap-6">
                                    <div className={cn(
                                        "p-4 rounded-2xl transition-colors",
                                        isDragActive ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500"
                                    )}>
                                        <FileJson className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-bold text-gray-900">1. Upload Floorsheet</h3>
                                        <p className="text-sm text-gray-500">Drag and drop the latest floorsheet JSON to update accumulation data.</p>
                                        {uploading && (
                                            <div className="flex items-center gap-2 mt-4 text-sm font-bold text-blue-600 animate-pulse">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                PROCESSING JSON...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Step 2: Daily Prices (Simplified View) */}
                        <div className="bg-white rounded-2xl border border-gray-100 p-8 space-y-6 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-violet-50 text-violet-600">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900">2. Sync Daily Prices</h3>
                                    <p className="text-sm text-gray-500">Ingest previous day market close data.</p>
                                </div>
                            </div>

                            <DailyPriceUpload onSuccess={fetchHistory} />
                        </div>

                        {/* Step 3: Update Technical Indicators */}
                        <PipelineStep
                            title="3. Update Technical Indicators"
                            description="Recalculate RSI, MACD, SMAs, and Sector stats for all stocks."
                            status={indicatorStatus}
                            icon={<Activity className="w-6 h-6" />}
                            onRun={handleRunIndicators}
                            logs={indicatorLogs}
                            showLogs={showIndicatorLogs}
                            onToggleLogs={() => setShowIndicatorLogs(!showIndicatorLogs)}
                        />

                        {/* Step 4: Signal Generation (The new "Boot Process") */}
                        <PipelineStep
                            title="4. Generate Strategy Signals"
                            description="Run backtests across all active strategies to generate fresh BUY/SELL signals."
                            status={signalStatus}
                            icon={<Cpu className="w-6 h-6" />}
                            onRun={handleRunSignals}
                            logs={signalLogs}
                            showLogs={showSignalLogs}
                            onToggleLogs={() => setShowSignalLogs(!showSignalLogs)}
                        />
                    </div>

                    {/* Pipeline Stats/History Sidebar */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2 px-2">
                            <History className="w-5 h-5 text-blue-600" />
                            <h2 className="font-bold text-gray-900 text-lg uppercase tracking-widest text-[11px]">System History</h2>
                        </div>

                        <Card className="border-gray-100 shadow-sm overflow-hidden">
                            <CardHeader className="bg-gray-50/50 border-b">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <Server className="w-4 h-4 text-blue-600" />
                                    Recent Ingestions
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <UploadHistoryTable logs={logs} loading={logsLoading} />
                            </CardContent>
                        </Card>
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
        return day !== 5 && day !== 6;
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
            <div className="flex flex-col gap-3 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Trading Date</label>
                </div>
                <div className="flex gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="flex-1 justify-start font-medium rounded-xl border-gray-200">
                                <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                                {date ? format(date, "PPP") : "Select date..."}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl overflow-hidden shadow-2xl">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={setDate}
                                disabled={(d) => d > new Date() || d.getDay() === 5 || d.getDay() === 6}
                            />
                        </PopoverContent>
                    </Popover>
                    <Button
                        onClick={handleGithubFetch}
                        disabled={fetchingGithub || !date}
                        className="bg-blue-600 hover:bg-blue-700 rounded-xl"
                    >
                        {fetchingGithub ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Add some basic styles for the log viewer
import { Loader2 } from 'lucide-react';

