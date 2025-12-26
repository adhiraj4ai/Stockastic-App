'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Play, Settings, Calendar, Activity, BrainCircuit, ArrowLeft, CheckCircle, ChevronDown, X } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import ForecastResultView from '@/components/forecasts/ForecastResultView';

export default function TrainModelPage() {
    const router = useRouter();
    const [symbol, setSymbol] = useState('');
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
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

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

    // Poll for job results when we have a completedJobId (which acts as "current job being watched")
    useEffect(() => {
        if (!completedJobId) return;

        let isSubscribed = true;
        const intervalId = setInterval(async () => {
            try {
                const response = await api.get(`/api/ml/training-jobs/${completedJobId}/details/`);
                if (isSubscribed) {
                    const jobData = response.data;
                    setJobResult(jobData); // LIVE UPDATE: Show progress immediately

                    if (jobData.status !== 'PENDING' && jobData.status !== 'RUNNING' && jobData.status !== 'PROGRESS') {
                        // Small delay to ensure we catch the final log update if it came in slightly out of order
                        // or just to let the user see "100%" for a split second before showing success
                        setTraining(false); // Stop the spinner

                        if (jobData.status === 'SUCCESS') {
                            toast.success('Training Model Completed Successfully!');
                            setCompletedJobId(null); // Stop polling
                        } else if (jobData.status === 'FAILED') {
                            toast.error(`Training Failed: ${jobData.error_message || 'Unknown error'}`);
                            setCompletedJobId(null); // Stop polling
                        }
                    }
                }
            } catch (error) {
                console.error('Error polling job:', error);
            }
        }, 1000); // Poll every second for better responsiveness

        return () => {
            isSubscribed = false;
            clearInterval(intervalId);
        };
    }, [completedJobId]);

    const handleTrain = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!symbol) {
            toast.error('Please enter a stock symbol');
            return;
        }

        if (selectedModels.length === 0) {
            toast.error('Please select at least one model');
            return;
        }

        if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
            toast.error('Start date must be before end date');
            return;
        }

        setTraining(true);
        setJobResult(null); // Clear previous results
        const toastId = toast.loading('Initiating training job...');

        try {
            // Build hyperparameters object
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

            // Train each selected model
            const jobIds: number[] = [];

            for (const modelType of selectedModels) {
                const response = await api.post('/api/ml/forecasts/train/', {
                    symbol: symbol.toUpperCase(),
                    model_type: modelType,
                    hyperparameters: Object.keys(hyperparameters).length > 0 ? hyperparameters : undefined,
                    optimize: optimize,
                    n_trials: optimize ? nTrials : undefined
                });

                if (response.data.job_id) {
                    jobIds.push(response.data.job_id);
                }
            }

            toast.dismiss(toastId);

            if (jobIds.length === 1) {
                // Single job: Poll inline
                setCompletedJobId(jobIds[0]);
                toast.success('Training started! Analyzing market data...');
            } else if (jobIds.length > 1) {
                // Multiple jobs: Redirect to dashboard as inline view can't show multiple easily yet
                toast.success(`${jobIds.length} training jobs started!`, {
                    action: {
                        label: 'View Dashboard',
                        onClick: () => router.push('/forecasts')
                    },
                    duration: 5000,
                });
                setTraining(false);
            } else {
                toast.error('Failed to start training job');
                setTraining(false);
            }

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
            await api.post(`/api/ml/training-jobs/${completedJobId}/stop/`);
            toast.dismiss();
            toast.success('Training stopped successfully');
            // The polling will pick up the 'FAILED' status shortly and update the UI
        } catch (error) {
            toast.dismiss();
            console.error('Error stopping job:', error);
            toast.error('Failed to stop training');
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
                            <CardHeader className="py-4 px-6 bg-gray-50/50 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                                        <Settings size={16} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700">Configuration</CardTitle>
                                        <CardDescription className="text-[10px]">Set your training parameters</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <form onSubmit={handleTrain} className="space-y-6">
                                    {/* Symbol Input */}
                                    <div className="space-y-2">
                                        <Label htmlFor="symbol" className="text-xs font-bold uppercase text-gray-500">Stock Symbol</Label>
                                        <div className="relative">
                                            <Input
                                                id="symbol"
                                                placeholder="e.g. NABIL"
                                                value={symbol}
                                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                                className="uppercase font-mono tracking-wider border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                                                disabled={training}
                                                required
                                            />
                                            {symbol && (
                                                <div className="absolute right-3 top-2.5">
                                                    {training ? (
                                                        <Activity className="h-4 w-4 text-blue-500 animate-pulse" />
                                                    ) : (
                                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Model Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase text-gray-500">Model Architecture</Label>
                                        <div className="relative">
                                            <div
                                                className={`border border-gray-300 rounded-md p-2 flex justify-between items-center bg-white cursor-pointer hover:border-blue-400 transition-colors ${training ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                onClick={() => !training && setIsModelDropdownOpen(!isModelDropdownOpen)}
                                            >
                                                <span className="text-sm font-medium">
                                                    {selectedModels.length > 0
                                                        ? `${selectedModels.join(', ')}`
                                                        : 'Select Models'}
                                                </span>
                                                <ChevronDown size={16} className={`text-gray-500 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                                            </div>

                                            {isModelDropdownOpen && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                    {['PROPHET', 'LSTM', 'GRU'].map((model) => (
                                                        <div
                                                            key={model}
                                                            className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between border-b border-gray-50 last:border-0"
                                                            onClick={() => toggleModel(model)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <BrainCircuit size={16} className={selectedModels.includes(model) ? 'text-blue-600' : 'text-gray-400'} />
                                                                <span className={`text-sm ${selectedModels.includes(model) ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{model}</span>
                                                            </div>
                                                            {selectedModels.includes(model) && <CheckCircle size={14} className="text-blue-600" />}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Date Range */}
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <Label className="text-xs font-bold text-gray-500 uppercase">Date Range (Optional)</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] text-gray-400 uppercase">Start</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="date"
                                                        value={startDate}
                                                        onChange={(e) => setStartDate(e.target.value)}
                                                        className="h-8 bg-white text-xs pl-7"
                                                        disabled={training}
                                                    />
                                                    <Calendar className="absolute left-2 top-2 text-gray-400" size={12} />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] text-gray-400 uppercase">End</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="date"
                                                        value={endDate}
                                                        onChange={(e) => setEndDate(e.target.value)}
                                                        className="h-8 bg-white text-xs pl-7"
                                                        disabled={training}
                                                    />
                                                    <Calendar className="absolute left-2 top-2 text-gray-400" size={12} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Data Splits */}
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <Label className="text-xs font-bold text-gray-500 uppercase">Data Split (%)</Label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] text-gray-400">Train</Label>
                                                <Input
                                                    type="number"
                                                    value={trainSplit}
                                                    onChange={(e) => setTrainSplit(parseInt(e.target.value))}
                                                    min="50"
                                                    max="85"
                                                    className="h-8 text-xs"
                                                    disabled={training}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] text-gray-400">Val</Label>
                                                <Input
                                                    type="number"
                                                    value={valSplit}
                                                    onChange={(e) => setValSplit(parseInt(e.target.value))}
                                                    min="5"
                                                    max="30"
                                                    className="h-8 text-xs"
                                                    disabled={training}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] text-gray-400">Test</Label>
                                                <Input
                                                    type="number"
                                                    value={100 - trainSplit - valSplit}
                                                    className="h-8 text-xs bg-gray-50"
                                                    disabled
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Advanced Hyperparameters */}
                                    {selectedModels.some(m => m === 'LSTM' || m === 'GRU') && (
                                        <div className="space-y-3 pt-4 border-t border-gray-100">
                                            <button
                                                type="button"
                                                onClick={() => setShowAdvanced(!showAdvanced)}
                                                className="flex items-center justify-between w-full text-xs font-bold text-gray-500 uppercase"
                                            >
                                                <span>Advanced Settings</span>
                                                <span className="text-blue-600 text-[10px]">{showAdvanced ? '▼ Hide' : '▶ Show'}</span>
                                            </button>

                                            {showAdvanced && (
                                                <div className="space-y-3 bg-gray-50 p-3 rounded-lg">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="space-y-1.5">
                                                            <Label className="text-[10px] text-gray-500">Learning Rate</Label>
                                                            <Input
                                                                type="number"
                                                                value={learningRate}
                                                                onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                                                                step="0.0001"
                                                                className="h-7 text-xs"
                                                                disabled={training}
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-[10px] text-gray-500">Epochs</Label>
                                                            <Input
                                                                type="number"
                                                                value={epochs}
                                                                onChange={(e) => setEpochs(parseInt(e.target.value))}
                                                                className="h-7 text-xs"
                                                                disabled={training}
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-[10px] text-gray-500">Batch Size</Label>
                                                            <Input
                                                                type="number"
                                                                value={batchSize}
                                                                onChange={(e) => setBatchSize(parseInt(e.target.value))}
                                                                className="h-7 text-xs"
                                                                disabled={training}
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-[10px] text-gray-500">Hidden Units</Label>
                                                            <Input
                                                                type="number"
                                                                value={hiddenUnits}
                                                                onChange={(e) => setHiddenUnits(parseInt(e.target.value))}
                                                                className="h-7 text-xs"
                                                                disabled={training}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Optimization Section */}
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-gray-500 uppercase">Hyperparameter Optimization</Label>
                                            <input
                                                type="checkbox"
                                                checked={optimize}
                                                onChange={(e) => setOptimize(e.target.checked)}
                                                className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                disabled={training}
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-500">
                                            Auto-tune parameters using Optuna. This significantly increases training time.
                                        </p>

                                        {optimize && (
                                            <div className="space-y-1.5 bg-blue-50 p-2.5 rounded-md">
                                                <Label className="text-[10px] text-blue-700 uppercase font-bold">Number of Trials</Label>
                                                <Input
                                                    type="number"
                                                    value={nTrials}
                                                    onChange={(e) => setNTrials(parseInt(e.target.value))}
                                                    min="5"
                                                    max="500"
                                                    className="h-8 text-xs border-blue-200"
                                                    disabled={training}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Submit Button */}
                                    <div className="space-y-2 pt-6">
                                        <Button
                                            type="submit"
                                            disabled={training}
                                            className={`w-full h-10 font-bold uppercase tracking-wider text-xs shadow-md border-0 ${!symbol || selectedModels.length === 0
                                                    ? 'bg-gray-400 cursor-not-allowed hover:bg-gray-400'
                                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                                } text-white transition-colors duration-200`}
                                        >
                                            {training ? (
                                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Training...</>
                                            ) : (
                                                <><Play size={14} className="mr-2" /> Start Training ({selectedModels.length})</>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Panel - Results & Logs */}
                    <div className="lg:col-span-8 xl:col-span-9 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[700px] p-6">
                        {training ? (
                            <div className="h-full flex flex-col">
                                {/* Running State */}
                                <div className="flex-1 flex flex-col items-center justify-center space-y-4 min-h-[200px] border-b border-gray-100 pb-8">
                                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent shadow-lg text-blue-600"></div>
                                    <div className="text-center space-y-1">
                                        <p className="text-lg font-bold text-gray-800 animate-pulse">Training {symbol} Model...</p>
                                        <p className="text-sm text-gray-500">Please wait while we process market data and optimize parameters</p>
                                    </div>
                                </div>

                                {/* Live Log Terminal */}
                                <div className="flex-1 mt-6 bg-slate-900 rounded-xl overflow-hidden flex flex-col shadow-inner">
                                    <div className="bg-slate-800 px-4 py-3 flex items-center justify-between border-b border-slate-700">
                                        <div className="flex items-center gap-2">
                                            <Activity size={14} className="text-green-400 animate-pulse" />
                                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Training Log</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500 font-mono">{completedJobId ? `ID: ${completedJobId}` : 'Initializing...'}</span>
                                    </div>
                                    <div className="p-4 overflow-y-auto font-mono text-xs space-y-2 h-full custom-scrollbar">
                                        {jobResult?.progress_message ? (
                                            jobResult.progress_message.split('\n').map((line: string, idx: number) => (
                                                <div key={idx} className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                                    <span className="text-slate-600 select-none w-6">{String(idx + 1).padStart(2, '0')}</span>
                                                    <span className="text-green-400">{line}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-slate-500 italic">Initializing training sequence...</div>
                                        )}
                                        <div className="animate-pulse text-blue-500">_</div>
                                    </div>
                                </div>
                            </div>
                        ) : jobResult ? (
                            <div className="animate-in fade-in duration-500">
                                <div className="mb-6 flex justify-between items-center">
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                        <CheckCircle className="text-emerald-500 w-5 h-5" />
                                        Training Result: {jobResult.symbol}
                                    </h3>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setJobResult(null)}
                                    >
                                        New Forecast
                                    </Button>
                                </div>
                                <ForecastResultView job={jobResult} />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Activity size={48} className="mb-4 opacity-20" />
                                <p className="text-lg font-medium">Ready to Train</p>
                                <p className="text-sm">Configure parameters and click "Start Training" to begin.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
