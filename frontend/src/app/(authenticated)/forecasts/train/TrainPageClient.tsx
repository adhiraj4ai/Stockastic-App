'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Play, Settings, Calendar, Activity, BrainCircuit, ArrowLeft, CheckCircle, ChevronDown, X } from 'lucide-react';
import api, { mlApi } from '@/lib/api';
import { toast } from 'sonner';
import ForecastResultView from '@/components/forecasts/ForecastResultView';
import { CompanySelect } from '@/components/CompanySelect';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export default function TrainModelPage() {
    const router = useRouter();
    const [symbol, setSymbol] = useState('');
    const [trainMode, setTrainMode] = useState<'SYMBOL' | 'SECTOR'>('SYMBOL');
    const [selectedSector, setSelectedSector] = useState('');
    const [sectors, setSectors] = useState<string[]>([]);
    const [selectedModels, setSelectedModels] = useState<string[]>(['PROPHET']);
    const [optimize, setOptimize] = useState(false);
    const [nTrials, setNTrials] = useState(50);

    // Data Split Configuration
    const [trainSplit, setTrainSplit] = useState(70);
    const [valSplit, setValSplit] = useState(15);
    const [testWindowSize, setTestWindowSize] = useState(90);

    // Date Range Selection
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Advanced Hyperparameters
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [learningRate, setLearningRate] = useState(0.001);
    const [epochs, setEpochs] = useState(100);
    const [batchSize, setBatchSize] = useState(32);
    const [sequenceLength, setSequenceLength] = useState(60);
    const [hiddenUnits, setHiddenUnits] = useState(128);
    const [dropout, setDropout] = useState(0.2);
    const [layers, setLayers] = useState(2);
    const [patience, setPatience] = useState(10);

    const [training, setTraining] = useState(false);
    const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
    const [sessionJobIds, setSessionJobIds] = useState<number[]>([]);
    const [batchJobs, setBatchJobs] = useState<any[]>([]);
    const [showLogDialog, setShowLogDialog] = useState(false);
    const [activeJobId, setActiveJobId] = useState<number | null>(null);

    useEffect(() => {
        const fetchSectors = async () => {
            try {
                // Fetch distinct sectors from companies API
                const sectorList = ['Finance', 'Manufacturing And Processing', 'Mutual Fund', 'Life Insurance', 'Hotels And Tourism', 'Tradings', 'Investment', 'Hydro Power', 'Commercial Banks', 'Others', 'Non Life Insurance', 'Development Banks', 'Microfinance'];
                setSectors(sectorList.sort());
            } catch (error) {
                console.error('Error fetching sectors:', error);
            }
        };
        fetchSectors();
    }, []);

    // Calculate date ranges for splits
    const calculateDateRanges = () => {
        if (!startDate || !endDate) return null;

        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        const trainDays = Math.floor(days * (trainSplit / 100));
        const valDays = Math.floor(days * (valSplit / 100));
        const testDays = days - trainDays - valDays;

        const trainEnd = new Date(start);
        trainEnd.setDate(trainEnd.getDate() + trainDays);

        const valEnd = new Date(trainEnd);
        valEnd.setDate(valEnd.getDate() + valDays);

        return {
            train: { start: start.toISOString().split('T')[0], end: trainEnd.toISOString().split('T')[0], days: trainDays },
            val: { start: trainEnd.toISOString().split('T')[0], end: valEnd.toISOString().split('T')[0], days: valDays },
            test: { start: valEnd.toISOString().split('T')[0], end: end.toISOString().split('T')[0], days: testDays },
            total: days
        };
    };

    const dateRanges = calculateDateRanges();

    const [completedJobId, setCompletedJobId] = useState<number | null>(null);
    const [jobResult, setJobResult] = useState<any>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const logEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of logs
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    // Poll for job results when we have a completedJobId (which acts as "current job being watched")
    // Poll for job results when we have a completedJobId (which acts as "current job being watched")
    // Poll for batch results or single job results
    // Poll for jobs in the current session
    useEffect(() => {
        if (!currentBatchId || !training) return;

        let isSubscribed = true;
        const intervalId = setInterval(async () => {
            try {
                // Fetch all jobs in the current session by batch_id
                const response = await mlApi.get(`/api/training-jobs/?batch_id=${currentBatchId}`);

                if (isSubscribed) {
                    const jobs = response.data.results || response.data;
                    // Sort to maintain order (optional, backend usually orders by started_at)
                    setBatchJobs(jobs);

                    // Check if all jobs are finished
                    const allFinished = jobs.every((job: any) =>
                        ['SUCCESS', 'FAILED', 'HALTED'].includes(job.status)
                    );

                    if (allFinished && jobs.length > 0 && training) {
                        setTraining(false);
                        toast.success(`Training completed for ${jobs.length} model(s)!`);
                    }
                }
            } catch (error) {
                console.error('Error polling jobs:', error);
            }
        }, 2000);

        return () => {
            isSubscribed = false;
            clearInterval(intervalId);
        };
    }, [currentBatchId, training]);

    // Separate effect for active log polling (Dialog/Live view)
    useEffect(() => {
        if (!activeJobId || !showLogDialog) return;

        let isSubscribed = true;
        const intervalId = setInterval(async () => {
            try {
                const response = await mlApi.get(`/api/training-jobs/${activeJobId}/details/`);
                if (isSubscribed) {
                    const jobData = response.data;
                    if (jobData.progress_message) {
                        setLogs(prev => {
                            const last = prev[prev.length - 1];
                            if (last !== jobData.progress_message) return [...prev, jobData.progress_message];
                            return prev;
                        });
                    }
                    if (['SUCCESS', 'FAILED', 'HALTED'].includes(jobData.status)) {
                        // Keep the log open but stop polling
                        setActiveJobId(null);
                    }
                }
            } catch (error) {
                console.error('Error polling active logs:', error);
            }
        }, 1500);

        return () => {
            isSubscribed = false;
            clearInterval(intervalId);
        };
    }, [activeJobId, showLogDialog]);

    const handleTrain = async (e: React.FormEvent) => {
        e.preventDefault();

        if (trainMode === 'SYMBOL' && !symbol) {
            toast.error('Please select a stock symbol');
            return;
        }

        if (trainMode === 'SECTOR' && !selectedSector) {
            toast.error('Please select a sector');
            return;
        }

        if (selectedModels.length === 0) {
            toast.error('Please select at least one model');
            return;
        }

        setTraining(true);
        // Do NOT clear batchJobs here if we want to accumulate sessions? 
        // Or clear them to start fresh? User says "When two models are trained", likely in one go.
        // Let's clear for a new "training run" to avoid confusion.
        setSessionJobIds([]);
        setBatchJobs([]);
        setLogs([]);

        // Generate a unique batch/session ID for this training run
        const batchId = crypto.randomUUID();
        setCurrentBatchId(batchId);

        const toastId = toast.loading(trainMode === 'SECTOR' ? `Initiating training for ${selectedSector} sector...` : 'Initiating training job...');

        try {
            const hyperparameters: any = {
                train_split: trainSplit / 100,
                val_split: valSplit / 100,
                test_window_size: testWindowSize,
            };

            if (startDate && endDate) {
                hyperparameters.start_date = startDate;
                hyperparameters.end_date = endDate;
            }

            if (selectedModels.some(m => m === 'LSTM' || m === 'GRU')) {
                hyperparameters.learning_rate = learningRate;
                hyperparameters.epochs = epochs;
                hyperparameters.batch_size = batchSize;
                hyperparameters.sequence_length = sequenceLength;
                hyperparameters.hidden_units = hiddenUnits;
                hyperparameters.dropout = dropout;
                hyperparameters.num_layers = layers;
                hyperparameters.patience = patience;
            }

            // In the new API, we can send multiple models if supported or loop.
            // Our backend currently handles one model_type per request.
            // But we can now send sector instead of symbol.

            for (const modelType of selectedModels) {
                const payload: any = {
                    model_type: modelType,
                    hyperparameters: hyperparameters,
                    optimize: optimize,
                    n_trials: optimize ? nTrials : undefined,
                    batch_id: batchId
                };

                if (trainMode === 'SECTOR') {
                    payload.sector = selectedSector;
                } else {
                    payload.symbol = symbol;
                }

                // Use mlApi instead of api to ensure correct base URL
                const response = await mlApi.post('/api/forecasts/train/', payload);

                // Collect IDs
                if (response.data.job_ids) {
                    // Batch/Sector response
                    setSessionJobIds(prev => [...prev, ...response.data.job_ids]);
                } else if (response.data.job_ids) {
                    // handling potential different response structure
                    setSessionJobIds(prev => [...prev, ...response.data.job_ids]);
                } else {
                    // Fallback using single job detection if needed, though train endpoint returns lists usually
                    // But if it's a single job for single symbol:
                    // The backend train endpoint shown returns: job_ids: [...], task_ids: [...]
                    if (response.data.job_ids) {
                        setSessionJobIds(prev => [...prev, ...response.data.job_ids]);
                    }
                }
            }

            toast.dismiss(toastId);
            toast.success('Training sequence initiated successfully!');

        } catch (error: any) {
            toast.dismiss(toastId);
            console.error('Training failed:', error);
            const errorMsg = error.response?.data?.error || error.message;
            toast.error(`Training Failed: ${errorMsg}`);
            setTraining(false);
        }
    };

    const handleStop = async () => {
        if (!completedJobId) return;

        try {
            toast.loading('Stopping training job...');
            await mlApi.post(`/api/training-jobs/${completedJobId}/stop/`);
            toast.dismiss();
            toast.success('Training stopped successfully');
            // The polling will pick up 'HALTED' or 'FAILED' shortly
        } catch (error: any) {
            toast.dismiss();
            console.error('Error stopping job:', error);
            const errorMsg = error.response?.data?.error || 'Failed to stop training';
            toast.error(errorMsg);
        }
    };

    const toggleModel = (model: string) => {
        if (selectedModels.includes(model)) {
            setSelectedModels(selectedModels.filter(m => m !== model));
        } else {
            setSelectedModels([...selectedModels, model]);
        }
    };

    return (
        <DashboardLayout
            title="Train New Model"
            subtitle="Configure and train forecasting models for stock price prediction"
        >
            <div className="space-y-6">
                {/* Back Button */}
                <div className="flex items-center gap-2 -mt-4 mb-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/forecasts')}
                        className="h-8 gap-1 text-gray-500 hover:text-gray-900"
                    >
                        <ArrowLeft size={14} /> Back to Forecasts
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Configuration Panel - Sticky Sidebar */}
                    <div className="lg:col-span-4 xl:col-span-3">
                        <Card className="border-gray-200 shadow-sm overflow-hidden sticky top-6">
                            <CardHeader className="py-3 px-5 bg-gray-50/50 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                                        <Settings size={14} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700">Configuration</CardTitle>
                                        <CardDescription className="text-[10px]">Set your training parameters</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <form onSubmit={handleTrain} className="space-y-4">
                                    {/* Training Mode Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-gray-500">Training Scope</Label>
                                        <Tabs value={trainMode} onValueChange={(v) => setTrainMode(v as any)} className="w-full">
                                            <TabsList className="grid grid-cols-2 w-full h-8 bg-gray-100">
                                                <TabsTrigger value="SYMBOL" className="text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 h-7">Single Symbol</TabsTrigger>
                                                <TabsTrigger value="SECTOR" className="text-[10px] uppercase font-bold data-[state=active]:bg-white data-[state=active]:text-blue-600 h-7">By Sector</TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </div>

                                    {/* Symbol/Sector Input */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="target" className="text-[10px] font-bold uppercase text-gray-500">
                                            {trainMode === 'SYMBOL' ? 'Stock Symbol' : 'Select Sector'}
                                        </Label>

                                        {trainMode === 'SYMBOL' ? (
                                            <div className="scale-95 origin-left w-[105%]">
                                                <CompanySelect
                                                    value={symbol}
                                                    onChange={(val) => setSymbol(val)}
                                                />
                                            </div>
                                        ) : (
                                            <Select value={selectedSector} onValueChange={setSelectedSector}>
                                                <SelectTrigger className="w-full h-8 text-xs border-gray-300 focus:ring-blue-500">
                                                    <SelectValue placeholder="Select a sector..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {sectors.map(sector => (
                                                        <SelectItem key={sector} value={sector} className="text-xs">{sector}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>

                                    {/* Model Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-gray-500">Model Architecture</Label>
                                        <div className="grid grid-cols-1 gap-1.5">
                                            {[
                                                { id: 'PROPHET', name: 'Prophet', desc: 'Robust time-series stats model' },
                                                { id: 'LSTM', name: 'LSTM RNN', desc: 'Long-term memory deep learning' },
                                                { id: 'GRU', name: 'GRU RNN', desc: 'Efficient recurrent architecture' }
                                            ].map((model) => (
                                                <div
                                                    key={model.id}
                                                    onClick={() => toggleModel(model.id)}
                                                    className={`p-2.5 rounded-md border cursor-pointer transition-all ${selectedModels.includes(model.id)
                                                        ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <BrainCircuit size={12} className={selectedModels.includes(model.id) ? 'text-blue-600' : 'text-gray-400'} />
                                                            <span className={`text-[11px] font-bold ${selectedModels.includes(model.id) ? 'text-blue-900' : 'text-gray-700'}`}>{model.name}</span>
                                                        </div>
                                                        {selectedModels.includes(model.id) && <CheckCircle size={10} className="text-blue-600" />}
                                                    </div>
                                                    <p className="text-[9px] text-gray-500 leading-tight">{model.desc}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Date Range */}
                                    <div className="space-y-2 pt-3 border-t border-gray-100">
                                        <Label className="text-[10px] font-bold text-gray-500 uppercase">Date Range (Optional)</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-[9px] text-gray-400 uppercase">Start</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="date"
                                                        value={startDate}
                                                        onChange={(e) => setStartDate(e.target.value)}
                                                        className="h-7 bg-white text-[10px] pl-6"
                                                        disabled={training}
                                                    />
                                                    <Calendar className="absolute left-1.5 top-1.5 text-gray-400" size={10} />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[9px] text-gray-400 uppercase">End</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="date"
                                                        value={endDate}
                                                        onChange={(e) => setEndDate(e.target.value)}
                                                        className="h-7 bg-white text-[10px] pl-6"
                                                        disabled={training}
                                                    />
                                                    <Calendar className="absolute left-1.5 top-1.5 text-gray-400" size={10} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Data Splits */}
                                    <div className="space-y-2 pt-3 border-t border-gray-100">
                                        <Label className="text-[10px] font-bold text-gray-500 uppercase">Data Split (%)</Label>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            <div className="space-y-1">
                                                <Label className="text-[9px] text-gray-400">Train</Label>
                                                <Input
                                                    type="number"
                                                    value={trainSplit}
                                                    onChange={(e) => setTrainSplit(parseInt(e.target.value))}
                                                    min="50"
                                                    max="85"
                                                    className="h-7 text-[10px] px-1 text-center"
                                                    disabled={training}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[9px] text-gray-400">Val</Label>
                                                <Input
                                                    type="number"
                                                    value={valSplit}
                                                    onChange={(e) => setValSplit(parseInt(e.target.value))}
                                                    min="5"
                                                    max="30"
                                                    className="h-7 text-[10px] px-1 text-center"
                                                    disabled={training}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[9px] text-gray-400">Test</Label>
                                                <Input
                                                    type="number"
                                                    value={100 - trainSplit - valSplit}
                                                    className="h-7 text-[10px] px-1 text-center bg-gray-50"
                                                    disabled
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Advanced Hyperparameters */}
                                    {selectedModels.some(m => m === 'LSTM' || m === 'GRU') && (
                                        <div className="space-y-2 pt-3 border-t border-gray-100">
                                            <button
                                                type="button"
                                                onClick={() => setShowAdvanced(!showAdvanced)}
                                                className="flex items-center justify-between w-full text-[10px] font-bold text-gray-500 uppercase hover:text-blue-600 transition-colors"
                                            >
                                                <span>Advanced Settings</span>
                                                <span className="text-blue-600 text-[9px]">{showAdvanced ? '▼ Hide' : '▶ Show'}</span>
                                            </button>

                                            {showAdvanced && (
                                                <div className="space-y-2 bg-gray-50 p-2 rounded-md border border-gray-100">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <Label className="text-[9px] text-gray-500">Learning Rate</Label>
                                                            <Input
                                                                type="number"
                                                                value={learningRate}
                                                                onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                                                                step="0.0001"
                                                                className="h-6 text-[10px]"
                                                                disabled={training}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[9px] text-gray-500">Epochs</Label>
                                                            <Input
                                                                type="number"
                                                                value={epochs}
                                                                onChange={(e) => setEpochs(parseInt(e.target.value))}
                                                                className="h-6 text-[10px]"
                                                                disabled={training}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[9px] text-gray-500">Batch Size</Label>
                                                            <Input
                                                                type="number"
                                                                value={batchSize}
                                                                onChange={(e) => setBatchSize(parseInt(e.target.value))}
                                                                className="h-6 text-[10px]"
                                                                disabled={training}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[9px] text-gray-500">Hidden Units</Label>
                                                            <Input
                                                                type="number"
                                                                value={hiddenUnits}
                                                                onChange={(e) => setHiddenUnits(parseInt(e.target.value))}
                                                                className="h-6 text-[10px]"
                                                                disabled={training}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Optimization Section */}
                                    <div className="space-y-2 pt-3 border-t border-gray-100">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[10px] font-bold text-gray-500 uppercase">Hyperparameter Optimization</Label>
                                            <input
                                                type="checkbox"
                                                checked={optimize}
                                                onChange={(e) => setOptimize(e.target.checked)}
                                                className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                disabled={training}
                                            />
                                        </div>

                                        {optimize && (
                                            <div className="space-y-1 bg-blue-50 p-2 rounded-md">
                                                <Label className="text-[9px] text-blue-700 uppercase font-bold">Number of Trials</Label>
                                                <Input
                                                    type="number"
                                                    value={nTrials}
                                                    onChange={(e) => setNTrials(parseInt(e.target.value))}
                                                    min="5"
                                                    max="500"
                                                    className="h-7 text-[10px] border-blue-200"
                                                    disabled={training}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Submit Button */}
                                    <div className="pt-4">
                                        <Button
                                            type="submit"
                                            disabled={training || (trainMode === 'SYMBOL' && !symbol) || (trainMode === 'SECTOR' && !selectedSector) || selectedModels.length === 0}
                                            className={`w-full h-9 font-bold uppercase tracking-wider text-[10px] shadow-md border-0 ${training || (trainMode === 'SYMBOL' && !symbol) || (trainMode === 'SECTOR' && !selectedSector) || selectedModels.length === 0
                                                ? 'bg-gray-400 cursor-not-allowed'
                                                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                                } text-white transition-all`}
                                        >
                                            {training ? (
                                                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Training...</>
                                            ) : (
                                                <><Play size={12} className="mr-2" /> Start Training</>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Panel - Results & Progress */}
                    <div className="lg:col-span-8 xl:col-span-9 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col transition-all min-h-[600px]">
                        {batchJobs.length > 0 || training ? (
                            <div className="p-6 h-full flex flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                            <Activity className={`${training ? 'animate-pulse text-blue-500' : 'text-gray-400'}`} size={20} />
                                            {training ? 'Training in Progress' : 'Training Sequence Results'}
                                        </h3>
                                        <p className="text-xs text-gray-500">
                                            {batchJobs.length} models being processed {trainMode === 'SECTOR' ? `for ${selectedSector}` : ''}
                                        </p>
                                    </div>
                                    {training && (
                                        <Button variant="destructive" size="sm" onClick={() => setTraining(false)} className="h-8 text-[10px] font-bold uppercase">
                                            Stop All
                                        </Button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-4 auto-rows-fr">
                                    {batchJobs.map((job) => (
                                        <div key={job.id} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group flex flex-col overflow-hidden">
                                            {/* Card Header */}
                                            <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm pointer-events-none select-none shadow-sm">
                                                        {job.symbol.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 text-base leading-none mb-1">{job.symbol}</h4>
                                                        <span className="text-xs text-gray-500 font-medium bg-white px-2 py-0.5 rounded border border-gray-100">{job.model_type}</span>
                                                    </div>
                                                </div>
                                                <Badge
                                                    variant="outline"
                                                    className={`px-3 py-1 text-xs font-bold border-0 ${job.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20' :
                                                        job.status === 'FAILED' ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-500/20' :
                                                            'bg-amber-50 text-amber-700 ring-1 ring-amber-500/20 animate-pulse'
                                                        }`}
                                                >
                                                    {job.status}
                                                </Badge>
                                            </div>

                                            {/* Card Content */}
                                            <div className="p-5 flex-1 flex flex-col gap-4">
                                                {/* Progress Section */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-xs text-gray-500 font-medium">
                                                        <span>Progress</span>
                                                        <span>{job.status === 'SUCCESS' ? '100%' : job.status === 'FAILED' ? 'Err' : 'Running...'}</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full transition-all duration-500 ${job.status === 'SUCCESS' ? 'bg-emerald-500 w-full' :
                                                                job.status === 'FAILED' ? 'bg-rose-500 w-full' :
                                                                    'bg-blue-500 w-1/2 animate-[progress_1s_ease-in-out_infinite]'
                                                                }`}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Details Grid */}
                                                <div className="grid grid-cols-2 gap-3 mt-auto">
                                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                        <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Started</div>
                                                        <div className="text-xs text-gray-700 font-mono font-medium">
                                                            {new Date(job.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                        <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Duration</div>
                                                        <div className="text-xs text-gray-700 font-mono font-medium">
                                                            {job.duration ? `${Math.round(job.duration)}s` : '-'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Latest Log Message */}
                                                <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 shadow-inner">
                                                    <div className="text-[9px] text-slate-500 uppercase font-bold mb-1.5 flex items-center gap-1.5">
                                                        <Activity size={10} className="text-blue-500" /> Latest Log
                                                    </div>
                                                    <p className="text-xs text-green-400 font-mono line-clamp-2 leading-relaxed">
                                                        {job.progress_message ? `> ${job.progress_message}` : '> Initializing worker...'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Card Footer */}
                                            <div className="p-3 border-t border-gray-100 bg-gray-50/50 flex gap-3">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1 h-8 text-xs font-bold text-gray-700 hover:text-blue-600 hover:bg-blue-50 border-gray-200 bg-white"
                                                    onClick={() => {
                                                        setActiveJobId(job.id);
                                                        setLogs([]);
                                                        setShowLogDialog(true);
                                                    }}
                                                >
                                                    View Logs
                                                </Button>
                                                {job.status === 'SUCCESS' && (
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        className="flex-1 h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm border-0"
                                                        onClick={() => router.push(`/forecasts/train/${job.id}`)}
                                                    >
                                                        View Results
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Loading State for Groups */}
                                    {batchJobs.length === 0 && training && (
                                        <div className="col-span-full h-48 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 rounded-xl border-2 border-dashed border-gray-200">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
                                            <p className="text-sm font-medium">Initializing batch training sequence...</p>
                                        </div>
                                    )}
                                </div>

                            </div>
                        ) : jobResult ? (
                            <div className="p-6 animate-in fade-in duration-500 h-full">
                                <div className="mb-6 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                            <CheckCircle className="text-emerald-500 w-5 h-5" />
                                            Training Result: {jobResult.symbol}
                                        </h3>
                                        <p className="text-xs text-gray-500">Model trained and validated successfully</p>
                                    </div>
                                    <Button size="sm" variant="outline" onClick={() => setJobResult(null)} className="h-8 text-xs">
                                        New Training
                                    </Button>
                                </div>
                                <ForecastResultView job={jobResult} />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-12 text-center">
                                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                    <Activity size={32} className="opacity-20" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Ready for Intelligence</h3>
                                <p className="text-sm max-w-md">
                                    Select a stock or sector on the left to begin training advanced forecasting models.
                                    Our LSTM, GRU, and Prophet architectures will analyze historical patterns to predict future performance.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Log Dialog */}
                <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
                    <DialogContent className="max-w-3xl h-[600px] flex flex-col p-0 bg-slate-950 border-slate-800">
                        <DialogHeader className="p-4 border-b border-slate-800 bg-slate-900 shrink-0">
                            <DialogTitle className="text-slate-200 flex items-center gap-2 text-sm font-bold uppercase">
                                <Activity size={16} className="text-blue-500" />
                                Training Logs
                            </DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1 custom-scrollbar">
                            {logs.map((line, idx) => (
                                <div key={idx} className="flex gap-3 animate-in fade-in slide-in-from-left-1 duration-100">
                                    <span className="text-slate-700 select-none w-6 text-right">{String(idx + 1).padStart(2, '0')}</span>
                                    <span className="text-green-400/90 whitespace-pre-wrap">{line}</span>
                                </div>
                            ))}
                            {logs.length === 0 && <div className="text-slate-600 italic">Connecting to worker logs...</div>}
                            <div ref={logEndRef} />
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    );
}
