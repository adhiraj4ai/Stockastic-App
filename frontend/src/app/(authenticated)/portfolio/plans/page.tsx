'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, X, Layers } from 'lucide-react';
import api from '@/lib/api';
import { CreateTradePlanForm } from '@/components/CreateTradePlanForm';
import { TradePlanDrawer } from '@/components/TradePlanDrawer';

export const dynamic = 'force-dynamic';

export type LegStatus = 'PENDING' | 'EXECUTED' | 'SKIPPED';
export type PlanStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export interface TradePlanLeg {
  id: number;
  leg_number: number;
  price_target: string;
  allocation_pct: string;
  stop_loss_price: string;
  status: LegStatus;
  transaction: number | null;
  notes: string | null;
}

export interface TradePlan {
  id: number;
  ticker: string;
  account: number | null;
  thesis: string | null;
  risk_budget_pct: string;
  target_price: string | null;
  status: PlanStatus;
  created_at: string;
  legs: TradePlanLeg[];
  total_allocated_pct: number;
  executed_legs: number;
  total_legs: number;
  per_leg_risk_pct: number;
}

const STATUS_COLORS: Record<PlanStatus, string> = {
  OPEN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  CLOSED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function TradePlansPage() {
  const [plans, setPlans] = useState<TradePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TradePlan | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await api.get(`/api/stocks/trade-plans/${params}`);
      setPlans(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleCancel = async (plan: TradePlan) => {
    if (!confirm(`Cancel the plan for ${plan.ticker}?`)) return;
    await api.delete(`/api/stocks/trade-plans/${plan.id}/`);
    fetchPlans();
  };

  const handlePlanUpdated = (updated: TradePlan) => {
    setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedPlan(updated);
  };

  return (
    <DashboardLayout title="Trade Plans" subtitle="Multi-leg staged entry planning">
      <div className="space-y-6">
        {/* Header bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2">
            {(['OPEN', 'CLOSED', 'CANCELLED', 'ALL'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
                  statusFilter === s
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <Button onClick={() => setShowCreateForm(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Trade Plan
          </Button>
        </div>

        {/* Plans table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {statusFilter === 'ALL' ? 'All Plans' : `${statusFilter} Plans`} — {plans.length} total
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-sm">Loading plans…</div>
            ) : plans.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No {statusFilter.toLowerCase()} trade plans yet.</p>
                <p className="text-xs mt-1">Create one to plan a staged entry.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left py-3 pr-4 font-semibold">Ticker</th>
                      <th className="text-left py-3 pr-4 font-semibold">Progress</th>
                      <th className="text-left py-3 pr-4 font-semibold">Risk budget</th>
                      <th className="text-left py-3 pr-4 font-semibold">Status</th>
                      <th className="text-left py-3 pr-4 font-semibold">Thesis</th>
                      <th className="text-left py-3 pr-4 font-semibold">Created</th>
                      <th className="text-right py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map(plan => (
                      <tr
                        key={plan.id}
                        className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                        onClick={() => setSelectedPlan(plan)}
                      >
                        <td className="py-3 pr-4 font-bold text-slate-900 dark:text-slate-100">
                          {plan.ticker}
                        </td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                          {plan.executed_legs} / {plan.total_legs} legs
                        </td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                          {plan.risk_budget_pct}%
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[plan.status]}`}>
                            {plan.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-500 max-w-[200px] truncate">
                          {plan.thesis || '—'}
                        </td>
                        <td className="py-3 pr-4 text-slate-500 text-xs">
                          {new Date(plan.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedPlan(plan)}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            {plan.status === 'OPEN' && (
                              <Button variant="ghost" size="sm" onClick={() => handleCancel(plan)}
                                className="text-red-500 hover:text-red-700">
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showCreateForm && (
        <CreateTradePlanForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => { setShowCreateForm(false); fetchPlans(); }}
        />
      )}

      {selectedPlan && (
        <TradePlanDrawer
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onUpdated={handlePlanUpdated}
        />
      )}
    </DashboardLayout>
  );
}
