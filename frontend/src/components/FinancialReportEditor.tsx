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
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft,
    Save,
    X,
    AlertCircle,
    CheckCircle2,
    Calculator,
    Info,
    ArrowRight,
    Download,
    Upload
} from 'lucide-react';
import { downloadJsonTemplate } from '@/lib/jsonTemplates';
import { toast } from 'sonner';
import { FINANCIAL_TEMPLATES, SECTOR_TO_TEMPLATE } from '@/constants/financialTemplates';
import { formatNepaliNumber, parseNepaliNumber } from '@/lib/formatters';


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
    const [isEditing, setIsEditing] = useState(!reportId); // Edit mode for new reports, view mode for existing

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
    const [bonusShare, setBonusShare] = useState('');
    const [cashDividend, setCashDividend] = useState('');
    const [announcedDate, setAnnouncedDate] = useState('');
    const [bookCloseDate, setBookCloseDate] = useState('');

    // JSON Data State
    const [balanceSheet, setBalanceSheet] = useState<Record<string, string>>({});
    const [profitLoss, setProfitLoss] = useState<Record<string, string>>({});
    const [cashFlow, setCashFlow] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchCompanySector = async () => {
            try {
                const res = await api.get(`/api/stocks/details/${ticker}/`);
                const sectorName = res.data.company?.sector || res.data.fundamental?.sector || '';
                setSector(sectorName);
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
            setBonusShare('');
            setCashDividend('');
            setAnnouncedDate('');
            setBookCloseDate('');
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
            setBonusShare(report.bonus_share?.toString() || '');
            setCashDividend(report.cash_dividend?.toString() || '');
            setAnnouncedDate(report.dividend_announced_date || '');
            setBookCloseDate(report.dividend_book_close_date || '');

            const bsData: Record<string, string> = {};
            if (report.balance_sheet) {
                Object.entries(report.balance_sheet).forEach(([section, particulars]: [string, any]) => {
                    Object.entries(particulars).forEach(([key, val]: [string, any]) => {
                        const value = val?.toString() || '';
                        bsData[`${section}.${key}`] = value ? formatNepaliNumber(value) : '';
                    });
                });
            }
            setBalanceSheet(bsData);


            const plData: Record<string, string> = {};
            if (report.profit_loss) {
                Object.entries(report.profit_loss).forEach(([section, particulars]: [string, any]) => {
                    Object.entries(particulars).forEach(([key, val]: [string, any]) => {
                        const value = val?.toString() || '';
                        // Don't format REGULATORY fields - they're percentages/small numbers
                        plData[`${section}.${key}`] = (section === 'REGULATORY') ? value : (value ? formatNepaliNumber(value) : '');
                    });
                });
            }
            setProfitLoss(plData);


            const cfData: Record<string, string> = {};
            if (report.cash_flow) {
                Object.entries(report.cash_flow).forEach(([section, particulars]: [string, any]) => {
                    Object.entries(particulars).forEach(([key, val]: [string, any]) => {
                        const value = val?.toString() || '';
                        cfData[`${section}.${key}`] = value ? formatNepaliNumber(value) : '';
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

    // Helper function to handle input change with Nepali formatting
    const handleNumberInput = (value: string) => {
        // Allow user to type freely, only parse commas
        return value;
    };

    // Helper function to format number on blur
    const formatInputValue = (value: string) => {
        if (!value) return '';
        const parsed = parseNepaliNumber(value);
        if (parsed && !isNaN(Number(parsed))) {
            return formatNepaliNumber(parsed);
        }
        return value;
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);

                // Map Metadata if present
                if (json.metadata) {
                    if (json.metadata.fiscal_year) setFiscalYear(json.metadata.fiscal_year);
                    if (json.metadata.report_type) setReportType(json.metadata.report_type);
                    if (json.metadata.quarter) setQuarter(json.metadata.quarter.toString());
                    if (json.metadata.template_id) setReportTemplate(json.metadata.template_id);
                }

                // Map Balance Sheet
                const newBS: Record<string, string> = { ...balanceSheet };
                if (json.balance_sheet) {
                    Object.entries(json.balance_sheet).forEach(([section, values]: [string, any]) => {
                        Object.entries(values).forEach(([key, val]: [string, any]) => {
                            // Treat 0 or '0' as empty to cleaner UI
                            if (val === 0 || val === '0') {
                                newBS[`${section}.${key}`] = '';
                            } else {
                                const strVal = val?.toString() || '';
                                newBS[`${section}.${key}`] = strVal;
                            }
                        });
                    });
                }
                setBalanceSheet(newBS);

                // Map Profit Loss
                const newPL: Record<string, string> = { ...profitLoss };
                if (json.profit_loss) {
                    Object.entries(json.profit_loss).forEach(([section, values]: [string, any]) => {
                        Object.entries(values).forEach(([key, val]: [string, any]) => {
                            if (val === 0 || val === '0') {
                                newPL[`${section}.${key}`] = '';
                            } else {
                                const strVal = val?.toString() || '';
                                newPL[`${section}.${key}`] = strVal;
                            }
                        });
                    });
                }
                setProfitLoss(newPL);

                // Map Cash Flow
                const newCF: Record<string, string> = { ...cashFlow };
                if (json.cash_flow) {
                    Object.entries(json.cash_flow).forEach(([section, values]: [string, any]) => {
                        Object.entries(values).forEach(([key, val]: [string, any]) => {
                            if (val === 0 || val === '0') {
                                newCF[`${section}.${key}`] = '';
                            } else {
                                const strVal = val?.toString() || '';
                                newCF[`${section}.${key}`] = strVal;
                            }
                        });
                    });
                }
                setCashFlow(newCF);

                toast.success('Report data imported from JSON successfully');
            } catch (err) {
                console.error('Failed to parse JSON', err);
                toast.error('Failed to parse JSON file');
            }
        };
        reader.readAsText(file);
    };

    const handleSave = async () => {
        if (!fiscalYear) {
            toast.error('Fiscal Year is required');
            return;
        }

        if (!netProfit) {
            toast.error('Net Profit is required');
            return;
        }

        if (!eps) {
            toast.error('EPS is required');
            return;
        }

        // Validate Total Assets
        const template = FINANCIAL_TEMPLATES[reportTemplate] || FINANCIAL_TEMPLATES.GENERAL;
        let totalAssetsKey = '';
        for (const section of template.sections.balance_sheet) {
            const found = section.particulars.find(p => p.key === 'total_assets');
            if (found) {
                totalAssetsKey = `${section.key}.total_assets`;
                break;
            }
        }

        if (totalAssetsKey && !balanceSheet[totalAssetsKey]) {
            toast.error('Total Assets is required');
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
            bonus_share: bonusShare ? parseFloat(bonusShare) : null,
            cash_dividend: cashDividend ? parseFloat(cashDividend) : null,
            dividend_announced_date: announcedDate || null,
            dividend_book_close_date: bookCloseDate || null,
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
        <div className="flex flex-col h-full bg-white dark:bg-card rounded-2xl overflow-hidden border dark:border-slate-800 shadow-sm transition-colors duration-500">
            {/* Header */}
            <div className="px-6 py-4 bg-white dark:bg-card border-b dark:border-slate-800 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 h-10 w-10 p-0 text-gray-500 dark:text-slate-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {fiscalYear || 'FY ????'} {reportType === 'QUARTERLY' ? `Q${quarter}` : 'Annual'}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">{ticker}</span>
                        {reportId && !isEditing && (
                            <span className="px-3 py-1 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 text-xs font-semibold rounded-full">View Only</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {reportId && !isEditing ? (
                        <Button onClick={() => setIsEditing(true)} size="sm" className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 font-bold shadow-sm">
                            Edit Report
                        </Button>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 mr-4 border-r dark:border-slate-700 pr-4">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] font-bold h-8 uppercase tracking-wider text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 gap-2"
                                    onClick={() => downloadJsonTemplate(reportTemplate, `${ticker}_${reportType}_Template.json`, {
                                        ticker,
                                        fiscal_year: fiscalYear,
                                        report_type: reportType,
                                        quarter: reportType === 'QUARTERLY' ? quarter : undefined,
                                        template_id: reportTemplate
                                    })}
                                >
                                    <Download size={14} />
                                    Download Template
                                </Button>

                                <div className="relative">
                                    <input
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        id="json-upload"
                                        onChange={handleFileUpload}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        asChild
                                        className="text-[10px] font-bold h-8 uppercase tracking-wider text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 gap-2 cursor-pointer"
                                    >
                                        <label htmlFor="json-upload">
                                            <Upload size={14} />
                                            Upload JSON
                                        </label>
                                    </Button>
                                </div>
                            </div>
                            {reportId && (
                                <Button variant="outline" onClick={() => setIsEditing(false)} size="sm" className="font-semibold text-gray-600 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800">
                                    Cancel
                                </Button>
                            )}
                            <Button onClick={handleSave} disabled={saving} size="sm" className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 font-bold gap-2 min-w-[120px] shadow-sm">
                                {saving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Scrollable Form Content - Compact Full Width */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 w-full">
                {/* Granular Data Tabs - Compact */}
                <Tabs defaultValue="bs" className="w-full">
                    <TabsList className="bg-white dark:bg-card p-1 rounded-xl h-10 border dark:border-slate-800 inline-flex shadow-sm mb-2">
                        <TabsTrigger value="bs" className="px-6 rounded-lg data-[state=active]:bg-gray-100 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-orange-500 dark:data-[state=active]:text-orange-500 font-bold text-sm uppercase tracking-wider dark:text-slate-500">
                            Balance Sheet
                        </TabsTrigger>
                        <TabsTrigger value="pl" className="px-6 rounded-lg data-[state=active]:bg-gray-100 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-orange-500 dark:data-[state=active]:text-orange-500 font-bold text-sm uppercase tracking-wider dark:text-slate-500">
                            Profit & Loss
                        </TabsTrigger>
                        {template.sections.cash_flow && (
                            <TabsTrigger value="cf" className="px-6 rounded-lg data-[state=active]:bg-gray-100 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-orange-500 dark:data-[state=active]:text-orange-500 font-bold text-sm uppercase tracking-wider dark:text-slate-500">
                                Cash Flow
                            </TabsTrigger>
                        )}
                        {reportType === 'ANNUAL' && (
                            <TabsTrigger value="dividend" className="px-6 rounded-lg data-[state=active]:bg-gray-100 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-orange-500 dark:data-[state=active]:text-orange-500 font-bold text-sm uppercase tracking-wider dark:text-slate-500">
                                Dividend
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <TabsContent value="bs" className="mt-0 space-y-2 animate-in fade-in duration-300">
                        {template.sections.balance_sheet.map(section => (
                            <div key={section.key} className="bg-white dark:bg-card rounded-2xl border dark:border-slate-800 shadow-sm p-4 pt-4 overflow-hidden">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-1 h-5 bg-blue-500 rounded-full" />
                                    <h4 className="text-sm font-semibold uppercase text-gray-900 dark:text-slate-100 tracking-wider">{section.label}</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-1">
                                    {section.particulars.map(p => (
                                        <div key={p.key} className="flex items-center justify-between gap-6 py-0.5 group">
                                            <div className="flex-1">
                                                <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                                    {p.label}
                                                </Label>
                                                {p.description && <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{p.description}</p>}
                                            </div>
                                            <div className="relative w-40">
                                                {isEditing ? (
                                                    <Input
                                                        className="h-10 text-right font-mono text-sm focus:ring-blue-500 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 dark:text-slate-100"
                                                        value={balanceSheet[`${section.key}.${p.key}`] || ''}
                                                        onChange={(e) => setBalanceSheet(prev => ({ ...prev, [`${section.key}.${p.key}`]: e.target.value }))}
                                                        onBlur={(e) => {
                                                            const formatted = formatInputValue(e.target.value);
                                                            setBalanceSheet(prev => ({ ...prev, [`${section.key}.${p.key}`]: formatted }));
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="h-10 px-3 flex items-center justify-end text-right font-mono text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/50 rounded-md border border-gray-200 dark:border-slate-700">
                                                        {balanceSheet[`${section.key}.${p.key}`] || '-'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </TabsContent>

                    <TabsContent value="pl" className="mt-0 space-y-2 animate-in fade-in duration-300">
                        {/* Report Identity (Editable Only) - Compact 3 Columns */}
                        {(!reportId && !initialData?.fiscalYear) && (
                            <div className="bg-white dark:bg-card rounded-2xl border dark:border-slate-800 shadow-sm p-4 pt-4 overflow-hidden">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-1 h-5 bg-blue-500 rounded-full" />
                                    <h4 className="text-sm font-semibold uppercase text-gray-900 dark:text-slate-100 tracking-wider">Report Identity</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-1">
                                    <div className="flex items-center justify-between gap-6 py-0.5 group">
                                        <div className="flex-1">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">Fiscal Year</Label>
                                        </div>
                                        <div className="relative w-40">
                                            <Input
                                                placeholder="e.g. 081/82"
                                                value={fiscalYear}
                                                onChange={(e) => setFiscalYear(e.target.value)}
                                                className="h-9 text-right font-mono text-xs border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-slate-100 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-6 py-0.5 group">
                                        <div className="flex-1">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">Report Type</Label>
                                        </div>
                                        <div className="relative w-40">
                                            <Select value={reportType} onValueChange={setReportType}>
                                                <SelectTrigger className="h-9 font-mono text-xs border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="dark:bg-card dark:border-slate-800">
                                                    <SelectItem value="QUARTERLY" className="dark:text-slate-300 dark:focus:bg-slate-800">Quarterly</SelectItem>
                                                    <SelectItem value="ANNUAL" className="dark:text-slate-300 dark:focus:bg-slate-800">Annual</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-6 py-0.5 group">
                                        <div className="flex-1">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                                {reportType === 'QUARTERLY' ? 'Quarter' : 'Status'}
                                            </Label>
                                        </div>
                                        <div className="relative w-40 flex justify-end">
                                            {reportType === 'QUARTERLY' ? (
                                                <Select value={quarter} onValueChange={setQuarter}>
                                                    <SelectTrigger className="h-9 font-mono text-xs border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="dark:bg-card dark:border-slate-800">
                                                        <SelectItem value="1" className="dark:text-slate-300">Q1</SelectItem>
                                                        <SelectItem value="2" className="dark:text-slate-300">Q2</SelectItem>
                                                        <SelectItem value="3" className="dark:text-slate-300">Q3</SelectItem>
                                                        <SelectItem value="4" className="dark:text-slate-300">Q4</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <Checkbox
                                                        id="audited-top"
                                                        checked={isAudited}
                                                        onCheckedChange={(c) => setIsAudited(c as boolean)}
                                                        className="h-4 w-4 data-[state=checked]:bg-amber-600 border-gray-300 dark:border-slate-700"
                                                    />
                                                    <label htmlFor="audited-top" className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase cursor-pointer">Audited</label>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Quarterly Selection (Editable Only) */}
                        {(!reportId && !initialData?.fiscalYear && reportType === 'QUARTERLY') && (
                            <div className="bg-blue-50/30 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-4 mb-2 flex items-center justify-between">
                                <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Select Quarter for Unaudited Report</span>
                                <Tabs value={quarter} onValueChange={setQuarter} className="h-8">
                                    <TabsList className="bg-white dark:bg-slate-800 border dark:border-slate-700 h-8">
                                        <TabsTrigger value="1" className="text-[10px] px-3">Q1</TabsTrigger>
                                        <TabsTrigger value="2" className="text-[10px] px-3">Q2</TabsTrigger>
                                        <TabsTrigger value="3" className="text-[10px] px-3">Q3</TabsTrigger>
                                        <TabsTrigger value="4" className="text-[10px] px-3">Q4</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                        )}

                        {/* Key Metrics - Compact 3 Columns */}
                        <div className="bg-white dark:bg-card rounded-2xl border dark:border-slate-800 shadow-sm p-4 pt-4 overflow-hidden">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-1 h-5 bg-indigo-500 rounded-full" />
                                <h4 className="text-sm font-semibold uppercase text-gray-900 dark:text-slate-100 tracking-wider">Key Metrics</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-1">
                                {[
                                    { label: 'Total Revenue', value: revenue, onChange: setRevenue, suffix: 'Rs' },
                                    { label: 'Net Profit', value: netProfit, onChange: setNetProfit, suffix: 'Rs' },
                                    { label: 'EPS', value: eps, onChange: setEps }
                                ].map((item, idx) => (
                                    <div key={item.label} className="flex items-center justify-between gap-6 py-0.5 group">
                                        <div className="flex-1">
                                            <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                                {item.label}
                                            </Label>
                                        </div>
                                        <div className="relative w-40">
                                            <Input
                                                type="number"
                                                step={item.label.includes('EPS') ? '0.01' : '1'}
                                                className="h-9 text-right font-mono text-xs focus:ring-indigo-500 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-slate-100"
                                                value={item.value}
                                                onChange={(e) => item.onChange(e.target.value)}
                                            />
                                            {item.suffix && (
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-300 dark:text-slate-600 pointer-events-none">
                                                    {item.suffix}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Report Status (Annual Only) - Compact */}
                        {(reportType === 'ANNUAL' && (reportId || initialData?.fiscalYear)) && (
                            <div className="bg-white dark:bg-card rounded-2xl border dark:border-slate-800 shadow-sm p-4 overflow-hidden flex flex-col justify-center">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-1 h-5 bg-amber-500 rounded-full" />
                                    <h4 className="text-sm font-semibold uppercase text-gray-900 dark:text-slate-100 tracking-wider">Report Status</h4>
                                </div>
                                <label className="flex items-center justify-between gap-6 pb-1 cursor-pointer group">
                                    <span className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors">Mark as Audited Report</span>
                                    <div className="w-40 flex justify-end">
                                        <Checkbox
                                            checked={isAudited}
                                            onCheckedChange={(c) => setIsAudited(c as boolean)}
                                            className="h-5 w-5 data-[state=checked]:bg-amber-600 border-gray-300 dark:border-slate-700"
                                        />
                                    </div>
                                </label>
                            </div>
                        )}
                        {template.sections.profit_loss.map(section => (
                            <div key={section.key} className="bg-white dark:bg-card rounded-2xl border dark:border-slate-800 shadow-sm p-4 pt-4 overflow-hidden">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-1 h-5 bg-indigo-500 rounded-full" />
                                    <h4 className="text-sm font-semibold uppercase text-gray-900 dark:text-slate-100 tracking-wider">{section.label}</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-1">
                                    {section.particulars.map(p => (
                                        <div key={p.key} className="flex items-center justify-between gap-6 py-0.5 group">
                                            <div className="flex-1">
                                                <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                                    {p.label}
                                                </Label>
                                            </div>
                                            <div className="relative w-40">
                                                {isEditing ? (
                                                    <Input
                                                        className="h-9 text-right font-mono text-xs focus:ring-indigo-500 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-slate-100"
                                                        value={profitLoss[`${section.key}.${p.key}`] || ''}
                                                        onChange={(e) => setProfitLoss(prev => ({ ...prev, [`${section.key}.${p.key}`]: e.target.value }))}
                                                        onBlur={(e) => {
                                                            // Don't format REGULATORY fields - they're percentages/small numbers
                                                            if (section.key === 'REGULATORY') return;
                                                            const formatted = formatInputValue(e.target.value);
                                                            setProfitLoss(prev => ({ ...prev, [`${section.key}.${p.key}`]: formatted }));
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="h-9 px-3 flex items-center justify-end text-right font-mono text-xs text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/50 rounded-md border border-gray-200 dark:border-slate-700">
                                                        {profitLoss[`${section.key}.${p.key}`] || '-'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </TabsContent>

                    <TabsContent value="cf" className="mt-0 space-y-2 animate-in fade-in duration-300">
                        {template.sections.cash_flow?.map(section => (
                            <div key={section.key} className="bg-white dark:bg-card rounded-2xl border dark:border-slate-800 shadow-sm p-4 pt-4 overflow-hidden">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                                    <h4 className="text-sm font-semibold uppercase text-gray-900 dark:text-slate-100 tracking-wider">{section.label}</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-1">
                                    {section.particulars.map(p => (
                                        <div key={p.key} className="flex items-center justify-between gap-6 py-0.5 group">
                                            <div className="flex-1">
                                                <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                                    {p.label}
                                                </Label>
                                            </div>
                                            <div className="relative w-40">
                                                {isEditing ? (
                                                    <Input
                                                        className="h-9 text-right font-mono text-xs focus:ring-emerald-500 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-slate-100"
                                                        value={cashFlow[`${section.key}.${p.key}`] || ''}
                                                        onChange={(e) => setCashFlow(prev => ({ ...prev, [`${section.key}.${p.key}`]: e.target.value }))}
                                                        onBlur={(e) => {
                                                            const formatted = formatInputValue(e.target.value);
                                                            setCashFlow(prev => ({ ...prev, [`${section.key}.${p.key}`]: formatted }));
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="h-9 px-3 flex items-center justify-end text-right font-mono text-xs text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/50 rounded-md border border-gray-200 dark:border-slate-700">
                                                        {cashFlow[`${section.key}.${p.key}`] || '-'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </TabsContent>

                    <TabsContent value="dividend" className="mt-0 space-y-2 animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-card rounded-2xl border dark:border-slate-800 shadow-sm p-4 pt-4 overflow-hidden">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-1 h-5 bg-green-500 rounded-full" />
                                <h4 className="text-sm font-semibold uppercase text-gray-900 dark:text-slate-100 tracking-wider">Dividend Information</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-1">
                                <div className="flex items-center justify-between gap-6 py-0.5 group">
                                    <div className="flex-1">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                            Bonus Share (%)
                                        </Label>
                                    </div>
                                    <div className="relative w-40">
                                        {isEditing ? (
                                            <Input
                                                className="h-10 text-right font-mono text-sm focus:ring-green-500 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 dark:text-slate-100"
                                                value={bonusShare}
                                                onChange={(e) => setBonusShare(e.target.value)}
                                                placeholder="%"
                                            />
                                        ) : (
                                            <div className="h-10 px-3 flex items-center justify-end text-right font-mono text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/50 rounded-md border border-gray-200 dark:border-slate-700">
                                                {bonusShare ? `${bonusShare}%` : '-'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-6 py-0.5 group">
                                    <div className="flex-1">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                            Cash Dividend (%)
                                        </Label>
                                    </div>
                                    <div className="relative w-40">
                                        {isEditing ? (
                                            <Input
                                                className="h-10 text-right font-mono text-sm focus:ring-green-500 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 dark:text-slate-100"
                                                value={cashDividend}
                                                onChange={(e) => setCashDividend(e.target.value)}
                                                placeholder="%"
                                            />
                                        ) : (
                                            <div className="h-10 px-3 flex items-center justify-end text-right font-mono text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/50 rounded-md border border-gray-200 dark:border-slate-700">
                                                {cashDividend ? `${cashDividend}%` : '-'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-6 py-0.5 group">
                                    <div className="flex-1">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                            Announced Date
                                        </Label>
                                    </div>
                                    <div className="relative w-40">
                                        {isEditing ? (
                                            <Input
                                                type="date"
                                                className="h-10 text-right font-mono text-sm focus:ring-green-500 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 dark:text-slate-100 dark:[color-scheme:dark]"
                                                value={announcedDate}
                                                onChange={(e) => setAnnouncedDate(e.target.value)}
                                            />
                                        ) : (
                                            <div className="h-10 px-3 flex items-center justify-end text-right font-mono text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/50 rounded-md border border-gray-200 dark:border-slate-700">
                                                {announcedDate || '-'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-6 py-0.5 group">
                                    <div className="flex-1">
                                        <Label className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                                            Book Close Date
                                        </Label>
                                    </div>
                                    <div className="relative w-40">
                                        {isEditing ? (
                                            <Input
                                                type="date"
                                                className="h-10 text-right font-mono text-sm focus:ring-green-500 bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 dark:text-slate-100 dark:[color-scheme:dark]"
                                                value={bookCloseDate}
                                                onChange={(e) => setBookCloseDate(e.target.value)}
                                            />
                                        ) : (
                                            <div className="h-10 px-3 flex items-center justify-end text-right font-mono text-sm text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-800/50 rounded-md border border-gray-200 dark:border-slate-700">
                                                {bookCloseDate || '-'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
