'use client';

import { useState, useEffect } from 'react';
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
    FileJson
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

export default function PipelinePage() {
    const [uploading, setUploading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

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
        <DashboardLayout title="Data Pipeline">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto animate-in fade-in duration-500">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <UploadCloud className="w-5 h-5 text-blue-600" />
                            Upload Daily Floorsheet
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-200
                                ${isDragActive ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}
                                ${uploading ? 'opacity-50 pointer-events-none' : ''}
                            `}
                        >
                            <input {...getInputProps()} />
                            <div className="flex flex-col items-center gap-4">
                                <div className={`p-4 rounded-full transition-colors ${isDragActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                    <FileJson className={`w-10 h-10 ${isDragActive ? 'text-blue-600' : 'text-gray-500'}`} />
                                </div>
                                <div>
                                    {uploading ? (
                                        <p className="text-gray-600 font-medium animate-pulse">Processing floorsheet data...</p>
                                    ) : isDragActive ? (
                                        <p className="text-blue-600 font-bold text-lg">Drop JSON file here</p>
                                    ) : (
                                        <>
                                            <p className="text-gray-900 font-semibold text-lg">Drag & drop Floorsheet JSON</p>
                                            <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">Supports standard floorsheet export format (.json)</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>



                <DailyPriceUpload onSuccess={fetchHistory} />
            </div>

            <UploadHistoryTable logs={logs} loading={logsLoading} />
        </DashboardLayout >
    );
}

function DailyPriceUpload({ onSuccess }: { onSuccess?: () => void }) {
    const [date, setDate] = useState<Date>();
    const [fetchingGithub, setFetchingGithub] = useState(false);
    const [uploading, setUploading] = useState(false);

    const isTradingDay = (d: Date) => {
        const day = d.getDay();
        return day !== 5 && day !== 6; // Friday and Saturday are weekends in Nepal
    };

    const handleGithubFetch = async () => {
        if (!date) {
            toast.error("Please select a date first");
            return;
        }

        if (!isTradingDay(date)) {
            toast.error("Market is closed on Friday and Saturday");
            return;
        }

        const dateStr = format(date, 'yyyy-MM-dd');
        setFetchingGithub(true);
        try {
            const res = await api.post('/api/stocks/pipeline/fetch_daily_prices_from_github/', {
                date: dateStr
            });
            toast.success(res.data.message || 'Successfully fetched prices from GitHub');
            if (onSuccess) onSuccess();
        } catch (err: any) {
            console.error(err);
            toast.error(err.response?.data?.error || "Failed to fetch from GitHub");
        } finally {
            setFetchingGithub(false);
        }
    };

    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const file = acceptedFiles[0];

        // Try to extract date from filename if not already set
        let selectedDate = date;
        if (!selectedDate) {
            // Match YYYY-MM-DD or YYYY_MM_DD
            const dateMatch = file.name.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
            if (dateMatch) {
                // Normalize to YYYY-MM-DD for Date parsing
                const normalizedDateStr = dateMatch[1].replace(/_/g, '-');
                const parsedDate = new Date(normalizedDateStr);
                if (!isNaN(parsedDate.getTime())) {
                    selectedDate = parsedDate;
                    setDate(parsedDate);
                    toast.info(`Date detected: ${normalizedDateStr}`);
                }
            }
        }

        if (!selectedDate) {
            // If still no date, ask user to pick one.
            // But we don't return here if we want to allow selecting date AFTER drop? 
            // The current logic creates FormData immediately. 
            // Better UX: If no date, just return and let the user pick it, stored file in state?
            // For now, keeping original flow: Must pick date or have it in filename.
            toast.error("Please select a date first (or use filename with YYYY-MM-DD)");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        formData.append('date', dateStr);

        setUploading(true);
        try {
            const res = await api.post('/api/stocks/pipeline/upload_daily_prices/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            toast.success(res.data.message || 'Prices uploaded successfully');
            if (onSuccess) onSuccess();
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
            'text/csv': ['.csv']
        },
        maxFiles: 1
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Sync Daily Prices
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col gap-3 bg-blue-50/30 p-4 rounded-xl border border-blue-100/50">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <CalendarIcon className="w-4 h-4 text-blue-600" />
                            Trading Date
                        </label>
                        {date && !isTradingDay(date) && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded uppercase tracking-wider">
                                Market Closed
                            </span>
                        )}
                    </div>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-between text-left font-medium border-gray-200 bg-white shadow-sm ring-offset-background transition-all hover:bg-white hover:border-blue-400 hover:ring-2 hover:ring-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500",
                                    !date && "text-muted-foreground",
                                    date && isTradingDay(date) && "border-blue-200 text-blue-900"
                                )}
                            >
                                <div className="flex items-center">
                                    <Clock className="mr-2 h-4 w-4 text-blue-500 opacity-70" />
                                    {date ? format(date, "EEEE, MMMM do, yyyy") : <span>Select trading date...</span>}
                                </div>
                                <RefreshCw className={cn("h-4 w-4 text-gray-400 transition-transform duration-500", fetchingGithub && "animate-spin")} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 border-none shadow-2xl rounded-xl overflow-hidden bg-white" align="start">
                            <div className="bg-blue-600 p-5 text-white">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black opacity-60 mb-1">Market Session</p>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xl font-bold">{date ? format(date, "MMMM do") : "Pick a Date"}</p>
                                        <p className="text-sm opacity-80">{date ? format(date, "yyyy") : "Select a session"}</p>
                                    </div>
                                    <CalendarIcon className="w-8 h-8 opacity-20" />
                                </div>
                            </div>
                            <div className="p-3 min-w-[300px]">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    initialFocus
                                    disabled={(d) => d > new Date() || d.getDay() === 5 || d.getDay() === 6}
                                    className="border-none"
                                />
                            </div>
                            <div className="p-3 bg-gray-50 border-t flex justify-between gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-blue-600 hover:bg-blue-50"
                                    onClick={() => {
                                        const d = new Date();
                                        // Find last trading day
                                        while (!isTradingDay(d)) {
                                            d.setDate(d.getDate() - 1);
                                        }
                                        setDate(d);
                                    }}
                                >
                                    Last Trading Day
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs text-gray-500"
                                    onClick={() => setDate(undefined)}
                                >
                                    Clear
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                <Tabs defaultValue="github" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 max-w-[400px] bg-gray-100 p-1 rounded-lg">
                        <TabsTrigger
                            value="github"
                            className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all"
                        >
                            Fetch from GitHub
                        </TabsTrigger>
                        <TabsTrigger
                            value="upload"
                            className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all"
                        >
                            Upload CSV
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload" className="mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-200
                                ${isDragActive ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}
                                ${uploading ? 'opacity-50 pointer-events-none' : ''}
                            `}
                        >
                            <input {...getInputProps()} />
                            <div className="flex flex-col items-center gap-4">
                                <div className={`p-4 rounded-full transition-colors ${isDragActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                    <FileText className={`w-10 h-10 ${isDragActive ? 'text-blue-600' : 'text-gray-500'}`} />
                                </div>
                                <div>
                                    {uploading ? (
                                        <p className="text-gray-600 font-medium animate-pulse">Uploading prices...</p>
                                    ) : isDragActive ? (
                                        <p className="text-blue-600 font-bold text-lg">Drop the price CSV here...</p>
                                    ) : (
                                        <>
                                            <p className="text-gray-900 font-semibold text-lg">Drag & drop Price CSV here</p>
                                            <p className="text-sm text-gray-500 mt-2">Requires 'Symbol', 'Close', etc.</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="github" className="mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="border rounded-xl p-8 bg-gray-50/50 flex flex-col items-center text-center gap-6">
                            <div className="p-4 rounded-full bg-blue-100">
                                <UploadCloud className="w-10 h-10 text-blue-600" />
                            </div>
                            <div className="max-w-md space-y-2">
                                <h4 className="font-bold text-gray-900 text-lg">Sync from GitHub Repository</h4>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    Automatically fetch and ingest the daily price CSV from the ShareSansarDataScrape repository for the selected date.
                                </p>
                            </div>

                            <div className="space-y-4 w-full flex flex-col items-center">
                                <Button
                                    onClick={handleGithubFetch}
                                    disabled={fetchingGithub || !date}
                                    className="w-full max-w-[280px] h-11 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-70 disabled:hover:scale-100"
                                >
                                    {fetchingGithub ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            <span>Syncing Prices...</span>
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="w-4 h-4" />
                                            <span>Fetch Prices</span>
                                        </>
                                    )}
                                </Button>

                                {!date && (
                                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                                        <AlertCircle className="w-3 h-3" />
                                        Please select a date above to enable sync
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

