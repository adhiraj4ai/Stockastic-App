import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { Loader2, Target, TrendingDown, TrendingUp, Shield, BarChart3 } from 'lucide-react';

interface ExitStrategyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    portfolioItem: any;
    onSave: () => void;
}

interface StrategyOption {
    name: string;
    sl: number;
    tp: number;
    desc: string;
}

export function ExitStrategyDialog({ open, onOpenChange, portfolioItem, onSave }: ExitStrategyDialogProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [strategies, setStrategies] = useState<Record<string, StrategyOption>>({});

    // Form State
    const [sl, setSl] = useState<string>('');
    const [tp, setTp] = useState<string>('');
    const [selectedStrategy, setSelectedStrategy] = useState<string>('MANUAL');
    const [currentPrice, setCurrentPrice] = useState<number>(0);

    const fetchData = async () => {
        if (!portfolioItem) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await axios.get(`${apiUrl}/api/stocks/portfolio/${portfolioItem.id}/suggest_exits/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStrategies(res.data.strategies);
            setCurrentPrice(res.data.current_price);

            // Initialize with existing values if set, else use Fixed default
            if (portfolioItem.stop_loss_price) {
                setSl(portfolioItem.stop_loss_price.toString());
                setTp(portfolioItem.target_price?.toString() || '');
                setSelectedStrategy(portfolioItem.strategy_type || 'MANUAL');
            } else {
                // Default to Fixed
                const def = res.data.strategies['fixed'];
                setSl(def.sl.toFixed(2));
                setTp(def.tp.toFixed(2));
                setSelectedStrategy('fixed');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open && portfolioItem) {
            fetchData();
        }
    }, [open, portfolioItem]);

    const handleApplyStrategy = (key: string) => {
        const s = strategies[key];
        if (s) {
            setSl(s.sl.toFixed(2));
            setTp(s.tp.toFixed(2));
            setSelectedStrategy(key);
        }
    };

    const handleSave = async () => {
        if (!portfolioItem) return;
        setSaving(true);
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            await axios.patch(`${apiUrl}/api/stocks/portfolio/${portfolioItem.id}/`, {
                stop_loss_price: parseFloat(sl),
                target_price: parseFloat(tp),
                strategy_type: selectedStrategy
            }, {
                headers: { Authorization: `Bearer ${token}` }
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
        return (reward / risk).toFixed(2);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-blue-600" />
                        Exit Plan: {portfolioItem?.ticker}
                    </DialogTitle>
                    <DialogDescription>
                        Set your Stop Loss and Profit Targets. Current Price: <span className="font-bold text-black">Rs. {currentPrice}</span>
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left: Strategy Selection */}
                        <div className="space-y-3">
                            <Label>Recommended Strategies</Label>
                            {Object.entries(strategies).map(([key, option]) => (
                                <div
                                    key={key}
                                    onClick={() => handleApplyStrategy(key)}
                                    className={`p-3 border rounded-lg cursor-pointer transition-all hover:border-blue-300 ${selectedStrategy === key ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'bg-white'}`}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-medium text-sm">{option.name}</span>
                                        {key === 'atr_conservative' && <Shield className="h-3 w-3 text-green-600" />}
                                        {key === 'swing' && <BarChart3 className="h-3 w-3 text-purple-600" />}
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span className="text-red-500">SL: {option.sl.toFixed(1)}</span>
                                        <span className="text-green-600">TP: {option.tp.toFixed(1)}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400">{option.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* Right: Manual Adjustment & Preview */}
                        <div className="space-y-6">
                            <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold uppercase text-gray-500">Stop Loss (Rs.)</Label>
                                    <div className="relative">
                                        <TrendingDown className="absolute left-3 top-2.5 h-4 w-4 text-red-500" />
                                        <Input
                                            value={sl}
                                            onChange={(e) => { setSl(e.target.value); setSelectedStrategy('MANUAL'); }}
                                            className="pl-9 font-mono"
                                        />
                                    </div>
                                    {sl && currentPrice && (
                                        <p className="text-xs text-red-500 text-right">
                                            -{((1 - parseFloat(sl) / currentPrice) * 100).toFixed(2)}% Risk
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold uppercase text-gray-500">Take Profit (Rs.)</Label>
                                    <div className="relative">
                                        <TrendingUp className="absolute left-3 top-2.5 h-4 w-4 text-green-500" />
                                        <Input
                                            value={tp}
                                            onChange={(e) => { setTp(e.target.value); setSelectedStrategy('MANUAL'); }}
                                            className="pl-9 font-mono"
                                        />
                                    </div>
                                    {tp && currentPrice && (
                                        <p className="text-xs text-green-600 text-right">
                                            +{((parseFloat(tp) / currentPrice - 1) * 100).toFixed(2)}% Gain
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-md text-sm text-blue-800">
                                <span>Risk/Reward Ratio:</span>
                                <span className="font-bold">{calculateRiskReward() || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save Exit Plan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
