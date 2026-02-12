'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { SocialPostCard } from '@/components/SocialPostCard';
import api from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Share2, TrendingUp, BarChart3, Info, TrendingDown, Zap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function SocialPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedType, setSelectedType] = useState<'summary' | 'gainers' | 'losers' | 'turnover' | 'sectors'>('summary');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await api.get('/api/stocks/summary/');
                setData(response.data);
            } catch (error) {
                console.error('Failed to fetch market data', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <DashboardLayout title="Social Highlights" subtitle="Generating your market presence...">
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                    <div className="h-12 w-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium animate-pulse">Syncing with Market Pulse...</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title={<div className="flex items-center gap-2">Social <span className="text-blue-600">Snapshots</span><Sparkles size={18} className="text-blue-500" /></div>}
            subtitle="Transform complex market data into beautiful, shareable insights."
        >
            <div className="max-w-6xl mx-auto space-y-8">
                <Alert className="bg-blue-500/5 border-blue-500/20 rounded-2xl p-6">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertTitle className="text-blue-700 dark:text-blue-400 font-bold mb-1 uppercase tracking-widest text-[10px]">Strategic Insight</AlertTitle>
                    <AlertDescription className="text-slate-600 dark:text-slate-400 text-sm">
                        Use these cards to share today's market performance on X (Twitter), LinkedIn, or Instagram. Each card is optimized for visual engagement and data accuracy.
                    </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                    {/* Controls */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="space-y-4">
                            <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">Select Template</h2>
                            <div className="grid grid-cols-1 gap-3">
                                {[
                                    { id: 'summary', name: 'Daily Market Wrap', icon: Share2, desc: 'A comprehensive view of the market index and turnover.' },
                                    { id: 'gainers', name: 'Alpha Leaders', icon: TrendingUp, desc: 'Highlight the top performing stocks and their gains.' },
                                    { id: 'losers', name: 'Market Corrections', icon: TrendingDown, desc: 'Showcase stocks with significant price drops.' },
                                    { id: 'turnover', name: 'Volume Magnets', icon: Zap, desc: 'Stocks with the highest trading activity today.' },
                                    { id: 'sectors', name: 'Macro Heatmap', icon: BarChart3, desc: 'Visualize how different sectors performed today.' }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setSelectedType(type.id as any)}
                                        className={`group flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 text-left ${selectedType === type.id
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-500/20 scale-[1.02]'
                                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:border-blue-500/30'
                                            }`}
                                    >
                                        <div className={`p-3 rounded-xl transition-colors ${selectedType === type.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                                            }`}>
                                            <type.icon size={20} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm tracking-tight">{type.name}</div>
                                            <div className={`text-[10px] ${selectedType === type.id ? 'text-white/70' : 'text-slate-500'}`}>{type.desc}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-6 rounded-[2rem] bg-slate-950 border border-white/5 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2 relative z-10">
                                <Sparkles size={14} className="text-blue-500" />
                                Pro Tip
                            </h3>
                            <p className="text-slate-400 text-xs leading-relaxed relative z-10">
                                High turnover days with positive index movement typically generate 40% more engagement on social platforms. Consider sharing the "Daily Wrap" during late market hours.
                            </p>
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="lg:col-span-7">
                        <div className="flex flex-col items-center">
                            <div className="mb-6 flex items-center justify-between w-full max-w-md">
                                <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">Live Preview</h2>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-1 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/5">
                                    High Fidelity
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={selectedType}
                                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                                    transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                                    className="w-full"
                                >
                                    <SocialPostCard type={selectedType} data={data} />
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
