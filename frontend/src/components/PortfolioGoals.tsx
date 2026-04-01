'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Target, TrendingUp, TrendingDown, Edit2, Plus, PieChart, Info, Save, X, Trash2 } from 'lucide-react';
import { formatRupees } from '@/lib/formatters';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface AllocationMetric {
    category: string;
    current_value: number;
    current_percentage: number;
    target_percentage: number;
    deviation_percentage: number;
    recommended_action: 'TRIM' | 'INCREASE' | 'HOLD';
}

interface TargetItem {
    id?: number;
    target_type: 'SECTOR' | 'TAG';
    category_name: string;
    target_percentage: number;
}

export function PortfolioGoals({ selectedAccount }: { selectedAccount: string }) {
    const [metrics, setMetrics] = useState<{ sector_metrics: AllocationMetric[], tag_metrics: AllocationMetric[], total_value: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'SECTOR' | 'TAG'>('SECTOR');
    const [isManageOpen, setIsManageOpen] = useState(false);
    const [existingTargets, setExistingTargets] = useState<TargetItem[]>([]);
    const [newTarget, setNewTarget] = useState<Partial<TargetItem>>({ target_type: 'SECTOR', category_name: '', target_percentage: 0 });

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/stocks/portfolio/rebalancing_metrics/', {
                params: { account: selectedAccount }
            });
            setMetrics(res.data);
            
            const targetRes = await api.get('/api/stocks/portfolio-targets/');
            setExistingTargets(targetRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedAccount, isManageOpen]);

    const handleSaveTarget = async () => {
        if (!newTarget.category_name || !newTarget.target_percentage) return;
        
        try {
            const payload = {
                ...newTarget,
                account: selectedAccount === 'all' ? null : selectedAccount,
                target_type: view
            };
            
            await api.post('/api/stocks/portfolio-targets/', payload);
            toast.success("Target saved successfully");
            setNewTarget({ target_type: view, category_name: '', target_percentage: 0 });
            const targetRes = await api.get('/api/stocks/portfolio-targets/');
            setExistingTargets(targetRes.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save target");
        }
    };

    const handleDeleteTarget = async (id: number) => {
        try {
            await api.delete(`/api/stocks/portfolio-targets/${id}/`);
            toast.success("Target removed");
            setExistingTargets(existingTargets.filter(t => t.id !== id));
        } catch (err) {
            console.error(err);
            toast.error("Failed to remove target");
        }
    };

    if (loading && !metrics) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500" /></div>;
    if (!metrics) return null;

    const currentMetrics = view === 'SECTOR' ? metrics.sector_metrics : metrics.tag_metrics;
    const viewTargets = existingTargets.filter(t => t.target_type === view);

    const chartData = currentMetrics.map(m => ({
        name: m.category,
        value: m.current_value
    }));

    const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

    return (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-50 dark:border-slate-800 py-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Target className="h-5 w-5 text-blue-500" />
                        Strategic Allocation Goals
                    </CardTitle>
                    <div className="flex items-center gap-4">
                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                            <button 
                                onClick={() => setView('SECTOR')}
                                className={`px-3 py-1.5 text-xs font-bold tracking-tight rounded-md transition-all ${view === 'SECTOR' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-500'}`}
                            >
                                Sectors
                            </button>
                            <button 
                                onClick={() => setView('TAG')}
                                className={`px-3 py-1.5 text-xs font-bold tracking-tight rounded-md transition-all ${view === 'TAG' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-500'}`}
                            >
                                Tags
                            </button>
                        </div>

                        <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
                            <DialogTrigger asChild>
                                <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all text-slate-500 hover:text-blue-600">
                                    <Settings className="h-5 w-5" />
                                </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <Edit2 className="h-4 w-4 text-blue-500" />
                                        Manage {view === 'SECTOR' ? 'Sector' : 'Tag'} Targets
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-6 mt-4">
                                    <div className="flex gap-2">
                                        <Input 
                                            placeholder={`New ${view === 'SECTOR' ? 'Sector' : 'Tag'} Name...`}
                                            value={newTarget.category_name}
                                            onChange={e => setNewTarget({...newTarget, category_name: e.target.value})}
                                            className="h-9 text-xs"
                                        />
                                        <Input 
                                            type="number" 
                                            placeholder="Target %"
                                            value={newTarget.target_percentage || ''}
                                            onChange={e => setNewTarget({...newTarget, target_percentage: Number(e.target.value)})}
                                            className="h-9 text-xs w-24"
                                        />
                                        <button 
                                            onClick={handleSaveTarget}
                                            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                        {viewTargets.map(t => (
                                            <div key={t.id} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tracking-tight">{t.category_name}</span>
                                                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-tight">Target: {t.target_percentage}%</span>
                                                </div>
                                                <button 
                                                    onClick={() => t.id && handleDeleteTarget(t.id)}
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        {viewTargets.length === 0 && (
                                            <div className="text-center py-6 text-slate-400 text-xs italic">
                                                No targets set for {view.toLowerCase()}s.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {currentMetrics.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 dark:bg-slate-900/10">
                         <PieChart className="h-10 w-10 text-slate-200 dark:text-slate-800 mb-3" />
                         <p className="text-sm font-medium text-slate-500 dark:text-slate-400 tracking-tight">No holdings found for {view.toLowerCase()}s.</p>
                         <p className="text-[10px] text-slate-400 mt-1 tracking-tight font-bold">Add some transactions to see metrics</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">
                        <div className="lg:col-span-2 p-6 flex flex-col items-center justify-center bg-slate-50/30 dark:bg-slate-900/10">
                            <div className="w-full h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RePieChart>
                                        <Pie
                                            data={chartData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            animationDuration={1000}
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <ReTooltip 
                                            contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '10px', fontWeight: 'bold' }}
                                            itemStyle={{ color: '#fff' }}
                                            formatter={(value: any) => [formatRupees(Number(value || 0)), 'Value']}
                                        />
                                    </RePieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="text-center mt-4">
                                <div className="text-[10px] font-medium text-slate-400 tracking-tight">Portfolio value</div>
                                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{formatRupees(metrics.total_value)}</div>
                            </div>
                        </div>

                        <div className="lg:col-span-3 p-6 max-h-[400px] overflow-y-auto">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white dark:bg-[#020617] py-1 z-10">
                                    <Info className="h-3.5 w-3.5 text-slate-400" />
                                    <span className="text-[10px] font-semibold text-slate-500 tracking-tight">Target vs current comparison</span>
                                </div>
                                
                                {currentMetrics.map((m, idx) => (
                                    <div key={m.category} className="group flex flex-col gap-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-900/50 transition-all">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">{m.category}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {m.target_percentage > 0 && m.recommended_action === 'INCREASE' && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800 text-[10px] font-semibold tracking-tight">Underweight</Badge>}
                                                {m.target_percentage > 0 && m.recommended_action === 'TRIM' && <Badge className="bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800 text-[10px] font-semibold tracking-tight">Overweight</Badge>}
                                                {m.target_percentage > 0 && m.recommended_action === 'HOLD' && <Badge className="bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-[10px] font-semibold tracking-tight">Neutral</Badge>}
                                                {m.target_percentage === 0 && <span className="text-[9px] font-medium text-slate-400 tracking-tighter">No target set</span>}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="flex justify-between text-[9px] font-medium text-slate-400 tracking-tight mb-1">
                                                    <span>Current</span>
                                                    <span className="text-slate-700 dark:text-slate-300 font-semibold">{m.current_percentage}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-slate-400 dark:bg-slate-600 transition-all duration-500"
                                                        style={{ width: `${m.current_percentage}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-[9px] font-medium text-slate-400 tracking-tight mb-1">
                                                    <span>Target</span>
                                                    <span className="text-blue-600 dark:text-blue-400 font-semibold">{m.target_percentage || 0}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-blue-500 dark:bg-blue-600 transition-all duration-500"
                                                        style={{ width: `${m.target_percentage || 0}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {m.target_percentage > 0 && Math.abs(m.deviation_percentage) > 0.01 && (
                                            <div className="text-[10px] font-medium text-slate-500 mt-1 tracking-tight">
                                                {m.deviation_percentage > 0 ? (
                                                    <span className="flex items-center gap-1">
                                                        <TrendingUp className="h-3 w-3 text-rose-500" />
                                                        Exceeds target by <span className="text-rose-600 font-bold">{Math.abs(m.deviation_percentage).toFixed(2)}%</span>
                                                        <span className="text-slate-400 mx-1">•</span>
                                                        Suggests <span className="text-slate-700 dark:text-slate-300">trim</span> approx.
                                                        <span className="font-bold text-slate-700 dark:text-slate-300">{formatRupees(Math.abs(m.deviation_percentage / 100 * metrics.total_value))}</span>
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <TrendingDown className="h-3 w-3 text-emerald-500" />
                                                        Short of target by <span className="text-emerald-600 font-bold">{Math.abs(m.deviation_percentage).toFixed(2)}%</span>
                                                        <span className="text-slate-400 mx-1">•</span>
                                                        Suggests <span className="text-slate-700 dark:text-slate-300">add</span> approx.
                                                        <span className="font-bold text-slate-700 dark:text-slate-300">{formatRupees(Math.abs(m.deviation_percentage / 100 * metrics.total_value))}</span>
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

const Settings = ({ className }: { className?: string }) => (
    <Target className={className} />
);
