'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import api from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageLoader } from '@/components/ui/StockLoader';
import TransactionModal from './TransactionModal';
import { ExitDialogHeader } from '@/components/exit/ExitDialogHeader';
import { PlanTab } from '@/components/exit/PlanTab';
import { TransactionsTab } from '@/components/exit/TransactionsTab';
import { DailySignalStatus } from '@/components/signals/DailySignalStatus';
import { useExitStrategy } from '@/hooks/useExitStrategy';
import type { PortfolioItem } from '@/components/PortfolioTable';

const MANUAL = 'MANUAL';

interface ExitStrategyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    portfolioItem: PortfolioItem;
    onSave: () => void;
    accounts: unknown[];
}

type FormField = 'sl' | 'tp' | 'tp2' | 'tp3' | 'thesis';

export function ExitStrategyDialog({ open, onOpenChange, portfolioItem, onSave, accounts }: ExitStrategyDialogProps) {
    const { loading, strategies, healthWarnings, currentPrice, wacc, isUnderwater, transactions, defaults, refresh } =
        useExitStrategy(portfolioItem, open);

    const [sl, setSl] = useState('');
    const [tp, setTp] = useState('');
    const [tp2, setTp2] = useState('');
    const [tp3, setTp3] = useState('');
    const [thesis, setThesis] = useState('');
    const [selectedStrategy, setSelectedStrategy] = useState(MANUAL);
    const [saving, setSaving] = useState(false);
    const [transactionToEdit, setTransactionToEdit] = useState<unknown>(null);

    useEffect(() => {
        setSl(defaults.sl);
        setTp(defaults.tp);
        setTp2(defaults.tp2);
        setTp3(defaults.tp3);
    }, [defaults]);

    useEffect(() => {
        if (open && portfolioItem) {
            setThesis(portfolioItem.thesis ?? '');
            setSelectedStrategy(portfolioItem.strategy_type ?? MANUAL);
        }
    }, [open, portfolioItem]);

    const onField = (field: FormField, value: string) => {
        if (field === 'sl') setSl(value);
        else if (field === 'tp') setTp(value);
        else if (field === 'tp2') setTp2(value);
        else if (field === 'tp3') setTp3(value);
        else setThesis(value);
        if (field !== 'thesis') setSelectedStrategy(MANUAL);
    };

    const onApplyStrategy = (key: string) => {
        const s = strategies[key];
        if (!s) return;
        setSl(s.sl.toFixed(2));
        setTp(s.tp.toFixed(2));
        setTp2(s.tp2 ? s.tp2.toFixed(2) : '');
        setTp3(s.tp3 ? s.tp3.toFixed(2) : '');
        setSelectedStrategy(key);
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
                thesis,
                strategy_type: selectedStrategy,
            });
            onSave();
            onOpenChange(false);
        } catch (err) {
            console.error('Failed to save exit strategy', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this transaction?')) return;
        try {
            await api.delete(`/api/stocks/transactions/${id}/`);
            refresh();
        } catch (err) {
            console.error('Failed to delete transaction', err);
            alert('Failed to delete transaction');
        }
    };

    const handleClose = () => onOpenChange(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="w-[90vw] h-[90vh] max-w-none sm:max-w-none p-0 overflow-hidden border-none bg-transparent shadow-none font-sans"
            >
                <Tabs defaultValue="plan" className="flex flex-col bg-white dark:bg-card h-full rounded-[2rem] shadow-sm overflow-hidden">
                    <ExitDialogHeader
                        item={portfolioItem}
                        currentPrice={currentPrice}
                        wacc={wacc}
                        isUnderwater={isUnderwater}
                        onClose={handleClose}
                    >
                        <TabsList className="mt-4 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-xl border border-border dark:border-slate-700/50 h-10 shrink-0">
                            <TabsTrigger value="plan" className="px-6 py-1.5 text-[11px] font-bold tracking-tight h-full">Plan</TabsTrigger>
                            <TabsTrigger value="transactions" className="px-6 py-1.5 text-[11px] font-bold tracking-tight h-full">Transactions</TabsTrigger>
                            <TabsTrigger value="analysis" className="px-6 py-1.5 text-[11px] font-bold tracking-tight h-full">Analysis</TabsTrigger>
                        </TabsList>
                    </ExitDialogHeader>

                    <div className="flex-1 overflow-hidden">
                        {loading ? (
                            <div className="p-10"><PageLoader /></div>
                        ) : (
                            <>
                                <TabsContent value="plan" forceMount className="h-full data-[state=inactive]:hidden overflow-y-auto no-scrollbar px-6 py-4 pb-12 focus-visible:ring-0">
                                    <PlanTab
                                        strategies={strategies}
                                        healthWarnings={healthWarnings}
                                        currentPrice={currentPrice}
                                        wacc={wacc}
                                        sl={sl}
                                        tp={tp}
                                        tp2={tp2}
                                        tp3={tp3}
                                        thesis={thesis}
                                        selectedStrategy={selectedStrategy}
                                        onApplyStrategy={onApplyStrategy}
                                        onField={onField}
                                    />
                                </TabsContent>

                                <TabsContent value="transactions" forceMount className="h-full data-[state=inactive]:hidden overflow-y-auto no-scrollbar px-6 py-4 focus-visible:ring-0">
                                    <TransactionsTab
                                        transactions={transactions}
                                        onEdit={t => setTransactionToEdit(t)}
                                        onDelete={handleDelete}
                                    />
                                </TabsContent>

                                <TabsContent value="analysis" forceMount className="flex-1 w-full h-full overflow-hidden focus-visible:ring-0 data-[state=inactive]:hidden">
                                    <div className="h-full rounded-[2rem] overflow-hidden border border-border dark:border-slate-800 shadow-inner bg-slate-50/30 dark:bg-card/30">
                                        <DailySignalStatus
                                            symbol={portfolioItem?.ticker}
                                            cmp={currentPrice}
                                            entryPrice={wacc}
                                            strength={75}
                                            direction="BUY"
                                            targetPrice={tp ? parseFloat(tp) : undefined}
                                            stopLoss={sl ? parseFloat(sl) : undefined}
                                            tp1={tp ? parseFloat(tp) : undefined}
                                            tp2={tp2 ? parseFloat(tp2) : undefined}
                                            tp3={tp3 ? parseFloat(tp3) : undefined}
                                            className="h-full border-none shadow-none"
                                            hideHeader={true}
                                        />
                                    </div>
                                </TabsContent>
                            </>
                        )}
                    </div>

                    <div className="bg-slate-50/80 dark:bg-slate-800/80 p-3 px-8 border-t border-border dark:border-slate-700 flex justify-end items-center gap-3">
                        <Button
                            variant="ghost"
                            onClick={handleClose}
                            className="font-bold text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 px-6 tracking-tight text-[11px] h-9 rounded-lg"
                        >
                            Discard changes
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 h-9 rounded-lg font-bold shadow-md shadow-primary/10 transition-all hover:scale-[1.01] active:scale-[0.99]"
                        >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                            <span className="tracking-tight text-[11px]">Commit strategy</span>
                        </Button>
                    </div>
                </Tabs>

                {transactionToEdit && (
                    <TransactionModal
                        isOpen={!!transactionToEdit}
                        onClose={() => setTransactionToEdit(null)}
                        onSuccess={() => {
                            setTransactionToEdit(null);
                            refresh();
                        }}
                        transactionToEdit={transactionToEdit}
                        accounts={accounts}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
