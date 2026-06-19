import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import type { PortfolioItem } from '@/components/PortfolioTable';
import type { Transaction } from '@/components/exit/TransactionsTab';

export interface StrategyOption { name: string; sl: number; tp: number; tp2?: number | null; tp3?: number | null; desc: string; }
export interface HealthWarning { type: string; message: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; }
export interface ExitDefaults { sl: string; tp: string; tp2: string; tp3: string; }

const str = (v: number | null | undefined) => (v == null ? '' : v.toString());

function deriveDefaults(item: PortfolioItem, strategies: Record<string, StrategyOption>): ExitDefaults {
    if (!item.stop_loss_price && strategies.fixed) {
        const d = strategies.fixed;
        return { sl: d.sl.toFixed(2), tp: d.tp.toFixed(2), tp2: d.tp2 ? d.tp2.toFixed(2) : '', tp3: d.tp3 ? d.tp3.toFixed(2) : '' };
    }
    return { sl: str(item.stop_loss_price), tp: str(item.target_price), tp2: str(item.target_price_2), tp3: str(item.target_price_3) };
}

export function useExitStrategy(portfolioItem: PortfolioItem | null, open: boolean) {
    const [loading, setLoading] = useState(true);
    const [strategies, setStrategies] = useState<Record<string, StrategyOption>>({});
    const [healthWarnings, setHealthWarnings] = useState<HealthWarning[]>([]);
    const [currentPrice, setCurrentPrice] = useState(0);
    const [wacc, setWacc] = useState(0);
    const [isUnderwater, setIsUnderwater] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [defaults, setDefaults] = useState<ExitDefaults>({ sl: '', tp: '', tp2: '', tp3: '' });
    const [tick, setTick] = useState(0);

    const refresh = useCallback(() => setTick(t => t + 1), []);

    useEffect(() => {
        if (!open || !portfolioItem) return;
        let active = true;
        setLoading(true);
        api.get(`/api/stocks/portfolio/${portfolioItem.id}/suggest_exits/`)
            .then(res => {
                if (!active) return;
                const d = res.data;
                setStrategies(d.strategies || {});
                setHealthWarnings(d.health_warnings || []);
                setCurrentPrice(d.current_price);
                setWacc(d.wacc);
                setIsUnderwater(d.is_underwater);
                setTransactions(d.transactions || []);
                setDefaults(deriveDefaults(portfolioItem, d.strategies || {}));
            })
            .catch(err => console.error('Failed to fetch exit suggestions', err))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [open, portfolioItem, tick]);

    return { loading, strategies, healthWarnings, currentPrice, wacc, isUnderwater, transactions, defaults, refresh };
}
