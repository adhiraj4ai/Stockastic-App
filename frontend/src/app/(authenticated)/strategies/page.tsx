'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Plus, Lightbulb, ExternalLink, Play, Code, Trash2, Info, LayoutGrid, List, Search, MoreVertical, TrendingUp, TrendingDown, Target, Zap, Filter, Beaker, FileCheck, Activity, GitCompare, Shield, BarChart3, PieChart, Flame, Rocket, Cpu, Layers, Pencil, ArrowUpDown, Blocks } from 'lucide-react';
import { toast } from 'sonner';

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
import { FullPageLoader } from '@/components/ui/StockLoader';
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
import { StrategyLibrary } from './components/StrategyLibrary';
import ExperimentsTab from './[id]/tabs/ExperimentsTab';
import RecommendationsTab from './RecommendationsTab';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

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

    const handleUnpublish = async (strategyId: number, scopeValue: string, scopeType: string) => {
        if (!confirm(`Are you sure you want to unpublish the ${scopeType} strategy for ${scopeValue}?`)) return;

        try {
            await api.post(`/api/stocks/strategies/${strategyId}/unpublish_optimized/`, {
                scope_value: scopeValue,
                scope_type: scopeType
            });
            toast.success('Strategy unpublished');
            fetchStrategies(); // Refresh list
        } catch (error) {
            toast.error('Failed to unpublish strategy');
            console.error(error);
        }
    };

    if (!mounted) return null;

    return (
        <DashboardLayout
            title="Strategy Center"
            subtitle="Automated market analysis and algorithmic trading strategies."
            noPadding
        >
            <div className="space-y-0">


                <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-0">
                    <div className="sticky top-[73px] z-10 bg-white dark:bg-slate-950 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-2 px-8 transition-all mb-6 border-b dark:border-slate-800">
                        <TabsList className="bg-gray-200/50 dark:bg-slate-800/50 p-1 gap-1 rounded-lg h-auto">
                            <TabsTrigger
                                value="my-strategies"
                                className="px-4 py-2 rounded-md text-xs font-semibold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50"
                            >
                                <Zap className="w-4 h-4 mr-2" />
                                All Strategies
                                <InfoTooltip content="Collection of your custom algorithmic models and standard market analysis frameworks." />
                            </TabsTrigger>
                            <TabsTrigger
                                value="published"
                                className="px-4 py-2 rounded-md text-xs font-semibold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50"
                            >
                                <FileCheck className="w-4 h-4 mr-2" />
                                Published
                                <InfoTooltip content="Configurations currently deployed across specific sectors or the entire market." />
                            </TabsTrigger>
                            <TabsTrigger
                                value="experiment-logs"
                                className="px-4 py-2 rounded-md text-xs font-semibold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50"
                            >
                                <Beaker className="w-4 h-4 mr-2" />
                                Experiment Logs
                                <InfoTooltip content="Historical record of backtests, parameter tweaks, and strategy performance iterations." />
                            </TabsTrigger>

                            <TabsTrigger
                                value="recommendations"
                                className="px-4 py-2 rounded-md text-xs font-semibold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50"
                            >
                                <Target className="w-4 h-4 mr-2" />
                                Recommendations
                                <InfoTooltip content="Algorithmic signals and trade setups generated based on your published models." />
                            </TabsTrigger>
                        </TabsList>


                    </div>

                    {/* Recommendations Content */}
                    <TabsContent value="recommendations" className="m-0 px-8 pb-8">
                        <RecommendationsTab />
                    </TabsContent>

                    <TabsContent value="my-strategies" className="space-y-6 m-0 px-8 pb-8">
                        <StrategyLibrary strategies={strategies as any} onCreate={() => setIsCreateModalOpen(true)} />
                        <CreateStrategyModal
                            isOpen={isCreateModalOpen}
                            onClose={() => setIsCreateModalOpen(false)}
                            onSuccess={handleCreateSuccess}
                        />
                    </TabsContent>

                    <TabsContent value="published" className="m-0 px-8 pb-8">
                        <Card className="border-gray-200 dark:border-slate-800 shadow-sm bg-white dark:bg-card">
                            <CardHeader>
                                <CardTitle className="dark:text-slate-100">Published Strategies</CardTitle>
                                <CardDescription className="dark:text-slate-400">All active configurations used for generating market recommendations</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loadingStrategies ? (
                                    <div className="p-8 text-center text-gray-500 dark:text-slate-400 animate-pulse">Loading published strategies...</div>
                                ) : strategies.filter(s => s.published_experiments && s.published_experiments.length > 0).length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider">Strategy</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider">Scope</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider">Return</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider">Sharpe</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider">Win Rate</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider">Published</th>
                                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-slate-300 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-card divide-y divide-gray-100 dark:divide-slate-800">
                                                {strategies
                                                    .filter(s => s.published_experiments && s.published_experiments.length > 0)
                                                    .flatMap((strategy) =>
                                                        strategy.published_experiments?.map((exp: any) => (
                                                            <tr key={`${strategy.id}-${exp.id}`} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                                                                <td className="px-4 py-3">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-medium text-gray-900 dark:text-slate-100">{strategy.name}</span>
                                                                        <span className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-xs">{strategy.description}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={
                                                                            exp.scope_type === 'ALL' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800 font-semibold' :
                                                                                exp.scope_type === 'SECTOR' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 font-semibold' :
                                                                                    'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 font-semibold'
                                                                        }
                                                                    >
                                                                        {exp.scope_type === 'ALL' ? '🌐 ALL MARKET' :
                                                                            exp.scope_type === 'SECTOR' ? `📊 ${exp.scope_value}` :
                                                                                `📈 ${exp.scope_value}`}
                                                                    </Badge>
                                                                </td>

                                                                <td className="px-4 py-3">
                                                                    {(() => {
                                                                        const pnl = exp.metrics?.stats?.pnl_percent ?? exp.metrics?.stats?.return_pct ?? exp.metrics?.pnl_percent ?? null;
                                                                        if (pnl !== null && pnl !== undefined) {
                                                                            return (
                                                                                <span className={`font-semibold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                                    {Number(pnl).toFixed(2)}%
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return <span className="text-gray-400">-</span>;
                                                                    })()}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {(() => {
                                                                        const sharpe = exp.metrics?.stats?.sharpe_ratio ?? exp.metrics?.sharpe_ratio ?? null;
                                                                        if (sharpe !== null && sharpe !== undefined) {
                                                                            return (
                                                                                <span className="font-semibold text-gray-900">
                                                                                    {Number(sharpe).toFixed(2)}
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return <span className="text-gray-400">-</span>;
                                                                    })()}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {(() => {
                                                                        const winRate = exp.metrics?.stats?.win_rate ?? exp.metrics?.win_rate ?? null;
                                                                        if (winRate !== null && winRate !== undefined) {
                                                                            return (
                                                                                <span className="font-semibold text-gray-900">
                                                                                    {Number(winRate).toFixed(0)}%
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return <span className="text-gray-400">-</span>;
                                                                    })()}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <span className="text-xs text-gray-500">
                                                                        {new Date(exp.created_at).toLocaleDateString()}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                router.push(`/strategies/${strategy.id}/experiments/${exp.id}`);
                                                                            }}
                                                                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                        >
                                                                            View
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleUnpublish(strategy.id, exp.scope_value, exp.scope_type);
                                                                            }}
                                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                            title="Unpublish"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </Button>
                                                                    </div>
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

                    <TabsContent value="experiment-logs" className="m-0 px-8 pb-8">
                        <Card className="border-none shadow-sm bg-white/50 dark:bg-card p-0">
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
        <Suspense fallback={<FullPageLoader />}>
            <StrategiesContent />
        </Suspense>
    );
}
