import api from '@/lib/api';

const inflight = new Map<string, Promise<unknown>>();

// Dedupes concurrent verdict fetches for the same symbol (the two ticker-page
// consumers mount together; the backend cache only helps after the first build).
export function fetchVerdict(symbol: string): Promise<unknown> {
    const key = symbol.toUpperCase();
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = api.get(`/api/stocks/ticker-verdict/${key}/`)
        .then(res => res.data)
        .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
    return p;
}
