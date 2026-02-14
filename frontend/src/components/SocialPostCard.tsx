'use client';

import React, { useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import {
    Download,
    Share2,
    Twitter,
    Copy,
    TrendingUp,
    TrendingDown,
    BarChart3,
    Activity,
    ChevronRight,
    Landmark,
    Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';

interface SocialPostCardProps {
    type: 'summary' | 'gainers' | 'losers' | 'turnover' | 'sectors';
    data: any;
}

export const SocialPostCard = ({ type, data }: SocialPostCardProps) => {
    const cardRef = useRef<HTMLDivElement>(null);

    const copyToClipboard = () => {
        let text = '';
        if (type === 'summary') {
            const { total_points, points_change, percent_change, turnover, advancers, decliners } = data.market_summary;
            text = `🇳🇵 #NEPSE Daily Update 🚀\n\n📌 Index: ${total_points.toFixed(2)} (${points_change >= 0 ? '+' : ''}${points_change.toFixed(2)}, ${percent_change.toFixed(2)}%)\n💰 Turnover: Rs. ${(turnover / 10000000).toFixed(2)} Cr\n📈 Advancers: ${advancers}\n📉 Decliners: ${decliners}\n\n#StockMarket #Nepal #Stockastic`;
        } else if (type === 'gainers') {
            text = `🔥 Top Gainers Today 🚀\n\n${data.top_gainers.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: +${s.percent_change.toFixed(2)}%`).join('\n')}\n\n#NEPSE #TopGainers #Stockastic`;
        } else if (type === 'losers') {
            text = `📉 Top Losers Today 🔻\n\n${data.top_losers.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: ${s.percent_change.toFixed(2)}%`).join('\n')}\n\n#NEPSE #TopLosers #Stockastic`;
        } else if (type === 'turnover') {
            text = `💰 Top Turnover Today 💸\n\n${data.top_turnover.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: Rs. ${(s.turnover / 1000000).toFixed(2)}M`).join('\n')}\n\n#NEPSE #Turnover #Stockastic`;
        } else if (type === 'sectors') {
            text = `🏗️ Sector Performance Matrix 📊\n\n${data.sector_summary.slice(0, 5).map((s: any) => `${s.name}: ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%`).join('\n')}\n\n#NEPSE #Sectors #Nepal #Stockastic`;
        }

        navigator.clipboard.writeText(text);
        toast.success('Formatted text copied to clipboard!');
    };

    const handleSaveImage = async () => {
        if (!cardRef.current) return;

        const toastId = toast.loading('Generating high-res image...');

        try {
            // Wait a moment for any potential renders
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(cardRef.current, {
                scale: 3, // Higher resolution
                backgroundColor: '#020617', // Match slate-950
                useCORS: true, // Allow loading cross-origin images
                allowTaint: true,
                logging: false,
                ignoreElements: (element) => element.tagName === 'BUTTON', // Ignore buttons inside if any
            });

            const image = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = image;
            link.download = `stockastic-${type}-${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success('Image saved successfully!', { id: toastId });
        } catch (error) {
            console.error('Error generating image:', error);
            toast.error('Failed to generate image. Please try again.', { id: toastId });
        }
    };

    const renderSummary = () => {
        const { total_points, points_change, percent_change, total_turnover, advancers, decliners, advancers_percent, decliners_percent } = data.market_summary;
        const isPositive = points_change >= 0;

        return (
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Market Pulse</span>
                        <h3 className="text-3xl font-black text-white tracking-tighter flex items-baseline gap-2">
                            {total_points.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className={`text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? '+' : ''}{percent_change.toFixed(2)}%
                            </span>
                        </h3>
                    </div>
                    <div className={`p-3 rounded-2xl ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} border border-white/10`}>
                        {isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Turnover</span>
                        <div className="text-xl font-black text-white">Rs. {(total_turnover / 10000000).toFixed(2)}<span className="text-xs ml-1 opacity-60">Cr</span></div>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Sentiment</span>
                        <div className="text-xl font-black text-white">{(advancers / (advancers + decliners || 1)).toFixed(2)}<span className="text-xs ml-1 opacity-60">Ratio</span></div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black tracking-widest uppercase">
                        <span className="text-emerald-400">Advancers ({advancers})</span>
                        <span className="text-rose-400">Decliners ({decliners})</span>
                    </div>
                    <div className="h-3 w-full bg-white/5 rounded-full flex overflow-hidden border border-white/10 p-0.5">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.3)]"
                            style={{ width: `${advancers_percent}%` }}
                        />
                        <div
                            className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-full shadow-[0_0_15px_rgba(251,113,133,0.3)] ml-auto"
                            style={{ width: `${decliners_percent}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    const renderList = (title: string, subtitle: string, list: any[], valueKey: string, isPercentage: boolean, icon: any, colorClass: string) => (
        <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-xl ${colorClass.replace('text-', 'bg-').replace('400', '500/20')} ${colorClass} border border-white/10`}>
                    {icon}
                </div>
                <div>
                    <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{subtitle}</p>
                </div>
            </div>

            <div className="space-y-3">
                {list.slice(0, 5).map((stock: any, i: number) => (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={stock.ticker}
                        className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center font-black text-xs border border-white/5 group-hover:border-blue-500/50 transition-colors">
                                {stock.ticker}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">{stock.ticker}</span>
                                <span className="text-[9px] text-slate-500 font-medium">{stock.sector}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={`text-sm font-black ${stock[valueKey] >= 0 ? 'text-emerald-400' : 'text-rose-400'} flex items-center justify-end gap-1`}>
                                {isPercentage && (stock[valueKey] >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                                {isPercentage ? `${stock[valueKey].toFixed(2)}%` : `Rs. ${(stock[valueKey] / 1000000).toFixed(1)}M`}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">Rs. {stock.close}</div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );

    const renderSectors = () => (
        <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">
                    <BarChart3 size={20} />
                </div>
                <div>
                    <h3 className="text-xl font-black text-white tracking-tight">Sector Heat Map</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Macro Market Movement</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {data.sector_summary.slice(0, 6).map((sector: any, i: number) => (
                    <div key={sector.name} className="flex items-center gap-4">
                        <div className="w-24 text-[10px] font-black uppercase text-slate-400 truncate">{sector.name}</div>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden flex border border-white/5">
                            <div
                                className={`h-full rounded-full ${sector.change >= 0 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]'}`}
                                style={{ width: `${Math.min(100, Math.abs(sector.change) * 20)}%`, marginLeft: sector.change < 0 ? 'auto' : '0' }}
                            />
                        </div>
                        <div className={`w-12 text-[10px] font-bold text-right ${sector.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-6 max-w-md mx-auto">
            <div
                ref={cardRef}
                className="relative aspect-[4/5] w-full rounded-[2rem] overflow-hidden bg-slate-950 border border-white/10 shadow-2xl p-8 flex flex-col justify-between"
            >
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] -mr-32 -mt-32" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-600/10 blur-[100px] -ml-32 -mb-32" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                />

                {/* Header */}
                <div className="flex items-center justify-between relative z-10 w-full mb-4">
                    <div className="flex items-center gap-2">
                        {/* Using standard img for better html2canvas compatibility */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/stockastic-logo-dark.png"
                            alt="Stockastic"
                            width={100}
                            height={40}
                            className="object-contain"
                            crossOrigin="anonymous"
                        />
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div className="text-[8px] font-mono text-slate-600">SNAPSHOT ID: {Math.random().toString(36).substring(7).toUpperCase()}</div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="relative z-10 flex-1 flex flex-col justify-center py-2">
                    {type === 'summary' && renderSummary()}
                    {type === 'gainers' && renderList('Top Alpha Seekers', "Today's Performance Leaders", data.top_gainers, 'percent_change', true, <TrendingUp size={20} />, 'text-emerald-400')}
                    {type === 'losers' && renderList('Top Bears', "Biggest Price Corrections", data.top_losers, 'percent_change', true, <TrendingDown size={20} />, 'text-rose-400')}
                    {type === 'turnover' && renderList('Volume Magnets', "Most Traded Stocks", data.top_turnover, 'turnover', false, <Zap size={20} />, 'text-amber-400')}
                    {type === 'sectors' && renderSectors()}
                </div>

                {/* Footer */}
                <div className="relative z-10 pt-6 border-t border-white/5 flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Platform</span>
                            <span className="text-[10px] font-black text-white">stockastic.market</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-white/5 flex items-center justify-center text-white">
                            <Twitter size={10} />
                        </div>
                        <div className="h-6 w-6 rounded-full bg-white/5 flex items-center justify-center text-white">
                            <Share2 size={10} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Button
                    variant="outline"
                    className="rounded-xl border-white/5 bg-white/5 hover:bg-white/10 text-white gap-2 h-12"
                    onClick={copyToClipboard}
                >
                    <Copy size={16} />
                    Copy Text
                </Button>
                <Button
                    variant="default"
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-2 h-12 shadow-lg shadow-blue-500/20"
                    onClick={handleSaveImage}
                >
                    <Download size={16} />
                    Save Image
                </Button>
            </div>
        </div>
    );
};
