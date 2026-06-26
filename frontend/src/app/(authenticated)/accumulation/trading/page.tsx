'use client';

import { useEffect, useReducer, useCallback } from 'react';
import api, { accumulationApi } from '@/lib/api';
import { CandidateTable } from '@/components/accumulation/CandidateTable';
import { PageLoader } from '@/components/ui/StockLoader';
import { PlaceTradeDialog } from './PlaceTradeDialog';
import { AccountSelector } from './AccountSelector';
import type { AccumulationCandidate } from '@/types/accumulation-trading';
import type { PortfolioAccount } from '@/components/TransactionModal';

const PAPER_TYPE = 'PAPER';

interface PageState {
    accounts: PortfolioAccount[];
    selectedAccountId: number | null;
    candidates: AccumulationCandidate[];
    loading: boolean;
    selected: AccumulationCandidate | null;
}

type Action =
    | { type: 'INIT_DONE'; accounts: PortfolioAccount[]; accountId: number | null; candidates: AccumulationCandidate[] }
    | { type: 'CANDIDATES_DONE'; candidates: AccumulationCandidate[] }
    | { type: 'ACCOUNT_CHANGED'; accountId: number }
    | { type: 'SELECT'; candidate: AccumulationCandidate | null };

const initial: PageState = {
    accounts: [], selectedAccountId: null, candidates: [], loading: true, selected: null,
};

function reducer(state: PageState, action: Action): PageState {
    switch (action.type) {
        case 'INIT_DONE':
            return { ...state, accounts: action.accounts, selectedAccountId: action.accountId, candidates: action.candidates, loading: false };
        case 'ACCOUNT_CHANGED':
            return { ...state, selectedAccountId: action.accountId, loading: true };
        case 'CANDIDATES_DONE':
            return { ...state, candidates: action.candidates, loading: false };
        case 'SELECT':
            return { ...state, selected: action.candidate };
    }
}

async function fetchPaperAccounts(): Promise<PortfolioAccount[]> {
    const r = await api.get<PortfolioAccount[]>('/api/stocks/accounts/');
    return r.data.filter((a) => a.account_type === PAPER_TYPE);
}

async function fetchCandidates(accountId: number | null): Promise<AccumulationCandidate[]> {
    const params = accountId ? { account: String(accountId) } : {};
    const r = await accumulationApi.listCandidates(params);
    return r.data;
}

export default function AccumulationTradingPage() {
    const [state, dispatch] = useReducer(reducer, initial);
    const { accounts, selectedAccountId, candidates, loading, selected } = state;

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchPaperAccounts()])
            .then(async ([paper]) => {
                const accountId = paper.length > 0 ? paper[0].id : null;
                const cands = await fetchCandidates(accountId);
                if (!cancelled) dispatch({ type: 'INIT_DONE', accounts: paper, accountId, candidates: cands });
            })
            .catch(() => { if (!cancelled) dispatch({ type: 'INIT_DONE', accounts: [], accountId: null, candidates: [] }); });
        return () => { cancelled = true; };
    }, []);

    const handleAccountChange = useCallback((id: number) => {
        dispatch({ type: 'ACCOUNT_CHANGED', accountId: id });
        fetchCandidates(id).then((cands) => dispatch({ type: 'CANDIDATES_DONE', candidates: cands }));
    }, []);

    if (loading) return <PageLoader />;

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Stocks where a few large brokers are accumulating. Validated setups can be
                traded into your paper account; research-only setups are for review.
            </p>
            <AccountSelector accounts={accounts} selectedId={selectedAccountId} onChange={handleAccountChange} />
            {accounts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    Create a paper account to size and place trades.
                </p>
            )}
            <CandidateTable candidates={candidates} onPlaceTrade={(c) => dispatch({ type: 'SELECT', candidate: c })} />
            {selected && selectedAccountId !== null && (
                <PlaceTradeDialog
                    candidate={selected}
                    accountId={selectedAccountId}
                    api={api}
                    onClose={() => dispatch({ type: 'SELECT', candidate: null })}
                />
            )}
        </div>
    );
}
