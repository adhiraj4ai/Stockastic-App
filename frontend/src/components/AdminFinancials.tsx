'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from '@/components/ui/card';
import {
    Plus,
    Loader2,
    ArrowLeft,
    CheckCircle2,
    Clock,
    FileText,
    AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FinancialReportEditor from './FinancialReportEditor';

interface FinancialReport {
    id: number;
    fiscal_year: string;
    report_type: 'ANNUAL' | 'QUARTERLY';
    quarter?: number;
    is_audited: boolean;
    revenue?: number | string;
    net_profit?: number | string;
}

interface AdminFinancialsProps {
    ticker: string;
}

type FiscalYearData = {
    year: string;
    q1?: FinancialReport;
    q2?: FinancialReport;
    q3?: FinancialReport;
    q4?: FinancialReport;
    annual?: FinancialReport;
};

export default function AdminFinancials({ ticker }: AdminFinancialsProps) {
    const [reports, setReports] = useState<FinancialReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editingReportId, setEditingReportId] = useState<number | null>(null);
    const [initialEditorData, setInitialEditorData] = useState<{ fiscalYear: string, reportType: string, quarter: string } | null>(null);

    // New State for Manual Fiscal Year
    const [manualYears, setManualYears] = useState<string[]>([]);
    const [isAddYearDialogOpen, setIsAddYearDialogOpen] = useState(false);
    const [newFiscalYear, setNewFiscalYear] = useState('');

    const fetchReports = async () => {
        setLoading(true);
        try {
            // Using correct endpoint defined in urls.py
            const response = await api.get(`/api/stocks/financials/${ticker}/`);
            setReports(response.data.results || response.data);
        } catch (error) {
            toast.error('Failed to fetch financial reports');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (ticker) {
            fetchReports();
            setIsEditing(false);
            setEditingReportId(null);
            setInitialEditorData(null);
        }
    }, [ticker]);

    const handleEdit = (reportId: number) => {
        setEditingReportId(reportId);
        setInitialEditorData(null);
        setIsEditing(true);
    };

    const handleAdd = (year: string, type: 'ANNUAL' | 'QUARTERLY', quarter?: number) => {
        setEditingReportId(null);
        setInitialEditorData({
            fiscalYear: year,
            reportType: type,
            quarter: quarter?.toString() || '4'
        });
        setIsEditing(true);
    };

    // Group reports by Fiscal Year
    const fiscalYearMap: Record<string, FiscalYearData> = {};

    // 1. Populate map with existing reports
    reports.forEach(report => {
        const year = report.fiscal_year;
        if (!fiscalYearMap[year]) {
            fiscalYearMap[year] = { year };
        }

        if (report.report_type === 'ANNUAL') {
            fiscalYearMap[year].annual = report;
        } else if (report.report_type === 'QUARTERLY' && report.quarter) {
            const key = `q${report.quarter}` as 'q1' | 'q2' | 'q3' | 'q4';
            fiscalYearMap[year][key] = report;
        }
    });

    // 2. Ensure we have a reasonable range of years (e.g., last 10 years + logic to add new)
    // For now, let's just use the years we have data for, plus maybe one future year if completely empty?
    // User can just "Add New Fiscal Year" basically by having a row creator or just manual one-off adds.
    // Better UX: Show specific list of years found, plus a generic "Add New Year" button that adds a row to UI?
    // Let's stick to showing found years + current year range.
    // Actually, to support entering data for new years, we need to generate a list of years.
    // Let's generate a dynamic list of years based on current date back to some reasonable past, or just use detected years.
    // Simplified: Show detected years sorted descending. Add a "Add Year" button to insert a new row for a specific year.

    // Helper to generate next year string "082-083" from "081-082"
    const getNextYearInfo = (lastYear: string) => {
        if (!lastYear) return '080-081'; // Default fall back
        // Format: "YY-YY" or "YYYY/YY"
        // Try parsing
        const parts = lastYear.split(/[-/]/);
        if (parts.length === 2) {
            const y1 = parseInt(parts[0]);
            const y2 = parseInt(parts[1]);
            if (!isNaN(y1) && !isNaN(y2)) {
                // Detect separator
                const sep = lastYear.includes('/') ? '/' : '-';
                return `${y1 + 1}${sep}${y2 + 1}`;
            }
        }
        return '';
    };

    // Merge fetched years with manually added years and specific sort
    const allYears = Array.from(new Set([...Object.keys(fiscalYearMap), ...manualYears]));
    const sortedYears = allYears.sort().reverse();

    const handleAddNextYear = () => {
        const lastYear = sortedYears[0];
        const next = getNextYearInfo(lastYear);
        setNewFiscalYear(next || '2081/82');
        setIsAddYearDialogOpen(true);
    };

    const handleConfirmAddYear = () => {
        if (newFiscalYear && !sortedYears.includes(newFiscalYear)) {
            setManualYears(prev => [...prev, newFiscalYear]);
            toast.success(`Added Fiscal Year ${newFiscalYear}`);
        }
        setIsAddYearDialogOpen(false);
    };

    // New Year Row Logic (Manual) - Optional, for now just handleAddNextYear handles the "New" case nicely.

    const renderCell = (year: string, type: 'ANNUAL' | 'QUARTERLY', quarter?: number) => {
        const data = fiscalYearMap[year];
        let report: FinancialReport | undefined;

        if (type === 'ANNUAL') {
            report = data?.annual;
        } else {
            // @ts-ignore
            report = data && quarter ? data[`q${quarter}` as keyof FiscalYearData] : undefined;
        }

        if (report) {
            return (
                <div className="flex flex-col items-center justify-center h-full w-full py-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className={`h-12 w-full flex flex-col gap-1 hover:bg-blue-50 border border-transparent hover:border-blue-200 
                                        ${report.is_audited ? 'text-green-600' : 'text-blue-600'}`}
                                    onClick={() => handleEdit(report!.id)}
                                >
                                    {report.is_audited ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                    <span className="text-[10px] font-bold">
                                        {report.net_profit ? (Number(report.net_profit) / 1000000).toFixed(1) + 'M' : 'View'}
                                    </span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Net Profit: {report.net_profit?.toLocaleString()}</p>
                                <p>Status: {report.is_audited ? 'Audited' : 'Unaudited'}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center h-full w-full py-2 opacity-0 hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-full"
                    onClick={() => handleAdd(year, type, quarter)}
                >
                    <Plus className="w-5 h-5" />
                </Button>
            </div>
        );
    };

    if (isEditing) {
        return (
            <FinancialReportEditor
                ticker={ticker}
                reportId={editingReportId}
                initialData={initialEditorData}
                onClose={() => setIsEditing(false)}
                onSaveSuccess={() => {
                    setIsEditing(false);
                    fetchReports();
                }}
            />
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-end">
                <Button onClick={handleAddNextYear} className="bg-blue-600 hover:bg-blue-700 font-bold gap-2 px-6 shadow-md transition-all hover:scale-105 active:scale-95">
                    <Plus className="w-4 h-4" /> Add Next Fiscal Year
                </Button>
            </div>

            <div className="overflow-hidden bg-white border rounded-xl shadow-sm">
                <div className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                <TableHead className="w-[150px] font-bold text-xs uppercase tracking-widest text-gray-500 py-4 px-6">Fiscal Year</TableHead>
                                <TableHead className="text-center font-bold text-xs uppercase tracking-widest text-gray-500 py-4 w-[100px]">Q1</TableHead>
                                <TableHead className="text-center font-bold text-xs uppercase tracking-widest text-gray-500 py-4 w-[100px]">Q2</TableHead>
                                <TableHead className="text-center font-bold text-xs uppercase tracking-widest text-gray-500 py-4 w-[100px]">Q3</TableHead>
                                <TableHead className="text-center font-bold text-xs uppercase tracking-widest text-gray-500 py-4 w-[100px]">Q4</TableHead>
                                <TableHead className="text-center font-bold text-xs uppercase tracking-widest text-gray-500 py-4 w-[120px] bg-blue-50/50 text-blue-600">Annual</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-20">
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gathering records...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : sortedYears.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-24">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
                                                <FileText className="w-6 h-6" />
                                            </div>
                                            <p className="text-gray-500 font-medium">No records found</p>
                                            <Button variant="outline" size="sm" onClick={handleAddNextYear}>Start with a new Year</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedYears.map(year => (
                                    <TableRow key={year} className="hover:bg-gray-50/30 group">
                                        <TableCell className="font-bold text-gray-700 px-6 py-4">
                                            {year}
                                        </TableCell>
                                        <TableCell className="p-0 border-l border-gray-100">
                                            {renderCell(year, 'QUARTERLY', 1)}
                                        </TableCell>
                                        <TableCell className="p-0 border-l border-gray-100">
                                            {renderCell(year, 'QUARTERLY', 2)}
                                        </TableCell>
                                        <TableCell className="p-0 border-l border-gray-100">
                                            {renderCell(year, 'QUARTERLY', 3)}
                                        </TableCell>
                                        <TableCell className="p-0 border-l border-gray-100">
                                            {renderCell(year, 'QUARTERLY', 4)}
                                        </TableCell>
                                        <TableCell className="p-0 border-l border-gray-100 bg-blue-50/20">
                                            {renderCell(year, 'ANNUAL')}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
            {/* Add Fiscal Year Modal */}
            <Dialog open={isAddYearDialogOpen} onOpenChange={setIsAddYearDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Add New Fiscal Year</DialogTitle>
                        <DialogDescription>
                            Enter the fiscal year label (e.g., 2081/82 or 081-082). Only years not already present will be added.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="fy" className="text-right">
                                Fiscal Year
                            </Label>
                            <Input
                                id="fy"
                                value={newFiscalYear}
                                onChange={(e) => setNewFiscalYear(e.target.value)}
                                className="col-span-3"
                                placeholder="2081/82"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => setIsAddYearDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" onClick={handleConfirmAddYear}>Add Row</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
