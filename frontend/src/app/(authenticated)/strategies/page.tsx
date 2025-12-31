'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Plus, Lightbulb, ExternalLink, Play, Edit, Trash2, Info, LayoutGrid, List, Search, MoreVertical, TrendingUp, TrendingDown, Target, Zap, Filter, Beaker, FileCheck, Activity, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import CreateStrategyModal from '@/components/CreateStrategyModal';
import ExperimentsTab from './[id]/tabs/ExperimentsTab';
import RecommendationsTab from './RecommendationsTab';

interface Strategy {
    id: number;
    name: string;
    description: string;
    created_at: string;
    is_public: boolean;
    published_experiments?: any[];
    pnl_amount?: number;
    pnl_percent?: number;
    max_drawdown?: number;
    sharpe_ratio?: number;
    win_rate?: number;
}



export default function StrategiesPage() {
    const router = useRouter();

    // Core State
    // Core State
    const [activeTab, setActiveTab] = useState('my-strategies');

    // My Strategies State
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [loadingStrategies, setLoadingStrategies] = useState(false);
    const [strategiesError, setStrategiesError] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [mounted, setMounted] = useState(false);


    // Filtered My Strategies
    const filteredStrategies = strategies.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const fetchStrategies = async () => {
        setLoadingStrategies(true);
        try {
            const response = await api.get('/api/stocks/strategies/', {
                params: {
                    _t: Date.now(),
                    page_size: 100
                }
            });
            if (Array.isArray(response.data)) {
                setStrategies(response.data);
                setStrategiesError('');
            } else if (response.data && Array.isArray(response.data.results)) {
                setStrategies(response.data.results);
                setStrategiesError('');
            } else {
                setStrategies([]);
            }
        } catch (error: any) {
            setStrategiesError(`Failed to load strategies: ${error.message}`);
        } finally {
            setLoadingStrategies(false);
        }
    };


    // Initial Fetch
    useEffect(() => {
        setMounted(true);
        fetchStrategies();
    }, []);


    const handleCreateSuccess = () => fetchStrategies();

    const handleDelete = async (id: number, name: string) => {
        setTimeout(async () => {
            const confirmed = confirm(`Are you sure you want to delete "${name}"?`);
            if (!confirmed) return;
            try {
                await api.delete(`/api/stocks/strategies/${id}/`);
                alert('Strategy deleted successfully');
                fetchStrategies();
            } catch (err: any) {
                alert(`Failed to delete strategy: ${err.message}`);
            }
        }, 150);
    };

    if (!mounted) return null;

    return (
        <DashboardLayout
            title="Strategy Center"
            subtitle="Automated market analysis and algorithmic trading strategies."
        >
            <div className="space-y-6">


                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-1">
                        <TabsList className="bg-transparent p-0 gap-6">
                            <TabsTrigger
                                value="my-strategies"
                                className="bg-transparent p-0 pb-3 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none text-gray-500 font-medium"
                            >
                                <Zap className="w-4 h-4 mr-2" />
                                All Strategies
                            </TabsTrigger>
                            <TabsTrigger
                                value="published"
                                className="bg-transparent p-0 pb-3 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none text-gray-500 font-medium"
                            >
                                <FileCheck className="w-4 h-4 mr-2" />
                                Published
                            </TabsTrigger>
                            <TabsTrigger
                                value="experiment-logs"
                                className="bg-transparent p-0 pb-3 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none text-gray-500 font-medium"
                            >
                                <Beaker className="w-4 h-4 mr-2" />
                                Experiment Logs
                            </TabsTrigger>

                            <TabsTrigger
                                value="recommendations"
                                className="bg-transparent p-0 pb-3 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none text-gray-500 font-medium"
                            >
                                <Target className="w-4 h-4 mr-2" />
                                Recommendations
                            </TabsTrigger>
                        </TabsList>

                        {/* Actions Area - Context aware */}
                        {activeTab === 'my-strategies' && (
                            <div className="flex gap-2">
                                <Button onClick={() => router.push('/strategies/compare')} variant="outline" size="sm" className="gap-2 border-purple-200 text-purple-600 hover:bg-purple-50">
                                    <GitCompare size={16} /> Compare
                                </Button>
                                <Button onClick={() => setIsCreateModalOpen(true)} size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
                                    <Plus size={16} /> Create Strategy
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Recommendations Content */}
                    <TabsContent value="recommendations" className="m-0">
                        <RecommendationsTab />
                    </TabsContent>

                    <TabsContent value="my-strategies" className="space-y-6 m-0">
                        {/* Search and Filter Bar */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                                <Input
                                    placeholder="Search your strategies..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 bg-white"
                                />
                            </div>
                            <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <LayoutGrid size={16} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <List size={16} />
                                </button>
                            </div>
                        </div>

                        {strategiesError && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
                                {strategiesError}
                            </div>
                        )}

                        {loadingStrategies ? (
                            <div className="p-8 text-center text-gray-500 animate-pulse">Loading your strategies...</div>
                        ) : strategies.length === 0 && !strategiesError ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                                <div className="mx-auto h-12 w-12 text-gray-300 mb-4">
                                    <Lightbulb size={48} />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900">No strategies yet</h3>
                                <p className="mt-1 text-gray-500">Get started by creating your first automated strategy.</p>
                                <div className="mt-6">
                                    <Button onClick={() => setIsCreateModalOpen(true)} variant="outline">
                                        Create Strategy
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            viewMode === 'grid' ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                    {filteredStrategies.map((strategy) => (
                                        <Card
                                            key={strategy.id}
                                            className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 border-slate-200/60 flex flex-col cursor-pointer bg-white"
                                            onClick={() => router.push(`/strategies/${strategy.id}`)}
                                        >
                                            {/* Header Accent */}
                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />

                                            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50/50">
                                                <div className="flex items-start gap-4">
                                                    <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0 shadow-sm border border-blue-100/50 group-hover:scale-110 transition-transform duration-300">
                                                        <Lightbulb size={20} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <div className="flex flex-col gap-1.5 min-w-0">
                                                                <h3 className="text-base font-bold text-slate-900 leading-tight truncate group-hover:text-blue-600 transition-colors">
                                                                    {strategy.name}
                                                                </h3>
                                                                {strategy.published_experiments && strategy.published_experiments.length > 0 && (
                                                                    <div className="flex">
                                                                        <Badge className="bg-emerald-50 hover:bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold border-emerald-100/50 shadow-none">
                                                                            <Activity size={10} className="mr-1" />
                                                                            Published ({strategy.published_experiments.length})
                                                                        </Badge>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <button
                                                                        className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all flex-shrink-0"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <MoreVertical size={16} />
                                                                    </button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="rounded-xl border-slate-200 shadow-lg">
                                                                    <DropdownMenuItem
                                                                        onSelect={() => handleDelete(strategy.id, strategy.name)}
                                                                        className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer rounded-lg m-1"
                                                                    >
                                                                        <Trash2 size={14} className="mr-2" />
                                                                        Delete Strategy
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="px-4 py-3 flex-1 bg-white">
                                                <p className="text-[12px] text-slate-500 leading-relaxed font-medium">
                                                    {strategy.description}
                                                </p>
                                            </div>

                                            <div className="flex bg-slate-50/80 border-t border-slate-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/strategies/${strategy.id}/run`);
                                                    }}
                                                    className="flex-1 py-3.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-white transition-all active:scale-95 border-r border-slate-100"
                                                >
                                                    <Play size={14} fill="currentColor" className="text-blue-500" /> Run
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/strategies/${strategy.id}/edit`);
                                                    }}
                                                    className="flex-1 py-3.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-600 hover:bg-white transition-all active:scale-95"
                                                >
                                                    <Edit size={14} className="text-emerald-500" /> Edit
                                                </button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                                <tr>
                                                    <th className="px-4 py-3">Strategy Name</th>

                                                    <th className="px-4 py-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {filteredStrategies.map((strategy) => (
                                                    <tr
                                                        key={strategy.id}
                                                        className="hover:bg-gray-50 group cursor-pointer"
                                                        onClick={() => router.push(`/strategies/${strategy.id}`)}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                                                                    <Lightbulb size={16} />
                                                                </div>
                                                                <div>
                                                                    <div className="font-semibold text-gray-900 hover:text-blue-600 hover:underline block">
                                                                        {strategy.name}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{strategy.description}</div>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-blue-600"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push(`/strategies/${strategy.id}/run`);
                                                                    }}
                                                                >
                                                                    <Play size={14} />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-green-600"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push(`/strategies/${strategy.id}/edit`);
                                                                    }}
                                                                >
                                                                    <Edit size={14} />
                                                                </Button>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-gray-600"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <MoreVertical size={14} />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem
                                                                            onSelect={() => handleDelete(strategy.id, strategy.name)}
                                                                            className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                                                                        >
                                                                            <Trash2 size={14} className="mr-2" />
                                                                            Delete Strategy
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )
                        )}
                        <CreateStrategyModal
                            isOpen={isCreateModalOpen}
                            onClose={() => setIsCreateModalOpen(false)}
                            onSuccess={handleCreateSuccess}
                        />
                    </TabsContent>

                    <TabsContent value="published" className="m-0">
                        <Card className="border-gray-200 shadow-sm">
                            <CardHeader>
                                <CardTitle>Published Strategies</CardTitle>
                                <CardDescription>All active configurations used for generating market recommendations</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loadingStrategies ? (
                                    <div className="p-8 text-center text-gray-500 animate-pulse">Loading published strategies...</div>
                                ) : strategies.filter(s => s.published_experiments && s.published_experiments.length > 0).length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Strategy</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Scope</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Config ID</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Return</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sharpe</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Win Rate</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Published</th>
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {strategies
                                                    .filter(s => s.published_experiments && s.published_experiments.length > 0)
                                                    .flatMap((strategy) =>
                                                        strategy.published_experiments?.map((exp: any) => (
                                                            <tr key={`${strategy.id}-${exp.id}`} className="hover:bg-gray-50 transition-colors">
                                                                <td className="px-4 py-3">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-gray-900">{strategy.name}</span>
                                                                        <span className="text-xs text-gray-500 truncate max-w-xs">{strategy.description}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={
                                                                            exp.scope_type === 'ALL' ? 'bg-purple-50 text-purple-700 border-purple-200 font-semibold' :
                                                                                exp.scope_type === 'SECTOR' ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold' :
                                                                                    'bg-green-50 text-green-700 border-green-200 font-semibold'
                                                                        }
                                                                    >
                                                                        {exp.scope_type === 'ALL' ? '🌐 ALL MARKET' :
                                                                            exp.scope_type === 'SECTOR' ? `📊 ${exp.scope_value}` :
                                                                                `📈 ${exp.scope_value}`}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <span className="text-xs font-mono text-gray-500">#{exp.id}</span>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {exp.metrics?.pnl_percent !== undefined ? (
                                                                        <span className={`font-semibold ${exp.metrics.pnl_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                            {exp.metrics.pnl_percent.toFixed(2)}%
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-400">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {exp.metrics?.sharpe_ratio !== undefined ? (
                                                                        <span className="font-semibold text-gray-900">
                                                                            {exp.metrics.sharpe_ratio.toFixed(2)}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-400">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {exp.metrics?.win_rate !== undefined ? (
                                                                        <span className="font-semibold text-gray-900">
                                                                            {exp.metrics.win_rate.toFixed(0)}%
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-400">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <span className="text-xs text-gray-500">
                                                                        {new Date(exp.created_at).toLocaleDateString()}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => router.push(`/strategies/${strategy.id}`)}
                                                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                    >
                                                                        View
                                                                    </Button>
                                                                </td>
                                                            </tr>
                                                        )) || []
                                                    )
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <FileCheck className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                        <p className="text-gray-500 font-medium mb-1">No Published Strategies</p>
                                        <p className="text-sm text-gray-400">Publish a strategy from the Experiment Logs to see it here.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="experiment-logs" className="m-0">
                        <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm p-0">
                            <ExperimentsTab />
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout >
    );
}
