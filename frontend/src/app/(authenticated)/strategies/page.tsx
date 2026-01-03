'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Plus, Lightbulb, ExternalLink, Play, Code, Trash2, Info, LayoutGrid, List, Search, MoreVertical, TrendingUp, TrendingDown, Target, Zap, Filter, Beaker, FileCheck, Activity, GitCompare, Shield, BarChart3, PieChart, Flame, Rocket, Cpu, Layers, Pencil, ArrowUpDown } from 'lucide-react';

const strategyIcons: Record<string, any> = {
    Lightbulb,
    TrendingUp,
    Zap,
    Target,
    Activity,
    Shield,
    BarChart3,
    PieChart,
    Flame,
    Rocket,
    Cpu,
    Layers
};

const iconColors = [
    { name: "Black", value: "#000000" },
    { name: "Blue", value: "#3B82F6" },
    { name: "Green", value: "#10B981" },
    { name: "Amber", value: "#F59E0B" },
    { name: "Red", value: "#EF4444" },
    { name: "Purple", value: "#8B5CF6" },
    { name: "Pink", value: "#EC4899" },
    { name: "Cyan", value: "#06B6D4" },
];
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
    icon?: string;
    icon_color?: string;
}



function StrategiesContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Core State
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'my-strategies');

    // Update active tab when URL changes
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', value);
        router.push(`${pathname}?${params.toString()}`);
    };

    // My Strategies State
    const [selectedIconColor, setSelectedIconColor] = useState("#000000");
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [loadingStrategies, setLoadingStrategies] = useState(false);
    const [strategiesError, setStrategiesError] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [mounted, setMounted] = useState(false);
    const [sortBy, setSortBy] = useState("created_date_desc");
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [renameStrategy, setRenameStrategy] = useState<Strategy | null>(null);
    const [newName, setNewName] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('Lightbulb');


    // Filtered and Sorted Strategies
    const filteredStrategies = strategies
        .filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            switch (sortBy) {
                case 'name_asc':
                    return a.name.localeCompare(b.name);
                case 'name_desc':
                    return b.name.localeCompare(a.name);
                case 'created_date_asc':
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                case 'created_date_desc':
                default:
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
        });

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

    const handleRenameClick = (strategy: Strategy) => {
        setRenameStrategy(strategy);
        setNewName(strategy.name);
        setSelectedIcon(strategy.icon || 'Lightbulb');
        setSelectedIconColor(strategy.icon_color || "#000000");
        setRenameDialogOpen(true);
    };

    const handleRenameSubmit = async () => {
        if (!renameStrategy || !newName.trim()) return;

        const payload = {
            name: newName.trim(),
            icon: selectedIcon,
            icon_color: selectedIconColor
        };

        console.log('Updating strategy with payload:', payload);

        try {
            const response = await api.patch(`/api/stocks/strategies/${renameStrategy.id}/`, payload);
            console.log('Update response:', response.data);
            setRenameDialogOpen(false);
            setRenameStrategy(null);
            setNewName('');
            setSelectedIcon('Lightbulb');
            setSelectedIconColor("#000000");
            fetchStrategies();
        } catch (err: any) {
            console.error('Failed to update strategy:', err);
            alert(`Failed to rename strategy: ${err.message}`);
        }
    };

    if (!mounted) return null;

    return (
        <DashboardLayout
            title="Strategy Center"
            subtitle="Automated market analysis and algorithmic trading strategies."
        >
            <div className="space-y-6">


                <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
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
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-2">
                                        <ArrowUpDown size={14} />
                                        Sort
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem
                                        onClick={() => setSortBy('created_date_desc')}
                                        className={sortBy === 'created_date_desc' ? 'bg-blue-50 text-blue-600' : ''}
                                    >
                                        Newest First
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSortBy('created_date_asc')}
                                        className={sortBy === 'created_date_asc' ? 'bg-blue-50 text-blue-600' : ''}
                                    >
                                        Oldest First
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSortBy('name_asc')}
                                        className={sortBy === 'name_asc' ? 'bg-blue-50 text-blue-600' : ''}
                                    >
                                        A → Z
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setSortBy('name_desc')}
                                        className={sortBy === 'name_desc' ? 'bg-blue-50 text-blue-600' : ''}
                                    >
                                        Z → A
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
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
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {filteredStrategies.map((strategy) => (
                                        <Card
                                            key={strategy.id}
                                            className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-slate-200 hover:border-blue-300 flex flex-col cursor-pointer bg-white rounded-xl"
                                            onClick={() => router.push(`/strategies/${strategy.id}`)}
                                        >
                                            {/* Gradient Top Border */}
                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400" />

                                            {/* Header */}
                                            <div className="p-4 border-b border-slate-100 bg-gradient-to-br from-blue-50/20 via-white to-purple-50/10">
                                                <div className="flex items-start gap-3">
                                                    <div className="h-11 w-11 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md group-hover:scale-105 transition-all duration-300" style={{ backgroundColor: strategy.icon_color || "#000000" }}>
                                                        {(() => {
                                                            const Icon = (strategy.icon && strategyIcons[strategy.icon]) || Lightbulb;
                                                            return <Icon size={20} />;
                                                        })()}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                                                <h3 className="text-base font-bold text-slate-900 leading-tight group-hover:text-blue-600 transition-colors">
                                                                    {strategy.name}
                                                                </h3>
                                                                <div className="flex gap-1.5 flex-wrap">
                                                                    {strategy.published_experiments && strategy.published_experiments.length > 0 && (
                                                                        <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">
                                                                            <Activity size={10} className="mr-1" />
                                                                            {strategy.published_experiments.length} Published
                                                                        </Badge>
                                                                    )}
                                                                    {/* Performance Badge */}
                                                                    {strategy.pnl_percent != null && strategy.pnl_percent !== 0 && (
                                                                        <Badge className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${strategy.pnl_percent >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                                            {strategy.pnl_percent >= 0 ? '📈' : '📉'} {Number(strategy.pnl_percent).toFixed(1)}%
                                                                        </Badge>
                                                                    )}
                                                                </div>
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
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleRenameClick(strategy);
                                                                        }}
                                                                        className="cursor-pointer rounded-lg m-1"
                                                                    >
                                                                        <Pencil size={14} className="mr-2" />
                                                                        Rename Strategy
                                                                    </DropdownMenuItem>
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

                                            {/* Description */}
                                            <div className="px-4 py-3 flex-1 bg-white">
                                                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                                                    {strategy.description}
                                                </p>
                                            </div>

                                            {/* Quick Stats */}
                                            {(strategy.sharpe_ratio != null || strategy.win_rate != null) && (
                                                <div className="px-4 py-2.5 bg-slate-50 border-y border-slate-100">
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {strategy.sharpe_ratio != null && (
                                                            <div className="text-center">
                                                                <div className="text-xs text-slate-500 font-medium mb-0.5">Sharpe</div>
                                                                <div className="text-sm font-bold text-slate-900">{Number(strategy.sharpe_ratio).toFixed(2)}</div>
                                                            </div>
                                                        )}
                                                        {strategy.win_rate != null && (
                                                            <div className="text-center">
                                                                <div className="text-xs text-slate-500 font-medium mb-0.5">Win Rate</div>
                                                                <div className="text-sm font-bold text-slate-900">{Number(strategy.win_rate).toFixed(0)}%</div>
                                                            </div>
                                                        )}
                                                        {strategy.max_drawdown != null && (
                                                            <div className="text-center">
                                                                <div className="text-xs text-slate-500 font-medium mb-0.5">Max DD</div>
                                                                <div className="text-sm font-bold text-red-600">{Number(strategy.max_drawdown).toFixed(1)}%</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            <div className="px-3 py-2 flex gap-2 bg-white border-t border-slate-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/strategies/${strategy.id}/backtest`);
                                                    }}
                                                    className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 transition-all active:scale-95 rounded-lg shadow-sm hover:shadow"
                                                >
                                                    <Play size={14} fill="currentColor" /> Run
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/strategies/${strategy.id}/optimize`);
                                                    }}
                                                    className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100 transition-all active:scale-95 rounded-lg"
                                                >
                                                    <Zap size={14} /> Optimize
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/strategies/${strategy.id}/editor`);
                                                    }}
                                                    className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-all active:scale-95 rounded-lg"
                                                >
                                                    <Code size={14} /> Edit
                                                </button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm flex flex-col max-h-[calc(100vh-320px)]">
                                    <div className="overflow-x-auto overflow-y-auto">
                                        <table className="w-full text-sm text-left border-collapse">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-slate-50 border-b border-slate-200">
                                                    <th className="px-6 py-4 text-sm font-bold text-slate-800">Strategy</th>
                                                    <th className="px-6 py-4 text-sm font-bold text-slate-800">Performance</th>
                                                    <th className="px-6 py-4 text-sm font-bold text-slate-800">Key Metrics</th>
                                                    <th className="px-6 py-4 text-sm font-bold text-slate-800">Created At</th>
                                                    <th className="px-6 py-4 text-sm font-bold text-slate-800 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filteredStrategies.map((strategy) => (
                                                    <tr
                                                        key={strategy.id}
                                                        className="hover:bg-blue-50/50 group cursor-pointer transition-colors duration-200"
                                                        onClick={() => router.push(`/strategies/${strategy.id}`)}
                                                    >
                                                        {/* Strategy Name & Info */}
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-4">
                                                                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm group-hover:scale-110 transition-transform" style={{ backgroundColor: strategy.icon_color || "#000000" }}>
                                                                    {(() => {
                                                                        const Icon = (strategy.icon && strategyIcons[strategy.icon]) || Lightbulb;
                                                                        return <Icon size={18} />;
                                                                    })()}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                                                                        {strategy.name}
                                                                    </div>
                                                                    <div className="text-[11px] text-slate-500 truncate max-w-[240px] font-medium leading-relaxed">
                                                                        {strategy.description}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Performance Badge */}
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col gap-1">
                                                                {strategy.pnl_percent != null && strategy.pnl_percent !== 0 ? (
                                                                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black ${strategy.pnl_percent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                        {strategy.pnl_percent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                                        {Number(strategy.pnl_percent).toFixed(1)}%
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-slate-300 font-bold uppercase text-[10px] tracking-widest pl-2">No Data</span>
                                                                )}
                                                                {strategy.published_experiments && strategy.published_experiments.length > 0 && (
                                                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest pl-1">
                                                                        {strategy.published_experiments.length} Active
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Metrics Grid */}
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-6">
                                                                {strategy.sharpe_ratio != null && (
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sharpe</span>
                                                                        <span className="text-xs font-bold text-slate-700">{Number(strategy.sharpe_ratio).toFixed(2)}</span>
                                                                    </div>
                                                                )}
                                                                {strategy.win_rate != null && (
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Win Rate</span>
                                                                        <span className="text-xs font-bold text-slate-700">{Number(strategy.win_rate).toFixed(0)}%</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Date */}
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-bold text-slate-600">
                                                                    {new Date(strategy.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-medium">
                                                                    {new Date(strategy.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* Actions */}
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-1 group-hover:opacity-100 transition-opacity">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-9 w-9 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push(`/strategies/${strategy.id}/backtest`);
                                                                    }}
                                                                    title="Run Backtest"
                                                                >
                                                                    <Play size={16} fill="currentColor" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-9 w-9 text-slate-400 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push(`/strategies/${strategy.id}/editor`);
                                                                    }}
                                                                    title="Open Editor"
                                                                >
                                                                    <Code size={16} />
                                                                </Button>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-9 w-9 text-slate-400 hover:text-slate-600 transition-all rounded-xl"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <MoreVertical size={16} />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end" className="rounded-xl border-slate-200 shadow-xl min-w-[160px]">
                                                                        <DropdownMenuItem
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                router.push(`/strategies/${strategy.id}/optimize`);
                                                                            }}
                                                                            className="cursor-pointer gap-2 font-bold text-xs uppercase tracking-wider p-2.5"
                                                                        >
                                                                            <Zap size={14} className="text-purple-600" />
                                                                            Optimize
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleRenameClick(strategy);
                                                                            }}
                                                                            className="cursor-pointer gap-2 font-bold text-xs uppercase tracking-wider p-2.5"
                                                                        >
                                                                            <Pencil size={14} className="text-blue-600" />
                                                                            Rename
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            onSelect={() => handleDelete(strategy.id, strategy.name)}
                                                                            className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer gap-2 font-bold text-xs uppercase tracking-wider p-2.5"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                            Delete
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

                        {/* Rename Dialog */}
                        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Edit Strategy</DialogTitle>
                                    <DialogDescription>
                                        Update the name and icon for "{renameStrategy?.name}"
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700">Strategy Name</label>
                                        <Input
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            placeholder="Strategy name"
                                            className="w-full"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleRenameSubmit();
                                                }
                                            }}
                                            autoFocus
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700">Icon</label>
                                        <div className="grid grid-cols-6 gap-2">
                                            {Object.keys(strategyIcons).map((iconName) => {
                                                const Icon = strategyIcons[iconName];
                                                const isSelected = selectedIcon === iconName;
                                                return (
                                                    <button
                                                        key={iconName}
                                                        type="button"
                                                        onClick={() => setSelectedIcon(iconName)}
                                                        className={`h-12 w-12 rounded-lg flex items-center justify-center transition-all ${isSelected
                                                            ? 'bg-gradient-to-br from-sky-400 to-blue-500 text-white shadow-md scale-110'
                                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-105'
                                                            }`}
                                                        title={iconName}
                                                    >
                                                        <Icon size={20} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700">Icon Color</label>
                                        <div className="grid grid-cols-8 gap-2">
                                            {iconColors.map((color) => {
                                                const isSelected = selectedIconColor === color.value;
                                                return (
                                                    <button
                                                        key={color.value}
                                                        type="button"
                                                        onClick={() => setSelectedIconColor(color.value)}
                                                        className={`h-10 w-10 rounded-lg flex items-center justify-center transition-all border-2 ${isSelected
                                                            ? "border-blue-500 scale-110 shadow-md"
                                                            : "border-slate-200 hover:border-slate-300 hover:scale-105"
                                                            }`}
                                                        style={{ backgroundColor: color.value }}
                                                        title={color.name}
                                                    >
                                                        {isSelected && (
                                                            <svg className="w-5 h-5" style={{ color: color.value === "#000000" ? "white" : "white" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button
                                        variant="outline"
                                        onClick={() => setRenameDialogOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleRenameSubmit}
                                        disabled={!newName.trim()}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        Rename
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
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

export default function StrategiesPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>}>
            <StrategiesContent />
        </Suspense>
    );
}
