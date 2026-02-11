'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

interface ComparisonData {
    date: string;
    turnover: string[];
    volume: string[];
    transactions: string[];
    gainers: string[];
    losers: string[];
}

interface TopThreeViewProps {
    data: {
        today: ComparisonData | null;
        last: ComparisonData | null;
    } | null;
}

export const TopThreeView: React.FC<TopThreeViewProps> = ({ data }) => {
    if (!data || !data.today) return null;

    const sections = [
        { label: 'By Turnover / Rs Amount', key: 'turnover' },
        { label: 'By Volume / Number of Share Traded', key: 'volume' },
        { label: 'By Number of Transaction', key: 'transactions' },
        { label: 'Gainers (Increase in share price)', key: 'gainers', color: 'text-emerald-500' },
        { label: 'Losers (Decrease in share price)', key: 'losers', color: 'text-rose-500' },
    ];

    const formatDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr), 'MMM d');
        } catch {
            return dateStr;
        }
    };

    return (
        <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden backdrop-blur-xl relative">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent blur-2xl opacity-50" />
            <div className="p-4 flex justify-between items-center border-b border-slate-100 dark:border-white/5 relative z-10">
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400">NEPSE</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black italic text-slate-900 dark:text-slate-100">TOP</span>
                        <span className="text-5xl font-black italic text-blue-600 dark:text-blue-500">3</span>
                    </div>
                </div>
            </div>
            <CardContent className="p-0 relative z-10">
                <Table>
                    <TableHeader className="bg-slate-50/50 dark:bg-white/5">
                        <TableRow className="border-slate-100 dark:border-white/5">
                            <TableHead className="w-[40%]"></TableHead>
                            <TableHead className="text-center font-bold py-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Yesterday</span>
                                    <span className="text-sm text-slate-800 dark:text-slate-200">{data.last ? formatDate(data.last.date) : 'N/A'}</span>
                                </div>
                            </TableHead>
                            <TableHead className="text-center font-bold py-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wider">Today</span>
                                    <span className="text-sm text-slate-800 dark:text-slate-200">{formatDate(data.today.date)}</span>
                                </div>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sections.map((section) => (
                            <React.Fragment key={section.key}>
                                {[0, 1, 2].map((rowIndex) => (
                                    <TableRow key={`${section.key}-${rowIndex}`} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        {rowIndex === 0 && (
                                            <TableCell rowSpan={3} className="font-bold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 text-sm leading-tight pr-6">
                                                {section.label}
                                            </TableCell>
                                        )}
                                        <TableCell className="text-center font-bold text-slate-800 dark:text-slate-200 py-3">
                                            {data.last ? (data.last as any)[section.key][rowIndex] || '-' : '-'}
                                        </TableCell>
                                        <TableCell className={`text-center font-bold py-3 ${section.color || 'text-slate-800 dark:text-slate-200'}`}>
                                            {(data.today as any)[section.key][rowIndex] || '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </React.Fragment>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};
