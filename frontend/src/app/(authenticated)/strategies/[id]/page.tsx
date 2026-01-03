'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Play, Edit, Calendar, Activity, TrendingUp, TrendingDown, Clock, Code, FileJson, History, Zap, Target } from 'lucide-react';
import Editor from '@monaco-editor/react';
import ExperimentsTab from './tabs/ExperimentsTab'; // Import the existing ExperimentsTab
import { toast } from 'sonner';

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
    created_at: string;
    updated_at: string;
    published_experiments: {
        id: number;
        scope_type: string;
        scope_value: string;
        parameters: any;
        created_at: string;
        metrics: any;
    }[];
    pnl_amount?: number;
    pnl_percent?: number;
    max_drawdown?: number;
    sharpe_ratio?: number;
    win_rate?: number;
}

export default function StrategyDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id;
    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            fetchStrategy();
        }
    }, [id]);

    const fetchStrategy = async () => {
        try {
            const response = await api.get(`/api/stocks/strategies/${id}/`);
            setStrategy(response.data);
        } catch (error: any) {
            toast.error('Failed to load strategy details');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-full text-gray-500 animate-pulse">
                    Loading strategy details...
                </div>
            </DashboardLayout>
        );
    }

    if (!strategy) {
        return (
            <DashboardLayout>
                <div className="text-center py-20">
                    <h2 className="text-xl font-semibold text-gray-900">Strategy not found</h2>
                    <Button variant="link" onClick={() => router.push('/strategies')} className="mt-4">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Strategies
                    </Button>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            headerContent={
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full flex-shrink-0"
                            onClick={() => router.push('/strategies')}
                        >
                            <ArrowLeft size={20} />
                        </Button>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-slate-900 truncate">{strategy.name}</h1>
                                {strategy.published_experiments && strategy.published_experiments.length > 0 && (
                                    <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0 rounded-full font-bold shadow-sm h-5 hidden sm:flex">
                                        Published
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 truncate max-w-md">{strategy.description}</p>
                        </div>
                    </div>

                </div>
            }
        >
            <div className="space-y-6">
                <div className="flex justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-9 px-4 text-xs font-bold border-slate-200 hover:bg-slate-50 transition-all active:scale-95 rounded-lg shadow-sm"
                        onClick={() => router.push(`/strategies/${id}/editor`)}
                    >
                        <Code size={14} /> Edit
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-9 px-4 text-xs font-bold bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 transition-all active:scale-95 rounded-lg"
                        onClick={() => router.push(`/strategies/${id}/optimize`)}
                    >
                        <Zap size={14} /> Optimize
                    </Button>
                    <Button
                        size="sm"
                        className="gap-1.5 h-9 px-4 text-xs font-bold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 transition-all active:scale-95 rounded-lg shadow-sm"
                        onClick={() => router.push(`/strategies/${id}/backtest`)}
                    >
                        <Play size={14} fill="currentColor" /> Run Backtest
                    </Button>
                </div>

                {/* Key Metrics Cards (Overview) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-green-50 via-white to-emerald-50/30 border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all group">
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between mb-1">
                                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Return</CardTitle>
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <TrendingUp size={16} className="text-white" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className={`text-2xl font-black ${Number(strategy.pnl_percent || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {Number(strategy.pnl_percent || 0) >= 0 ? '+' : ''}{Number(strategy.pnl_percent || 0).toFixed(2)}%
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-50 via-white to-sky-50/30 border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all group">
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between mb-1">
                                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sharpe Ratio</CardTitle>
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-400 to-sky-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Activity size={16} className="text-white" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-black text-slate-900">
                                {Number(strategy.sharpe_ratio || 0).toFixed(2)}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-red-50 via-white to-orange-50/30 border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all group">
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between mb-1">
                                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Max Drawdown</CardTitle>
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-400 to-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <TrendingDown size={16} className="text-white" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-black text-red-600">
                                {Number(strategy.max_drawdown || 0).toFixed(2)}%
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-purple-50 via-white to-indigo-50/30 border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all group">
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between mb-1">
                                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Win Rate</CardTitle>
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Target size={16} className="text-white" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-black text-slate-900">
                                {Number(strategy.win_rate || 0).toFixed(0)}%
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs for Details */}
                <Tabs defaultValue="history" className="space-y-4">
                    <TabsList className="bg-white border border-slate-200 p-1 h-auto rounded-xl shadow-sm">
                        <TabsTrigger
                            value="history"
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-lg py-2.5 px-4 text-xs font-bold text-slate-600 transition-all"
                        >
                            <History size={14} className="mr-1.5" /> History
                        </TabsTrigger>
                        <TabsTrigger
                            value="implementation"
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-lg py-2.5 px-4 text-xs font-bold text-slate-600 transition-all"
                        >
                            <Code size={14} className="mr-1.5" /> Implementation
                        </TabsTrigger>
                        <TabsTrigger
                            value="parameters"
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-lg py-2.5 px-4 text-xs font-bold text-slate-600 transition-all"
                        >
                            <FileJson size={14} className="mr-1.5" /> Published Config
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="history" className="m-0">
                        <Card className="border-gray-200 shadow-sm">
                            <CardContent className="p-0">
                                <ExperimentsTab strategyId={Number(id)} />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="implementation" className="m-0">
                        <Card className="border-gray-200 shadow-sm overflow-hidden">
                            <div className="h-[500px] border-b border-gray-100">
                                <Editor
                                    height="100%"
                                    defaultLanguage="python"
                                    value={strategy.code}
                                    theme="vs-light"
                                    options={{
                                        readOnly: true,
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                    }}
                                />
                            </div>
                            <div className="bg-gray-50 p-3 text-xs text-gray-500 flex justify-between items-center">
                                <span>Read-only view</span>
                                <Button variant="link" className="h-auto p-0 text-blue-600" onClick={() => router.push(`/strategies/${id}/editor`)}>
                                    Edit Code &rarr;
                                </Button>
                            </div>
                        </Card>
                    </TabsContent>

                    <TabsContent value="parameters" className="m-0">
                        <Card className="border-gray-200 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base">Published Configuration</CardTitle>
                                <CardDescription>Parameters currently used for generating market recommendations.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {strategy.published_experiments && strategy.published_experiments.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {strategy.published_experiments.map((exp) => (
                                            <div key={exp.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="bg-white font-mono text-xs">
                                                            {exp.scope_type === 'ALL' ? 'ALL MARKET' :
                                                                exp.scope_type === 'SECTOR' ? `SECTOR: ${exp.scope_value}` :
                                                                    exp.scope_value}
                                                        </Badge>
                                                        <span className="text-[10px] text-gray-400">
                                                            Detailed ID: {exp.id}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-gray-500">
                                                        {new Date(exp.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Parameters</div>
                                                    <pre className="bg-white p-3 rounded border border-gray-100 overflow-x-auto text-xs font-mono text-gray-800 shadow-sm">
                                                        {JSON.stringify(exp.parameters, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                        <Activity className="mx-auto h-8 w-8 mb-2 opacity-50" />
                                        <p>This strategy is not currently published.</p>
                                        <Button variant="link" className="mt-2 text-blue-600" onClick={() => router.push(`/strategies/${id}/run`)}>
                                            Run an experiment to publish &rarr;
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
