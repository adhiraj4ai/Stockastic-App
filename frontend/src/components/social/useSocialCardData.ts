'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { buildActionItems, type RecommendationItem, type SignalEpisodeItem } from '@/lib/homeDigest';
import type { SocialCardData } from '@/lib/socialCardText';
import type { DataNeed } from './registry';

const REC_SOURCES = [
    { label: 'Broker Accumulation', url: '/api/stocks/broker-accumulation-recommendations/' },
    { label: 'Smart Crossover', url: '/api/stocks/smart-accumulated-crossover-recommendations/' },
    { label: 'Ichimoku', url: '/api/stocks/ichimoku-accumulation-recommendations/' },
];

export function useSocialCardData(need: DataNeed) {
    const [data, setData] = useState<SocialCardData>({});
    // All needs start "loading" so an unfetched template shows the loader (not a
    // flash of the empty state) on the render before its lazy fetch effect runs.
    const [loading, setLoading] = useState<Record<DataNeed, boolean>>({
        summary: true, weekly: true, signals: true, accumulation: true,
    });
    const startedRef = useRef<Record<DataNeed, boolean>>({
        summary: false, weekly: false, signals: false, accumulation: false,
    });

    useEffect(() => {
        if (startedRef.current[need]) return;
        startedRef.current[need] = true;
        setLoading(prev => ({ ...prev, [need]: true }));

        // startedRef one-shots each need, so this closure is the only fetch for it.
        // finish must always land (even if the effect re-ran or StrictMode replayed
        // it) or the loading flag strands at true with no refetch possible.
        const finish = (patch: Partial<SocialCardData>) => {
            setData(prev => ({ ...prev, ...patch }));
            setLoading(prev => ({ ...prev, [need]: false }));
        };

        if (need === 'summary') {
            api.get('/api/stocks/summary/')
                .then(res => finish({ summary: res.data }))
                .catch(() => finish({}));
        } else if (need === 'weekly') {
            api.get('/api/stocks/summary/', { params: { range: 'weekly' } })
                .then(res => finish({ weekly: res.data }))
                .catch(() => finish({}));
        } else if (need === 'signals') {
            Promise.allSettled([
                api.get('/api/stocks/generated-signals/latest/'),
                ...REC_SOURCES.map(s => api.get(s.url, { params: { sector: 'All' } })),
            ]).then(([episodesRes, ...recResults]) => {
                const episodes: SignalEpisodeItem[] =
                    episodesRes.status === 'fulfilled' && Array.isArray(episodesRes.value.data)
                        ? episodesRes.value.data : [];
                const recommendationSets = REC_SOURCES.map((s, i) => {
                    const r = recResults[i];
                    const items = r.status === 'fulfilled' && Array.isArray(r.value.data)
                        ? (r.value.data as RecommendationItem[]) : [];
                    return { label: s.label, items };
                });
                finish({ signals: buildActionItems(episodes, recommendationSets, 5) });
            });
        } else if (need === 'accumulation') {
            Promise.allSettled([
                api.get('/api/stocks/companies/accumulation/', { params: { range: '1W' } }),
                api.get('/api/stocks/companies/aggressive/', { params: { range: '1W' } }),
            ]).then(([accRes, aggRes]) => {
                const acc = accRes.status === 'fulfilled' && Array.isArray(accRes.value.data) ? accRes.value.data : [];
                const agg = aggRes.status === 'fulfilled' && Array.isArray(aggRes.value.data?.accumulators)
                    ? aggRes.value.data.accumulators : [];
                finish({
                    accumulation: {
                        top: acc.filter((r: any) => (r.net_qty ?? 0) > 0)
                            .sort((a: any, b: any) => (b.net_qty ?? 0) - (a.net_qty ?? 0)).slice(0, 5),
                        aggressive: [...agg].sort((a: any, b: any) => (b.intensity ?? 0) - (a.intensity ?? 0)).slice(0, 3),
                    },
                });
            });
        }
    }, [need]);

    // Always kick off summary on mount (six templates depend on it).
    useEffect(() => {
        if (startedRef.current.summary) return;
        startedRef.current.summary = true;
        api.get('/api/stocks/summary/')
            .then(res => setData(prev => ({ ...prev, summary: res.data })))
            .catch(() => undefined)
            .finally(() => setLoading(prev => ({ ...prev, summary: false })));
    }, []);

    return { data, loading };
}
