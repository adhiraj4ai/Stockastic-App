'use client';

import { useEffect } from 'react';
import { format, subYears } from "date-fns";
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface PeriodSelectorProps {
    startDate: string;
    endDate: string;
    setStartDate: (v: string) => void;
    setEndDate: (v: string) => void;
    rangeType: '1y' | '3y' | '5y' | '10y' | 'all' | 'custom';
    setRangeType: (v: '1y' | '3y' | '5y' | '10y' | 'all' | 'custom') => void;
}

export function PeriodSelector({ startDate, endDate, setStartDate, setEndDate, rangeType, setRangeType }: PeriodSelectorProps) {
    // Toggle presets
    useEffect(() => {
        const today = new Date();
        if (rangeType === '10y') {
            const from = subYears(today, 10);
            setStartDate(format(from, 'yyyy-MM-dd'));
            setEndDate(format(today, 'yyyy-MM-dd'));
        } else if (rangeType === '5y') {
            const from = subYears(today, 5);
            setStartDate(format(from, 'yyyy-MM-dd'));
            setEndDate(format(today, 'yyyy-MM-dd'));
        } else if (rangeType === '3y') {
            const from = subYears(today, 3);
            setStartDate(format(from, 'yyyy-MM-dd'));
            setEndDate(format(today, 'yyyy-MM-dd'));
        } else if (rangeType === '1y') {
            const from = subYears(today, 1);
            setStartDate(format(from, 'yyyy-MM-dd'));
            setEndDate(format(today, 'yyyy-MM-dd'));
        } else if (rangeType === 'all') {
            setStartDate('');
            setEndDate('');
        }
    }, [rangeType, setStartDate, setEndDate]);

    const fromDate = startDate ? new Date(startDate) : undefined;
    const toDate = endDate ? new Date(endDate) : undefined;

    return (
        <div className="space-y-4">
            <Label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Backtest Period</Label>
            <div className="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-lg gap-1">
                {(['1y', '3y', '5y', '10y', 'all', 'custom'] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setRangeType(t)}
                        className={`flex-1 py-1.5 px-1 text-[10px] font-bold rounded-md transition-all ${rangeType === t ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
                    >
                        {t === 'all' ? 'ALL' : t.toUpperCase()}
                    </button>
                ))}
            </div>

            {rangeType === 'custom' && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-500 pl-1">From</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full h-9 justify-start text-left font-medium text-xs bg-white dark:bg-card border-gray-200 dark:border-slate-800 rounded-xl",
                                        !fromDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-blue-500" />
                                    {fromDate ? format(fromDate, "MMM dd, y") : "Select..."}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 rounded-2xl overflow-hidden shadow-sm dark:border-slate-800" align="start">
                                <Calendar
                                    mode="single"
                                    selected={fromDate}
                                    onSelect={(d) => d && setStartDate(format(d, 'yyyy-MM-dd'))}
                                    initialFocus
                                    disabled={(d) => d > new Date()}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-500 pl-1">To</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full h-9 justify-start text-left font-medium text-xs bg-white dark:bg-card border-gray-200 dark:border-slate-800 rounded-xl",
                                        !toDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-blue-500" />
                                    {toDate ? format(toDate, "MMM dd, y") : "Select..."}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 rounded-2xl overflow-hidden shadow-sm dark:border-slate-800" align="end">
                                <Calendar
                                    mode="single"
                                    selected={toDate}
                                    onSelect={(d) => d && setEndDate(format(d, 'yyyy-MM-dd'))}
                                    initialFocus
                                    disabled={(d) => d > new Date() || !!(fromDate && d < fromDate)}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            )}

            {!startDate && !endDate && rangeType !== 'custom' && (
                <div className="flex items-center gap-2 p-2 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30">
                    <CalendarIcon size={12} className="text-blue-500" />
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Running with full market history</span>
                </div>
            )}
        </div>
    );
}
