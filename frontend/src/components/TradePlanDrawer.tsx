'use client';

import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Play, SkipForward } from 'lucide-react';
import api from '@/lib/api';
import { TradePlan, TradePlanLeg, LegStatus } from '@/app/(authenticated)/portfolio/plans/page';

interface Props {
  plan: TradePlan;
  onClose: () => void;
  onUpdated: (plan: TradePlan) => void;
}

const LEG_BADGE: Record<LegStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  EXECUTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  SKIPPED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function calcRR(leg: TradePlanLeg, targetPrice: string | null): string {
  if (!targetPrice) return '—';
  const entry = parseFloat(leg.price_target);
  const stop = parseFloat(leg.stop_loss_price);
  const target = parseFloat(targetPrice);
  if (entry <= stop || target <= entry) return '—';
  const ratio = (target - entry) / (entry - stop);
  return `1:${ratio.toFixed(1)}`;
}

export function TradePlanDrawer({ plan, onClose, onUpdated }: Props) {
  const [executingLeg, setExecutingLeg] = useState<TradePlanLeg | null>(null);
  const [execRate, setExecRate] = useState('');
  const [execQty, setExecQty] = useState('');
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState('');
  const [skipLoading, setSkipLoading] = useState<number | null>(null);

  const openExecuteModal = (leg: TradePlanLeg) => {
    setExecutingLeg(leg);
    setExecRate(leg.price_target);
    setExecQty('');
    setExecError('');
  };

  const handleExecute = async () => {
    if (!executingLeg) return;
    setExecLoading(true);
    setExecError('');
    try {
      const res = await api.post(`/api/stocks/trade-plans/${plan.id}/execute_leg/`, {
        leg_id: executingLeg.id,
        rate: parseFloat(execRate),
        quantity: parseInt(execQty),
      });
      onUpdated(res.data);
      setExecutingLeg(null);
    } catch (err: any) {
      setExecError(err.response?.data?.error || 'Execution failed.');
    } finally {
      setExecLoading(false);
    }
  };

  const handleSkip = async (leg: TradePlanLeg) => {
    setSkipLoading(leg.id);
    try {
      const res = await api.post(`/api/stocks/trade-plans/${plan.id}/skip_leg/`, { leg_id: leg.id });
      onUpdated(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSkipLoading(null);
    }
  };

  const executedAllocationPct = plan.legs
    .filter(l => l.status === 'EXECUTED')
    .reduce((sum, l) => sum + parseFloat(l.allocation_pct), 0);

  return (
    <>
      <Sheet open onOpenChange={open => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl font-bold">
              {plan.ticker}
              <span className="ml-3 text-sm font-normal text-slate-500">Trade Plan</span>
            </SheetTitle>
            {plan.thesis && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{plan.thesis}</p>
            )}
            <div className="flex gap-4 text-xs text-slate-500 mt-2">
              <span>Risk budget: <strong className="text-slate-800 dark:text-slate-200">{plan.risk_budget_pct}%</strong></span>
              {plan.target_price && <span>Target: <strong className="text-emerald-600">Rs. {parseFloat(plan.target_price).toLocaleString()}</strong></span>}
              <span>Progress: <strong className="text-slate-800 dark:text-slate-200">{plan.executed_legs} / {plan.total_legs} executed</strong></span>
            </div>
          </SheetHeader>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="text-left p-3 font-semibold">Leg</th>
                  <th className="text-right p-3 font-semibold">Entry target</th>
                  <th className="text-right p-3 font-semibold">Allocation</th>
                  <th className="text-right p-3 font-semibold">Stop loss</th>
                  <th className="text-right p-3 font-semibold">R/R</th>
                  <th className="text-center p-3 font-semibold">Status</th>
                  <th className="text-right p-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {plan.legs.map(leg => (
                  <tr key={leg.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">#{leg.leg_number}</td>
                    <td className="p-3 text-right font-mono text-slate-800 dark:text-slate-200">
                      Rs. {parseFloat(leg.price_target).toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-slate-600 dark:text-slate-400">{leg.allocation_pct}%</td>
                    <td className="p-3 text-right text-red-600 font-mono text-xs">
                      Rs. {parseFloat(leg.stop_loss_price).toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-slate-500 text-xs">{calcRR(leg, plan.target_price)}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEG_BADGE[leg.status]}`}>
                        {leg.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {leg.status === 'PENDING' && plan.status === 'OPEN' && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => openExecuteModal(leg)}>
                            <Play className="h-3 w-3" /> Execute
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-slate-400"
                            disabled={skipLoading === leg.id}
                            onClick={() => handleSkip(leg)}>
                            <SkipForward className="h-3 w-3" /> Skip
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm flex gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Executed allocation</p>
              <p className="font-bold text-slate-800 dark:text-slate-200">{executedAllocationPct.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Remaining legs</p>
              <p className="font-bold text-slate-800 dark:text-slate-200">
                {plan.legs.filter(l => l.status === 'PENDING').length}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Per-leg risk</p>
              <p className="font-bold text-slate-800 dark:text-slate-200">{plan.per_leg_risk_pct}%</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {executingLeg && (
        <Dialog open onOpenChange={open => !open && setExecutingLeg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Execute Leg #{executingLeg.leg_number} — {plan.ticker}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Execution rate (Rs.)
                </label>
                <Input
                  type="number"
                  value={execRate}
                  onChange={e => setExecRate(e.target.value)}
                  placeholder={executingLeg.price_target}
                />
                {execRate && Math.abs(parseFloat(execRate) - parseFloat(executingLeg.price_target)) / parseFloat(executingLeg.price_target) > 0.10 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    Rate deviates &gt;10% from planned target ({executingLeg.price_target})
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                  Quantity (shares)
                </label>
                <Input
                  type="number"
                  value={execQty}
                  onChange={e => setExecQty(e.target.value)}
                  placeholder="e.g. 50"
                />
              </div>
              {execError && (
                <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{execError}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExecutingLeg(null)}>Cancel</Button>
              <Button
                onClick={handleExecute}
                disabled={execLoading || !execRate || !execQty}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {execLoading ? 'Executing…' : 'Confirm execution'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
