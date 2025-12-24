'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    ArrowLeft,
    Save,
    X,
    AlertCircle,
    CheckCircle2,
    Calculator,
    Info,
    ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { FINANCIAL_TEMPLATES, SECTOR_TO_TEMPLATE } from '@/constants/financialTemplates';

interface FinancialReportEditorProps {
    ticker: string;
    reportId?: number | null;
    initialData?: {
        fiscalYear?: string;
        reportType?: string;
        quarter?: string;
    } | null;
    onClose: () => void;
    onSaveSuccess: () => void;
}

export default function FinancialReportEditor({ ticker, reportId, initialData, onClose, onSaveSuccess }: FinancialReportEditorProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Basic Report State
    const [fiscalYear, setFiscalYear] = useState('');
    const [reportType, setReportType] = useState('QUARTERLY');
    const [quarter, setQuarter] = useState('1');
    const [isAudited, setIsAudited] = useState(false);
    const [reportTemplate, setReportTemplate] = useState('GENERAL');
    const [sector, setSector] = useState('');

    // Headline Figures
    const [revenue, setRevenue] = useState('');
    const [netProfit, setNetProfit] = useState('');
    const [eps, setEps] = useState('');

    // JSON Data State
    const [balanceSheet, setBalanceSheet] = useState<Record<string, string>>({});
    const [profitLoss, setProfitLoss] = useState<Record<string, string>>({});
    const [cashFlow, setCashFlow] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchCompanySector = async () => {
            try {
                const res = await api.get(`/api/stocks/details/${ticker}/`);
                setSector(res.data.fundamental?.sector || '');
            } catch (err) {
                console.error('Failed to fetch company sector', err);
            }
        };
        if (ticker) fetchCompanySector();
    }, [ticker]);

    useEffect(() => {
        if (!sector) return;

        let baseTemplate = SECTOR_TO_TEMPLATE[sector] || 'GENERAL';

        if (reportType === 'QUARTERLY') {
            const quarterlyId = `${baseTemplate}_QUARTERLY`;
            if (FINANCIAL_TEMPLATES[quarterlyId]) {
                setReportTemplate(quarterlyId);
            } else {
                setReportTemplate('GENERAL_QUARTERLY');
            }
        } else {
            setReportTemplate(baseTemplate);
        }
    }, [sector, reportType]);

    useEffect(() => {
        if (reportId) {
            fetchReport();
        } else {
            // New report defaults or from initialData
            setFiscalYear(initialData?.fiscalYear || '');
            setReportType(initialData?.reportType || 'QUARTERLY');
            setQuarter(initialData?.quarter || '1');
            setIsAudited(false);
            setReportTemplate('GENERAL');
            setRevenue('');
            setNetProfit('');
            setEps('');
            setBalanceSheet({});
            setProfitLoss({});
            setCashFlow({});
        }
    }, [reportId, initialData]);

    // Auto-sync Headline Figures from Template Inputs
    useEffect(() => {
        // Sync Net Profit
        const plProfit = profitLoss['PL.net_profit'] || profitLoss['PL.net_profit_loss'] || profitLoss['PL.profit_loss_for_the_period'];
        if (plProfit && plProfit !== netProfit) {
            setNetProfit(plProfit);
        }

        // Sync EPS
        const plEps = profitLoss['PL.eps'] || profitLoss['PL.eps_reported'] || profitLoss['PL.basic_eps'];
        if (plEps && plEps !== eps) {
            setEps(plEps);
        }

        // Sync Revenue (if applicable, though keys vary wildly like interest_income vs revenue)
        // keeping it simple for now as requested.
    }, [profitLoss]);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/stocks/financial-reports/${reportId}/`);
            const report = res.data;
            setFiscalYear(report.fiscal_year);
            setReportType(report.report_type);
            setQuarter(report.quarter?.toString() || '1');
            setIsAudited(report.is_audited);
            setReportTemplate(report.report_template || 'GENERAL');
            setRevenue(report.revenue?.toString() || '');
            setNetProfit(report.net_profit?.toString() || '');
            setEps(report.eps?.toString() || '');

            const bsData: Record<string, string> = {};
            if (report.balance_sheet) {
                Object.entries(report.balance_sheet).forEach(([section, particulars]: [string, any]) => {
                    Object.entries(particulars).forEach(([key, val]: [string, any]) => {
                        bsData[`${section}.${key}`] = val?.toString() || '';
                    });
                });
            }
            setBalanceSheet(bsData);

            const plData: Record<string, string> = {};
            if (report.profit_loss) {
                Object.entries(report.profit_loss).forEach(([section, particulars]: [string, any]) => {
                    Object.entries(particulars).forEach(([key, val]: [string, any]) => {
                        plData[`${section}.${key}`] = val?.toString() || '';
                    });
                });
            }
            setProfitLoss(plData);

            const cfData: Record<string, string> = {};
            if (report.cash_flow) {
                Object.entries(report.cash_flow).forEach(([section, particulars]: [string, any]) => {
                    Object.entries(particulars).forEach(([key, val]: [string, any]) => {
                        cfData[`${section}.${key}`] = val?.toString() || '';
                    });
                });
            }
            setCashFlow(cfData);
        } catch (err) {
            toast.error('Failed to load report data');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!fiscalYear) {
            toast.error('Fiscal Year is required');
            return;
        }

        setSaving(true);
        const payload: any = {
            ticker,
            fiscal_year: fiscalYear,
            report_type: reportType,
            quarter: reportType === 'QUARTERLY' ? parseInt(quarter) : null,
            is_audited: isAudited,
            report_template: reportTemplate,
            revenue: revenue ? parseFloat(revenue) : null,
            net_profit: netProfit ? parseFloat(netProfit) : null,
            eps: eps ? parseFloat(eps) : null,
        };

        const formattedBS: any = {};
        Object.entries(balanceSheet).forEach(([key, val]) => {
            if (!val) return;
            const [section, field] = key.split('.');
            if (!formattedBS[section]) formattedBS[section] = {};
            formattedBS[section][field] = parseFloat(val.replace(/,/g, ''));
        });
        payload.balance_sheet = formattedBS;

        const formattedPL: any = {};
        Object.entries(profitLoss).forEach(([key, val]) => {
            if (!val) return;
            const [section, field] = key.split('.');
            if (!formattedPL[section]) formattedPL[section] = {};
            formattedPL[section][field] = parseFloat(val.replace(/,/g, ''));
        });
        payload.profit_loss = formattedPL;

        const formattedCF: any = {};
        Object.entries(cashFlow).forEach(([key, val]) => {
            if (!val) return;
            const [section, field] = key.split('.');
            if (!formattedCF[section]) formattedCF[section] = {};
            formattedCF[section][field] = parseFloat(val.replace(/,/g, ''));
        });
        payload.cash_flow = formattedCF;

        try {
            if (reportId) {
                await api.put(`/api/stocks/financial-reports/${reportId}/`, payload);
            } else {
                await api.post('/api/stocks/financial-reports/', payload);
            }
            toast.success('Report saved successfully');
            onSaveSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Failed to save report');
        } finally {
            setSaving(false);
        }
    };

    const template = FINANCIAL_TEMPLATES[reportTemplate] || FINANCIAL_TEMPLATES.GENERAL;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 font-medium tracking-tight">Loading report structure...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden border shadow-sm">
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full hover:bg-gray-100 h-10 w-10 p-0 text-gray-500">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-gray-900">{ticker}</h2>
                            <span className="text-gray-300">•</span>
                            <span className="text-sm font-medium text-gray-500">
                                {reportId ? 'Editing Report' : (reportType === 'ANNUAL' ? 'Annual Financial Return' : 'Quarterly Update')}
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                            {fiscalYear || 'Pending Year'} {reportType} {reportType === 'QUARTERLY' ? `Q${quarter}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={onClose} size="sm" className="font-semibold text-gray-600">
                        Discard
                    </Button>
                    <Button onClick={handleSave} disabled={saving} size="sm" className="bg-blue-600 hover:bg-blue-700 font-bold gap-2 min-w-[120px] shadow-sm">
                        {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
                    </Button>
                </div>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 max-w-7xl mx-auto w-full">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                    {/* Left Sidebar: Controls & Summary */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="border-none shadow-sm bg-white overflow-hidden">
                            <CardHeader className="bg-gray-50/50 border-b py-4">
                                <CardTitle className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                    <Info className="w-3.5 h-3.5 text-blue-500" />
                                    Report Identity
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase text-gray-400">Fiscal Year</Label>
                                    <Input
                                        placeholder="e.g. 081/82"
                                        value={fiscalYear}
                                        onChange={(e) => setFiscalYear(e.target.value)}
                                        className="h-9 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase text-gray-400">Template</Label>
                                    <div className="h-9 px-3 border rounded-md bg-gray-50 flex items-center text-xs font-bold text-gray-600">
                                        {FINANCIAL_TEMPLATES[reportTemplate]?.label || reportTemplate}
                                    </div>
                                    <p className="text-[9px] text-gray-400 font-medium italic">Fixed based on company sector and report type.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold uppercase text-gray-400">Type</Label>
                                        <Select value={reportType} onValueChange={setReportType}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                                                <SelectItem value="ANNUAL">Annual</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {reportType === 'QUARTERLY' && (
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold uppercase text-gray-400">Quarter</Label>
                                            <Select value={quarter} onValueChange={setQuarter}>
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1">Q1</SelectItem>
                                                    <SelectItem value="2">Q2</SelectItem>
                                                    <SelectItem value="3">Q3</SelectItem>
                                                    <SelectItem value="4">Q4</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                                {reportType === 'ANNUAL' && (
                                    <div className="pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <Checkbox
                                                checked={isAudited}
                                                onCheckedChange={(c) => setIsAudited(c as boolean)}
                                                className="data-[state=checked]:bg-blue-600 border-gray-300"
                                            />
                                            <span className="text-xs font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">
                                                Mark as Audited
                                            </span>
                                        </label>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm bg-white overflow-hidden">
                            <CardHeader className="bg-gray-50/50 border-b py-4">
                                <CardTitle className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                    <Calculator className="w-3.5 h-3.5 text-blue-500" />
                                    Headline Figures
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase text-gray-400">Total Revenue</Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={revenue}
                                            onChange={(e) => setRevenue(e.target.value)}
                                            className="h-9 pr-12 text-right font-mono text-xs"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-300 pointer-events-none">Rs</div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase text-gray-400">Net Profit</Label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={netProfit}
                                            onChange={(e) => setNetProfit(e.target.value)}
                                            className="h-9 pr-12 text-right font-mono text-xs"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-300 pointer-events-none">Rs</div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase text-gray-400">EPS</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={eps}
                                        onChange={(e) => setEps(e.target.value)}
                                        className="h-9 text-right font-mono text-xs"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Main Content: Granular Data Tabs */}
                    <div className="lg:col-span-3">
                        <Tabs defaultValue="bs" className="w-full">
                            <TabsList className="bg-white p-1 rounded-xl h-11 border inline-flex shadow-sm mb-6">
                                <TabsTrigger value="bs" className="px-6 rounded-lg data-[state=active]:bg-gray-100 data-[state=active]:text-blue-600 font-bold text-xs uppercase tracking-wider">
                                    Balance Sheet
                                </TabsTrigger>
                                <TabsTrigger value="pl" className="px-6 rounded-lg data-[state=active]:bg-gray-100 data-[state=active]:text-blue-600 font-bold text-xs uppercase tracking-wider">
                                    Profit & Loss
                                </TabsTrigger>
                                {template.sections.cash_flow && (
                                    <TabsTrigger value="cf" className="px-6 rounded-lg data-[state=active]:bg-gray-100 data-[state=active]:text-blue-600 font-bold text-xs uppercase tracking-wider">
                                        Cash Flow
                                    </TabsTrigger>
                                )}
                            </TabsList>

                            <TabsContent value="bs" className="mt-0 space-y-8 animate-in fade-in duration-300">
                                {template.sections.balance_sheet.map(section => (
                                    <div key={section.key} className="bg-white rounded-2xl border shadow-sm p-6 overflow-hidden">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                                            <h4 className="text-sm font-black uppercase text-gray-900 tracking-wide">{section.label}</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                            {section.particulars.map(p => (
                                                <div key={p.key} className="flex items-center justify-between gap-6 py-1 group">
                                                    <div className="flex-1">
                                                        <Label className="text-[11px] font-semibold text-gray-500 group-hover:text-gray-900 transition-colors leading-tight">
                                                            {p.label}
                                                        </Label>
                                                        {p.description && <p className="text-[10px] text-gray-400 mt-0.5">{p.description}</p>}
                                                    </div>
                                                    <div className="relative w-40">
                                                        <Input
                                                            className="h-9 text-right font-mono text-xs focus:ring-blue-500 border-gray-200"
                                                            value={balanceSheet[`${section.key}.${p.key}`] || ''}
                                                            onChange={(e) => setBalanceSheet(prev => ({ ...prev, [`${section.key}.${p.key}`]: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </TabsContent>

                            <TabsContent value="pl" className="mt-0 space-y-8 animate-in fade-in duration-300">
                                {template.sections.profit_loss.map(section => (
                                    <div key={section.key} className="bg-white rounded-2xl border shadow-sm p-6 overflow-hidden">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                                            <h4 className="text-sm font-black uppercase text-gray-900 tracking-wide">{section.label}</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                            {section.particulars.map(p => (
                                                <div key={p.key} className="flex items-center justify-between gap-6 py-1 group">
                                                    <div className="flex-1">
                                                        <Label className="text-[11px] font-semibold text-gray-500 group-hover:text-gray-900 transition-colors leading-tight">
                                                            {p.label}
                                                        </Label>
                                                    </div>
                                                    <div className="relative w-40">
                                                        <Input
                                                            className="h-9 text-right font-mono text-xs focus:ring-indigo-500 border-gray-200"
                                                            value={profitLoss[`${section.key}.${p.key}`] || ''}
                                                            onChange={(e) => setProfitLoss(prev => ({ ...prev, [`${section.key}.${p.key}`]: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </TabsContent>

                            <TabsContent value="cf" className="mt-0 space-y-8 animate-in fade-in duration-300">
                                {template.sections.cash_flow?.map(section => (
                                    <div key={section.key} className="bg-white rounded-2xl border shadow-sm p-6 overflow-hidden">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                                            <h4 className="text-sm font-black uppercase text-gray-900 tracking-wide">{section.label}</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                                            {section.particulars.map(p => (
                                                <div key={p.key} className="flex items-center justify-between gap-6 py-1 group">
                                                    <div className="flex-1">
                                                        <Label className="text-[11px] font-semibold text-gray-500 group-hover:text-gray-900 transition-colors leading-tight">
                                                            {p.label}
                                                        </Label>
                                                    </div>
                                                    <div className="relative w-40">
                                                        <Input
                                                            className="h-9 text-right font-mono text-xs focus:ring-emerald-500 border-gray-200"
                                                            value={cashFlow[`${section.key}.${p.key}`] || ''}
                                                            onChange={(e) => setCashFlow(prev => ({ ...prev, [`${section.key}.${p.key}`]: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </div>
    );
}
