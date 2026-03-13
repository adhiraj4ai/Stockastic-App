import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { Loader2, Target, TrendingDown, TrendingUp, Shield, BarChart3, Save, X, Info, AlertTriangle, BookOpen, Quote, Zap, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import TransactionModal from './TransactionModal';

interface ExitStrategyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    portfolioItem: any;
    onSave: () => void;
    accounts: any[];
}

interface StrategyOption {
    name: string;
    sl: number;
    tp: number;
    tp2?: number;
    tp3?: number;
    desc: string;
}

interface HealthWarning {
    type: string;
    message: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export function ExitStrategyDialog({ open, onOpenChange, portfolioItem, onSave, accounts }: ExitStrategyDialogProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [strategies, setStrategies] = useState<Record<string, StrategyOption>>({});
    const [healthWarnings, setHealthWarnings] = useState<HealthWarning[]>([]);

    // Form State
    const [sl, setSl] = useState<string>('');
    const [tp, setTp] = useState<string>('');
    const [tp2, setTp2] = useState<string>('');
    const [tp3, setTp3] = useState<string>('');
    const [thesis, setThesis] = useState<string>('');
    const [selectedStrategy, setSelectedStrategy] = useState<string>('MANUAL');
    const [currentPrice, setCurrentPrice] = useState<number>(0);
    const [wacc, setWacc] = useState<number>(0);
    const [isUnderwater, setIsUnderwater] = useState<boolean>(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [transactionToEdit, setTransactionToEdit] = useState<any>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (!open || !portfolioItem) return;
            setLoading(true);
            try {
                const res = await api.get(`/api/stocks/portfolio/${portfolioItem.id}/suggest_exits/`);
                setStrategies(res.data.strategies);
                setHealthWarnings(res.data.health_warnings || []);
                setCurrentPrice(res.data.current_price);
                setWacc(res.data.wacc);
                setIsUnderwater(res.data.is_underwater);
                setTransactions(res.data.transactions || []);

                // Load existing values
                setSl(portfolioItem.stop_loss_price?.toString() || '');
                setTp(portfolioItem.target_price?.toString() || '');
                setTp2(portfolioItem.target_price_2?.toString() || '');
                setTp3(portfolioItem.target_price_3?.toString() || '');
                setThesis(portfolioItem.thesis || '');
                setSelectedStrategy(portfolioItem.strategy_type || 'MANUAL');

                // If no existing SL, use fixed default
                if (!portfolioItem.stop_loss_price && res.data.strategies['fixed']) {
                    const def = res.data.strategies['fixed'];
                    setSl(def.sl.toFixed(2));
                    setTp(def.tp.toFixed(2));
                    setTp2(def.tp2 ? def.tp2.toFixed(2) : '');
                    setTp3(def.tp3 ? def.tp3.toFixed(2) : '');
                    setSelectedStrategy('fixed');
                }
            } catch (error) {
                console.error("Failed to fetch exit suggestions", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [open, portfolioItem, refreshTrigger]);

    const handleDeleteTransaction = async (id: number) => {
        if (!confirm('Are you sure you want to delete this transaction?')) return;
        try {
            await api.delete(`/api/stocks/transactions/${id}/`);
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error("Failed to delete transaction", error);
            alert("Failed to delete transaction");
        }
    };

    const handleApplyStrategy = (key: string) => {
        const s = strategies[key];
        if (s) {
            setSl(s.sl.toFixed(2));
            setTp(s.tp.toFixed(2));
            setTp2(s.tp2 ? s.tp2.toFixed(2) : '');
            setTp3(s.tp3 ? s.tp3.toFixed(2) : '');
            setSelectedStrategy(key);
        }
    };

    const handleSave = async () => {
        if (!portfolioItem) return;
        setSaving(true);
        try {
            await api.patch(`/api/stocks/portfolio/${portfolioItem.id}/`, {
                stop_loss_price: sl ? parseFloat(sl) : null,
                target_price: tp ? parseFloat(tp) : null,
                target_price_2: tp2 ? parseFloat(tp2) : null,
                target_price_3: tp3 ? parseFloat(tp3) : null,
                thesis: thesis,
                strategy_type: selectedStrategy
            });
            onSave();
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save exit strategy", error);
        } finally {
            setSaving(false);
        }
    };

    const calculateRiskReward = () => {
        const slNum = parseFloat(sl);
        const tpNum = parseFloat(tp);
        if (!slNum || !tpNum || !currentPrice) return null;
        const risk = currentPrice - slNum;
        const reward = tpNum - currentPrice;
        if (risk <= 0) return "Invalid SL";
        return `1:${(reward / risk).toFixed(2)}`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false} className="w-[90vw] h-[90vh] max-w-none sm:max-w-none p-0 overflow-hidden border-none bg-transparent shadow-none font-sans">
                <div className="flex flex-col bg-white dark:bg-slate-900 h-full rounded-[2rem] shadow-2xl overflow-hidden">
                    {/* Header Section */}
                    <div className="bg-slate-50/50 dark:bg-slate-800/50 p-5 px-6 border-b border-gray-100/80 dark:border-slate-700/80">
                        <DialogHeader>
                            <div className="flex items-center justify-between w-full relative">
                                {/* Left: Title & Badge */}
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-blue-600 dark:bg-blue-500 rounded-xl text-white shadow-lg shadow-blue-500/20">
                                        <Target className="h-5 w-5" />
                                    </div>
                                    <div className="flex flex-col items-start gap-1">
                                        <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                            Exit Strategy: {portfolioItem?.ticker}
                                        </DialogTitle>
                                        {isUnderwater ? (
                                            <Badge className="bg-red-600 text-white border-none text-[10px] px-2 py-0.5 font-bold animate-pulse">
                                                UNDERWATER
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/30 text-[10px]">STRATEGIC VIEW</Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Center: Metrics */}
                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center gap-8">
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">LTP</span>
                                        <span className="text-xl font-black text-blue-600 dark:text-blue-400">Rs. {currentPrice}</span>
                                    </div>
                                    <div className="w-[1px] h-8 bg-slate-200 dark:bg-slate-700" />
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">WACC</span>
                                        <span className="text-xl font-black text-slate-800 dark:text-slate-200">Rs. {wacc}</span>
                                    </div>
                                    <div className="w-[1px] h-8 bg-slate-200 dark:bg-slate-700" />
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">QTY</span>
                                        <span className="text-xl font-black text-slate-900 dark:text-slate-100">{portfolioItem?.quantity}</span>
                                    </div>
                                </div>

                                {/* Right: Close */}
                                <button
                                    onClick={() => onOpenChange(false)}
                                    className="p-2 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-full transition-colors text-slate-400 dark:text-slate-500"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </DialogHeader>
                    </div>

                    <div className="p-5 pt-2 space-y-4 bg-white dark:bg-slate-900 flex-1 overflow-y-auto no-scrollbar">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                                <span className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-widest">Architecting Exit Scenarios...</span>
                            </div>
                        ) : (
                            <>
                                {/* Transaction History Section */}
                                {transactions.length > 0 && (
                                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500">
                                        <div
                                            className="bg-slate-50/50 dark:bg-slate-800/50 px-6 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Stock Transaction History</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline" className="text-[10px] font-bold border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800">
                                                    {transactions.length} ENTRIES
                                                </Badge>
                                                {isHistoryOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                                            </div>
                                        </div>

                                        {isHistoryOpen && (
                                            <div className="overflow-x-auto overflow-y-auto max-h-[220px] scrollbar-thin scrollbar-thumb-slate-200 border-t border-slate-100 dark:border-slate-700">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter sticky top-0 z-10">
                                                        <tr>
                                                            <th className="px-4 py-2">Date</th>
                                                            <th className="px-4 py-2">Type</th>
                                                            <th className="px-4 py-2 text-right">Quantity</th>
                                                            <th className="px-4 py-2 text-right">Rate</th>
                                                            <th className="px-4 py-2 text-right">Total</th>
                                                            <th className="px-4 py-2"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                                        {[...transactions].sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()).map((t, i) => (
                                                            <tr key={i} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0">
                                                                <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 tabular-nums">
                                                                    {new Date(t.transaction_date).toLocaleDateString()}
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <span className={`font-black px-2 py-0.5 rounded text-[10px] ${t.transaction_type === 'BUY' ? 'bg-green-50 text-green-600' :
                                                                        t.transaction_type === 'SELL' ? 'bg-red-50 text-red-600' :
                                                                            'bg-blue-50 text-blue-600'
                                                                        }`}>
                                                                        {t.transaction_type}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-right font-bold text-gray-700 dark:text-slate-300 tabular-nums">{t.quantity}</td>
                                                                <td className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-slate-400 tabular-nums">{t.rate}</td>
                                                                <td className="px-4 py-2.5 text-right font-black text-gray-900 dark:text-slate-100 tabular-nums">
                                                                    Rs. {parseFloat(t.amount).toLocaleString()}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-right">
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <button
                                                                            onClick={() => setTransactionToEdit(t)}
                                                                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                            title="Edit Transaction"
                                                                        >
                                                                            <Pencil className="h-3.5 w-3.5" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteTransaction(t.id)}
                                                                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                            title="Delete Transaction"
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Main Plan Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                    {/* Left: Strategies */}
                                    <div className="lg:col-span-12 space-y-4">
                                        {healthWarnings.length > 0 && (
                                            <div className="space-y-2">
                                                {healthWarnings.map((w, i) => (
                                                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${w.severity === 'MEDIUM' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-400' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400'}`}>
                                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                                        <div className="text-xs">
                                                            <span className="font-bold uppercase mr-2 tracking-wider">Health Warning:</span>
                                                            {w.message}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="h-4 w-1 bg-blue-500 dark:bg-blue-400 rounded-full" />
                                                <Label className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Suggested AI Game Plans</Label>
                                            </div>
                                            <div className="flex flex-row gap-3">
                                                {Object.entries(strategies).map(([key, option]) => (
                                                    <div
                                                        key={key}
                                                        onClick={() => handleApplyStrategy(key)}
                                                        className={`flex-1 p-3 border-2 rounded-xl cursor-pointer transition-all duration-300 group relative min-w-0
                                                        ${selectedStrategy === key
                                                                ? 'border-blue-500 dark:border-blue-400 bg-blue-50/30 dark:bg-blue-900/30'
                                                                : 'bg-white dark:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-slate-100 dark:border-slate-700'}`}
                                                    >
                                                        {selectedStrategy === key && (
                                                            <div className="absolute top-[-8px] left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                                                Active
                                                            </div>
                                                        )}
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className={`font-bold text-xs uppercase tracking-tight ${selectedStrategy === key ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                                                {option.name}
                                                            </span>
                                                            {key === 'atr_conservative' && <Shield className="h-3.5 w-3.5 text-blue-600" />}
                                                            {key === 'swing' && <BarChart3 className="h-3.5 w-3.5 text-purple-600" />}
                                                            {key === 'fixed' && <Target className="h-3.5 w-3.5 text-green-600" />}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold mb-3">
                                                            <div className="bg-red-50 text-red-600 px-2 py-1 rounded-lg text-center border border-red-100/50">
                                                                SL {option.sl.toFixed(0)}
                                                            </div>
                                                            <div className="bg-green-50 text-green-600 px-2 py-1 rounded-lg text-center border border-green-100/50">
                                                                TP {option.tp.toFixed(0)}
                                                            </div>
                                                        </div>
                                                        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 font-medium group-hover:text-slate-500 dark:group-hover:text-slate-400 line-clamp-2">
                                                            {option.desc}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle: Inputs */}
                                    <div className="lg:col-span-7 space-y-4">
                                        <div className="p-5 bg-slate-50/40 dark:bg-slate-800/40 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm space-y-4">
                                            <div className="flex items-center gap-2">
                                                <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400 fill-blue-600 dark:fill-blue-400" />
                                                <Label className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 block">Execution Parameters</Label>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tighter">Target 1 (Primary)</Label>
                                                    <div className="relative group">
                                                        <TrendingUp className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500 group-hover:scale-110 transition-transform" />
                                                        <Input
                                                            type="number"
                                                            value={tp}
                                                            onChange={(e) => { setTp(e.target.value); setSelectedStrategy('MANUAL'); }}
                                                            placeholder="Price"
                                                            className="pl-9 text-sm font-bold h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm focus-visible:ring-blue-500/20"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] text-slate-400 font-bold uppercase tracking-tighter">Target 2</Label>
                                                    <div className="relative opacity-80 hover:opacity-100 transition-opacity">
                                                        <TrendingUp className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-400" />
                                                        <Input
                                                            type="number"
                                                            value={tp2}
                                                            onChange={(e) => { setTp2(e.target.value); setSelectedStrategy('MANUAL'); }}
                                                            placeholder="Scale Out"
                                                            className="pl-9 text-sm font-bold h-10 bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700 rounded-xl shadow-sm italic placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[11px] text-slate-400 font-bold uppercase tracking-tighter">Target 3</Label>
                                                    <div className="relative opacity-60 hover:opacity-100 transition-opacity">
                                                        <TrendingUp className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-300" />
                                                        <Input
                                                            type="number"
                                                            value={tp3}
                                                            onChange={(e) => { setTp3(e.target.value); setSelectedStrategy('MANUAL'); }}
                                                            placeholder="Moonbag"
                                                            className="pl-9 text-sm font-bold h-10 bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700 rounded-xl shadow-sm italic placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <Label className="text-[11px] text-red-500 dark:text-red-400 font-bold uppercase tracking-[0.2em]">Master Stop Loss</Label>
                                                        <Badge className="bg-red-50 text-red-600 border-red-100 text-[10px] font-bold">HARD STOP</Badge>
                                                    </div>
                                                    <div className="relative">
                                                        <TrendingDown className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                                                        <Input
                                                            type="number"
                                                            value={sl}
                                                            onChange={(e) => { setSl(e.target.value); setSelectedStrategy('MANUAL'); }}
                                                            className="pl-11 font-bold text-red-600 dark:text-red-400 h-12 text-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-xl shadow-lg focus-visible:ring-red-500/20"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Thesis */}
                                    <div className="lg:col-span-5 space-y-4">
                                        <div className="p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Quote className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                                                <Label className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Trade Thesis</Label>
                                            </div>
                                            <Textarea
                                                placeholder="Document your rationale for this exit plan..."
                                                className="flex-grow text-xs resize-none bg-slate-50/30 dark:bg-slate-900/30 border-slate-100 dark:border-slate-700 italic leading-relaxed rounded-2xl p-4 focus-visible:ring-slate-200 dark:focus-visible:ring-slate-700 h-[100px]"
                                                value={thesis}
                                                onChange={(e) => setThesis(e.target.value)}
                                            />
                                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Risk/Reward</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <BarChart3 className="h-4 w-4 text-blue-600" />
                                                        <span className="text-lg font-bold text-blue-700 dark:text-blue-400">{calculateRiskReward() || 'N/A'}</span>
                                                    </div>
                                                </div>
                                                <div className="p-2 bg-blue-50 rounded-xl">
                                                    <Info className="h-4 w-4 text-blue-500" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="bg-slate-50/80 dark:bg-slate-800/80 p-3 px-8 border-t border-slate-100 dark:border-slate-700 flex justify-end items-center gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="font-bold text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 px-6 uppercase tracking-widest text-[10px] h-9 rounded-lg"
                        >
                            Discard Changes
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-6 h-9 rounded-lg font-bold shadow-md shadow-blue-500/10 transition-all hover:scale-[1.01] active:scale-[0.99]"
                        >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                            <span className="uppercase tracking-widest text-[10px]">Commit Strategy</span>
                        </Button>
                    </div>
                </div>
            </DialogContent>
            {transactionToEdit && (
                <TransactionModal
                    isOpen={!!transactionToEdit}
                    onClose={() => setTransactionToEdit(null)}
                    onSuccess={() => {
                        setTransactionToEdit(null);
                        setRefreshTrigger(prev => prev + 1);
                    }}
                    transactionToEdit={transactionToEdit}
                    accounts={accounts}
                />
            )}
        </Dialog>
    );
}
