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
import { ArrowLeft, Play, Edit, Calendar, Activity, TrendingUp, TrendingDown, Clock, Code, FileJson, History } from 'lucide-react';
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
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 rounded-full"
                                onClick={() => router.push('/strategies')}
                            >
                                <ArrowLeft size={16} />
                            </Button>
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{strategy.name}</h1>
                            {strategy.published_experiments && strategy.published_experiments.length > 0 && (
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
                                    {strategy.published_experiments.length} Published
                                </Badge>
                            )}
                        </div>
                        <p className="text-gray-500 text-sm max-w-2xl">{strategy.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => router.push(`/strategies/${id}/edit`)}
                        >
                            <Edit size={16} /> Edit Code
                        </Button>
                        <Button
                            className="gap-2 bg-blue-600 hover:bg-blue-700"
                            onClick={() => router.push(`/strategies/${id}/run`)}
                        >
                            <Play size={16} /> Run Strategy
                        </Button>
                    </div>
                </div>

                {/* Key Metrics Cards (Overview) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-gray-50/50 border-gray-100">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Total Return</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className={`text-2xl font-bold ${Number(strategy.pnl_percent || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {Number(strategy.pnl_percent || 0).toFixed(2)}%
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-gray-50/50 border-gray-100">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Sharpe Ratio</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold text-gray-900">
                                {Number(strategy.sharpe_ratio || 0).toFixed(2)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-gray-50/50 border-gray-100">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Max Drawdown</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold text-red-600">
                                {Number(strategy.max_drawdown || 0).toFixed(2)}%
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-gray-50/50 border-gray-100">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Win Rate</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold text-gray-900">
                                {Number(strategy.win_rate || 0).toFixed(0)}%
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs for Details */}
                <Tabs defaultValue="history" className="space-y-6">
                    <TabsList className="bg-gray-50 border-b border-gray-200 p-0 h-auto w-full justify-start rounded-none">
                        <TabsTrigger
                            value="history"
                            className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none bg-transparent py-3 px-4 text-gray-600 font-medium transition-all"
                        >
                            <History size={16} className="mr-2" /> Execution History
                        </TabsTrigger>
                        <TabsTrigger
                            value="implementation"
                            className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none bg-transparent py-3 px-4 text-gray-600 font-medium transition-all"
                        >
                            <Code size={16} className="mr-2" /> Implementation
                        </TabsTrigger>
                        <TabsTrigger
                            value="parameters"
                            className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 rounded-none bg-transparent py-3 px-4 text-gray-600 font-medium transition-all"
                        >
                            <FileJson size={16} className="mr-2" /> Published Config
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
                                <Button variant="link" className="h-auto p-0 text-blue-600" onClick={() => router.push(`/strategies/${id}/edit`)}>
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
