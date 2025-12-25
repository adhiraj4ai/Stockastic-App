'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Plus, Lightbulb, ExternalLink, Play, Edit, Trash2, Info, LayoutGrid, List, Search, MoreVertical, TrendingUp, TrendingDown, Target, Zap, Filter, Beaker } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface Strategy {
    id: number;
    name: string;
    description: string;
    created_at: string;
    is_public: boolean;
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
                params: { _t: Date.now() }
            });
            if (Array.isArray(response.data)) {
                setStrategies(response.data);
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
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Strategy Center</h1>
                    <p className="text-gray-500 text-sm mt-1">Automated market analysis and algorithmic trading strategies.</p>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-1">
                        <TabsList className="bg-transparent p-0 gap-6">
                            <TabsTrigger
                                value="my-strategies"
                                className="bg-transparent p-0 pb-3 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none text-gray-500 font-medium"
                            >
                                <Zap className="w-4 h-4 mr-2" />
                                My Strategies
                            </TabsTrigger>
                            <TabsTrigger
                                value="experiment-logs"
                                className="bg-transparent p-0 pb-3 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:shadow-none text-gray-500 font-medium"
                            >
                                <Beaker className="w-4 h-4 mr-2" />
                                Experiment Logs
                            </TabsTrigger>
                        </TabsList>

                        {/* Actions Area - Context aware */}
                        {activeTab === 'my-strategies' && (
                            <Button onClick={() => setIsCreateModalOpen(true)} size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
                                <Plus size={16} /> Create Strategy
                            </Button>
                        )}
                    </div>


                    {/* MY STRATEGIES TAB */}
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
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {filteredStrategies.map((strategy) => (
                                        <Card key={strategy.id} className="hover:shadow-md transition-shadow duration-200 border-gray-200 flex flex-col">
                                            <div className="p-2 border-b border-gray-100 bg-white rounded-t-xl">
                                                <div className="flex items-start gap-2.5">
                                                    <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0 mt-0.5">
                                                        <Lightbulb size={16} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className="text-[15px] font-bold text-gray-900 leading-none truncate">{strategy.name}</span>
                                                                {strategy.is_public && (
                                                                    <span className="bg-green-50 text-green-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                                                                        Public
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <button className="h-6 w-6 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700 flex-shrink-0">
                                                                        <MoreVertical size={14} />
                                                                    </button>
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
                                                        <p className="text-[11px] text-gray-500 line-clamp-2 leading-tight">
                                                            {strategy.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-2 flex-1">
                                                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <span className="text-[11px] text-gray-500 font-medium min-w-[36px] text-right">Profit/Loss:</span>
                                                        <span className={`text-[13px] font-bold ${Number(strategy.pnl_amount || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                            {Number(strategy.pnl_percent || 0).toFixed(2)}%
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <span className="text-[11px] text-gray-500 font-medium min-w-[36px] text-right">Drawdown:</span>
                                                        <span className="text-[13px] font-bold text-red-600">{Number(strategy.max_drawdown || 0).toFixed(2)}%</span>
                                                    </div>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <span className="text-[11px] text-gray-500 font-medium min-w-[36px] text-right">Sharpe:</span>
                                                        <span className="text-[13px] font-bold text-gray-900">{Number(strategy.sharpe_ratio || 0).toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <span className="text-[11px] text-gray-500 font-medium min-w-[36px] text-right">Win:</span>
                                                        <span className="text-[13px] font-bold text-gray-900">{Number(strategy.win_rate || 0).toFixed(0)}%</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex bg-gray-50/50 border-t border-gray-100 rounded-b-xl mt-auto">
                                                <button
                                                    onClick={() => router.push(`/strategies/${strategy.id}/run`)}
                                                    className="flex-1 py-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-blue-600 hover:bg-white transition-colors"
                                                >
                                                    <Play size={14} /> Run
                                                </button>
                                                <div className="w-px bg-gray-200 my-1"></div>
                                                <button
                                                    onClick={() => router.push(`/strategies/${strategy.id}/edit`)}
                                                    className="flex-1 py-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-green-600 hover:bg-white transition-colors"
                                                >
                                                    <Edit size={14} /> Edit
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
                                                    <th className="px-4 py-3">P/L %</th>
                                                    <th className="px-4 py-3">Drawdown</th>
                                                    <th className="px-4 py-3">Sharpe</th>
                                                    <th className="px-4 py-3">Win Rate</th>
                                                    <th className="px-4 py-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {filteredStrategies.map((strategy) => (
                                                    <tr key={strategy.id} className="hover:bg-gray-50 group">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                                                                    <Lightbulb size={16} />
                                                                </div>
                                                                <div>
                                                                    <div className="font-semibold text-gray-900">{strategy.name}</div>
                                                                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{strategy.description}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`font-bold ${Number(strategy.pnl_amount || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                                {Number(strategy.pnl_percent || 0).toFixed(2)}%
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-red-600">{Number(strategy.max_drawdown || 0).toFixed(2)}%</td>
                                                        <td className="px-4 py-3">{Number(strategy.sharpe_ratio || 0).toFixed(2)}</td>
                                                        <td className="px-4 py-3">{Number(strategy.win_rate || 0).toFixed(0)}%</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-blue-600"
                                                                    onClick={() => router.push(`/strategies/${strategy.id}/run`)}
                                                                >
                                                                    <Play size={14} />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-green-600"
                                                                    onClick={() => router.push(`/strategies/${strategy.id}/edit`)}
                                                                >
                                                                    <Edit size={14} />
                                                                </Button>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-gray-600"
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
                    <TabsContent value="experiment-logs" className="m-0">
                        <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm p-0">
                            <ExperimentsTab />
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
