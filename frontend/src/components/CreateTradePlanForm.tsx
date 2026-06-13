'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { CompanySelect } from '@/components/CompanySelect';

interface LegInput {
  leg_number: number;
  entry_price: string;
  allocation_pct: string;
  stop_loss_price: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTradePlanForm({ onClose, onCreated }: Props) {
  const [ticker, setTicker] = useState('');
  const [accountId, setAccountId] = useState<string>('');
  const [riskBudget, setRiskBudget] = useState('2.00');
  const [targetPrice, setTargetPrice] = useState('');
  const [thesis, setThesis] = useState('');
  const [legs, setLegs] = useState<LegInput[]>([
    { leg_number: 1, entry_price: '', allocation_pct: '', stop_loss_price: '' },
  ]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/stocks/accounts/').then(r => setAccounts(r.data)).catch(() => {});
  }, []);

  const totalAllocation = legs.reduce((sum, l) => sum + (parseFloat(l.allocation_pct) || 0), 0);
  const allocationValid = Math.abs(totalAllocation - 100) < 0.01;

  const addLeg = () => {
    if (legs.length >= 5) return;
    setLegs(prev => [...prev, { leg_number: prev.length + 1, entry_price: '', allocation_pct: '', stop_loss_price: '' }]);
  };

  const removeLeg = (index: number) => {
    setLegs(prev => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, leg_number: i + 1 })));
  };

  const updateLeg = (index: number, field: keyof LegInput, value: string) => {
    setLegs(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const handleSubmit = async () => {
    setError('');
    if (!ticker) { setError('Ticker is required.'); return; }
    if (!allocationValid) { setError(`Leg allocations must sum to 100%. Current total: ${totalAllocation.toFixed(2)}%`); return; }

    const hasInvalidStopLoss = legs.some(l => {
      if (!l.entry_price && l.stop_loss_price) return true; // stop set but no entry
      if (l.stop_loss_price && l.entry_price && parseFloat(l.stop_loss_price) >= parseFloat(l.entry_price)) return true;
      return false;
    });
    if (hasInvalidStopLoss) { setError('Stop loss must be below entry price for each leg.'); return; }

    setLoading(true);
    try {
      await api.post('/api/stocks/trade-plans/', {
        ticker,
        account: accountId || null,
        risk_budget_pct: riskBudget,
        target_price: targetPrice || null,
        thesis: thesis || null,
        legs: legs.map(l => ({
          leg_number: l.leg_number,
          price_target: l.entry_price,
          allocation_pct: l.allocation_pct,
          stop_loss_price: l.stop_loss_price,
        })),
      });
      onCreated();
    } catch (err: any) {
      const data = err.response?.data;
      if (data) {
        if (data.legs) {
          setError(Array.isArray(data.legs) ? data.legs[0] : JSON.stringify(data.legs));
        } else if (data.error) {
          setError(data.error);
        } else if (data.detail) {
          setError(data.detail);
        } else if (data.non_field_errors) {
          setError(Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors);
        } else {
          const firstValue = Object.values(data)[0];
          setError(Array.isArray(firstValue) ? (firstValue as string[])[0] : String(firstValue || 'Failed to create plan.'));
        }
      } else {
        setError('Failed to create plan. Please check your inputs.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Trade Plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Ticker *</label>
              <CompanySelect value={ticker} onChange={setTicker} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Account</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
              >
                <option value="">No account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Risk budget (%)</label>
              <Input type="number" step="0.1" value={riskBudget} onChange={e => setRiskBudget(e.target.value)} placeholder="2.00" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Target price (optional)</label>
              <Input type="number" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="e.g. 1400" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Thesis (optional)</label>
            <textarea
              value={thesis}
              onChange={e => setThesis(e.target.value)}
              rows={2}
              placeholder="Why are you entering this trade?"
              className="w-full bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Legs
                <span className={`ml-2 text-xs font-bold ${allocationValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {totalAllocation.toFixed(2)}% / 100%
                </span>
              </label>
              {legs.length < 5 && (
                <Button variant="outline" size="sm" onClick={addLeg} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add leg
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[32px_1fr_1fr_1fr_32px] gap-2 text-xs text-slate-400 uppercase tracking-wide px-2">
                <span>#</span><span>Entry price</span><span>Allocation %</span><span>Stop loss</span><span />
              </div>
              {legs.map((leg, i) => (
                <div key={leg.leg_number} className="grid grid-cols-[32px_1fr_1fr_1fr_32px] gap-2 items-center">
                  <span className="text-xs text-slate-500 font-bold text-center">{leg.leg_number}</span>
                  <Input type="number" value={leg.entry_price} onChange={e => updateLeg(i, 'entry_price', e.target.value)} placeholder="1200.00" />
                  <Input type="number" value={leg.allocation_pct} onChange={e => updateLeg(i, 'allocation_pct', e.target.value)} placeholder="40" />
                  <Input type="number" value={leg.stop_loss_price} onChange={e => updateLeg(i, 'stop_loss_price', e.target.value)} placeholder="1140.00" />
                  <button onClick={() => removeLeg(i)} disabled={legs.length === 1} className="text-slate-400 hover:text-red-500 disabled:opacity-20">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !ticker || !allocationValid}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? 'Creating…' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
