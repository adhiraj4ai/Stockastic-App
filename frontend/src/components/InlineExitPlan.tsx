'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import api from '@/lib/api';
import { Loader2, Target, TrendingDown, TrendingUp, Shield, BarChart3, Save, X, Info, AlertTriangle, BookOpen, Quote } from 'lucide-react';

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

interface InlineExitPlanProps {
    portfolioItem: any;
    onSave: () => void;
    onClose: () => void;
}

export function InlineExitPlan({ portfolioItem, onSave, onClose }: InlineExitPlanProps) {
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

    useEffect(() => {
        const fetchData = async () => {
            if (!portfolioItem) return;
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
                if (!portfolioItem.stop_loss_price) {
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
    }, [portfolioItem]);

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

    const [success, setSuccess] = useState(false);

    const handleSave = async () => {
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
            setSuccess(true);
            onSave();
            setTimeout(() => {
                onClose();
            }, 1000);
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
        return (reward / risk).toFixed(2);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-2" />
                <span className="text-sm font-medium text-gray-500">Generating master exit plan for {portfolioItem.ticker}...</span>
            </div>
        );
    }

    return (
        <>
            {/* Transaction History Section (Separate Card) */}
            {transactions.length > 0 && (
                <div className="mb-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500">
                    <div className="bg-gray-50/80 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Stock Transaction History</span>
                        </div>
                        <span className="text-[9px] font-medium text-gray-400">{transactions.length} entries</span>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[150px]">
                        <table className="w-full text-[10px] text-left">
                            <thead className="bg-gray-50/50 text-gray-400 font-bold uppercase tracking-tighter sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-2">Date</th>
                                    <th className="px-4 py-2">Type</th>
                                    <th className="px-4 py-2 text-right">Quantity</th>
                                    <th className="px-4 py-2 text-right">Rate</th>
                                    <th className="px-4 py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {transactions.map((t, i) => (
                                    <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-4 py-2 text-gray-500 tabular-nums">
                                            {new Date(t.transaction_date).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className={`font-black px-1.5 py-0.5 rounded text-[9px] ${t.transaction_type === 'BUY' ? 'bg-green-50 text-green-600' :
                                                t.transaction_type === 'SELL' ? 'bg-red-50 text-red-600' :
                                                    'bg-blue-50 text-blue-600'
                                                }`}>
                                                {t.transaction_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-right font-bold text-gray-700 tabular-nums">{t.quantity}</td>
                                        <td className="px-4 py-2 text-right font-medium text-gray-600 tabular-nums">{t.rate}</td>
                                        <td className="px-4 py-2 text-right font-black text-gray-900 tabular-nums">
                                            Rs. {parseFloat(t.amount).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="bg-gradient-to-br from-white to-gray-50/30 p-6 rounded-xl border border-blue-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                {/* Health Warnings Banner */}
                {healthWarnings.length > 0 && (
                    <div className="mb-6 space-y-2">
                        {healthWarnings.map((w, i) => (
                            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${w.severity === 'MEDIUM' ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div className="text-xs">
                                    <span className="font-bold uppercase mr-2 tracking-wider">Health Warning:</span>
                                    {w.message}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shadow-sm">
                            <Target className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 tracking-tight">Advanced Portfolio Exit Plan</h3>
                            <div className="flex items-center gap-4">
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    Current Price: <span className="font-bold text-blue-600">Rs. {currentPrice}</span>
                                </p>
                                <div className="h-3 w-[1px] bg-gray-200" />
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    Cost Basis (WACC): <span className="font-bold text-gray-700">Rs. {wacc}</span>
                                </p>
                                {isUnderwater && (
                                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-[9px] font-black text-red-600 uppercase border border-red-100 animate-pulse">
                                        Underwater
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left: Strategies & Multi-Target */}
                    <div className="lg:col-span-7 space-y-6">
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 block">Suggested Game Plans</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {Object.entries(strategies).map(([key, option]) => (
                                    <div
                                        key={key}
                                        onClick={() => handleApplyStrategy(key)}
                                        className={`p-3 border rounded-xl cursor-pointer transition-all duration-200 group
                                        ${selectedStrategy === key
                                                ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/10'
                                                : 'bg-white hover:border-blue-200 hover:bg-white/80 border-gray-100 shadow-sm'}`}
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className={`font-bold text-sm ${selectedStrategy === key ? 'text-blue-700' : 'text-gray-700'}`}>
                                                {option.name}
                                            </span>
                                            {key === 'atr_conservative' && <Shield className="h-3.5 w-3.5 text-green-600" />}
                                            {key === 'swing' && <BarChart3 className="h-3.5 w-3.5 text-purple-600" />}
                                        </div>
                                        <div className="flex justify-between text-[10px] font-mono mb-1">
                                            <span className="text-red-500">SL: {option.sl.toFixed(1)}</span>
                                            <span className="text-green-600">TP: {option.tp.toFixed(1)}</span>
                                        </div>
                                        <p className="text-[10px] leading-tight text-gray-400 group-hover:text-gray-500">
                                            {option.desc}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-5 bg-blue-50/30 rounded-2xl border border-blue-100/50">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-4 block">Multi-Target Scaling (Partial Exits)</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] text-gray-500 font-bold">Target 1 (Primary)</Label>
                                    <div className="relative">
                                        <TrendingUp className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-green-500" />
                                        <Input
                                            value={tp}
                                            onChange={(e) => { setTp(e.target.value); setSelectedStrategy('MANUAL'); }}
                                            placeholder="Price"
                                            className="pl-8 text-sm font-mono font-bold h-9 bg-white"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] text-gray-500 font-bold">Target 2</Label>
                                    <div className="relative">
                                        <TrendingUp className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-green-400 opacity-70" />
                                        <Input
                                            value={tp2}
                                            onChange={(e) => { setTp2(e.target.value); setSelectedStrategy('MANUAL'); }}
                                            placeholder="Optional"
                                            className="pl-8 text-sm font-mono font-bold h-9 bg-white"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] text-gray-500 font-bold">Target 3</Label>
                                    <div className="relative">
                                        <TrendingUp className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-green-300 opacity-50" />
                                        <Input
                                            value={tp3}
                                            onChange={(e) => { setTp3(e.target.value); setSelectedStrategy('MANUAL'); }}
                                            placeholder="Optional"
                                            className="pl-8 text-sm font-mono font-bold h-9 bg-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Thesis & Save */}
                    <div className="lg:col-span-5 flex flex-col gap-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                <Quote className="h-3 w-3" /> Trade Thesis
                            </Label>
                            <Textarea
                                placeholder="Why did you buy this? What are you waiting for to exit?"
                                className="text-xs h-[120px] resize-none bg-white border-gray-100 italic font-serif leading-relaxed"
                                value={thesis}
                                onChange={(e) => setThesis(e.target.value)}
                            />
                        </div>

                        <div className="p-5 bg-white rounded-xl border border-gray-100 shadow-sm space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Master Stop Loss</Label>
                                <div className="relative">
                                    <TrendingDown className="absolute left-3 top-3 h-4 w-4 text-red-500" />
                                    <Input
                                        value={sl}
                                        onChange={(e) => { setSl(e.target.value); setSelectedStrategy('MANUAL'); }}
                                        className="pl-9 font-mono font-bold text-red-600 focus-visible:ring-red-500/20 shadow-inner"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 uppercase font-black">R/W Ratio</span>
                                    <span className="text-sm font-black text-blue-700">{calculateRiskReward() || 'N/A'}</span>
                                </div>
                                <Button
                                    onClick={handleSave}
                                    disabled={saving || success}
                                    className={`transition-all duration-300 ${success ? 'bg-green-600 hover:bg-green-700 shadow-green-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'} text-white px-8 font-bold`}
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : success ? <Shield className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    {success ? 'Mission Active' : 'Commit Strategy'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
