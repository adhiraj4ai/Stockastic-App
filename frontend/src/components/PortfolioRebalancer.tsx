'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatRupees } from '@/lib/formatters';
import { RefreshCcw, Save, AlertCircle, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { toast } from 'sonner';

interface RebalanceSuggestion {
  ticker: string;
  current_value: number;
  target_value: number;
  current_percentage: number;
  target_percentage: number;
  suggested_quantity: number;
  suggested_amount: number;
  action: 'BUY' | 'SELL' | 'HOLD';
}

interface PortfolioRebalancerProps {
  accountId: string;
  totalPortfolioValue: number;
}

export const PortfolioRebalancer: React.FC<PortfolioRebalancerProps> = ({ accountId, totalPortfolioValue }) => {
  const [suggestions, setSuggestions] = useState<RebalanceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/stocks/portfolio/rebalance_suggestions/', {
        params: { account: accountId }
      });
      setSuggestions(response.data.suggestions);
    } catch (err) {
      console.error('Failed to fetch rebalance suggestions:', err);
      toast.error('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, [accountId]);

  const handleUpdateTarget = async (ticker: string, newTarget: number) => {
    if (newTarget < 0 || newTarget > 100) return;
    
    // Find item ID first (suggestions only has ticker)
    // We might need to update the endpoint to return ID or handle by ticker
    // Assuming backend can handle PATCH by ticker or we find id from other sources.
    // Let's use the ticker-based update if available or fetch items.
    
    setSaving(ticker);
    try {
      // Find the portfolio item ID for this ticker in this account
      const itemsResponse = await api.get('/api/stocks/portfolio/', {
        params: { account: accountId }
      });
      const item = itemsResponse.data.find((i: any) => i.ticker === ticker);
      
      if (item) {
        await api.patch(`/api/stocks/portfolio/${item.id}/`, {
          target_allocation_pct: newTarget
        });
        toast.success(`Updated target for ${ticker}`);
        fetchSuggestions();
      }
    } catch (err) {
      console.error('Failed to update target:', err);
      toast.error('Update failed');
    } finally {
      setSaving(null);
    }
  };

  const totalTargetPct = suggestions.reduce((sum, s) => sum + s.target_percentage, 0);

  return (
    <Card className="shadow-sm border-gray-200 dark:border-slate-800 dark:bg-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2 dark:text-slate-100">
          <Target className="h-5 w-5 text-blue-500" />
          Portfolio Rebalancer
        </CardTitle>
        <div className="flex items-center gap-4">
          <div className={`text-xs font-bold px-3 py-1.5 rounded-full ${totalTargetPct > 100 ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
            Total Target: {totalTargetPct.toFixed(1)}%
          </div>
          <button 
            onClick={fetchSuggestions}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {suggestions.length === 0 && !loading ? (
          <div className="text-center py-10 text-gray-500">
            <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p>No holdings with target allocations found.</p>
            <p className="text-xs mt-1">Set a target allocation % for your holdings to see suggestions.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50 dark:bg-slate-800/50">
                <TableHead className="font-bold">Ticker</TableHead>
                <TableHead className="font-bold">Current Allocation</TableHead>
                <TableHead className="font-bold">Target Allocation (%)</TableHead>
                <TableHead className="font-bold">Suggested Action</TableHead>
                <TableHead className="font-bold text-right">Quantity</TableHead>
                <TableHead className="font-bold text-right">Est. Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((s) => (
                <TableRow key={s.ticker} className="hover:bg-gray-50/30 dark:hover:bg-slate-800/30">
                  <TableCell className="font-bold">{s.ticker}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium w-10">{s.current_percentage.toFixed(1)}%</span>
                      <div className="w-20 h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(s.current_percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="h-8 w-20 text-xs font-bold"
                        defaultValue={s.target_percentage}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (val !== s.target_percentage) {
                            handleUpdateTarget(s.ticker, val);
                          }
                        }}
                      />
                      {saving === s.ticker && <RefreshCcw className="h-3 w-3 animate-spin text-blue-500" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={
                      s.action === 'BUY' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      s.action === 'SELL' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-400'
                    }>
                      {s.action === 'BUY' ? <TrendingUp className="h-3 w-3 mr-1" /> : 
                       s.action === 'SELL' ? <TrendingDown className="h-3 w-3 mr-1" /> : null}
                      {s.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {s.suggested_quantity === 0 ? '-' : Math.abs(s.suggested_quantity)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {s.suggested_amount === 0 ? '-' : formatRupees(Math.abs(s.suggested_amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
