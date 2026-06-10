export interface SignalEpisodeItem {
    symbol: string;
    signal: 'BUY' | 'SELL';
    source: string;
    entry_price: string | number;
    target_price?: number | null;
    stop_loss_price?: number | null;
    entry_strength: number;
    signal_tier?: string | null;
    start_date: string;
}

export interface RecommendationItem {
    symbol: string;
    signal: 'BUY' | 'SELL';
    strength: number;
    reason: string;
    close: number;
    date: string;
}

export interface ActionItem {
    symbol: string;
    action: 'BUY' | 'SELL';
    source: string;
    conviction: number;
    price: number | null;
    detail: string;
    target?: number | null;
    stop?: number | null;
}

const SOURCE_LABELS: Record<string, string> = {
    SMART_MONEY: 'Smart Money',
    WHALE_WATCH: 'Whale Watch',
    BROKER_ACCUMULATION: 'Broker Accumulation',
    SMART_CROSSOVER: 'Smart Crossover',
    ICHIMOKU: 'Ichimoku',
};

export function buildActionItems(
    episodes: SignalEpisodeItem[],
    recommendationSets: { label: string; items: RecommendationItem[] }[],
    limit = 8
): ActionItem[] {
    const candidates: ActionItem[] = [];

    for (const ep of episodes) {
        const price = Number(ep.entry_price);
        candidates.push({
            symbol: ep.symbol,
            action: ep.signal,
            source: SOURCE_LABELS[ep.source] ?? ep.source,
            conviction: ep.entry_strength,
            price: Number.isFinite(price) ? price : null,
            detail: ep.signal_tier ?? '',
            target: ep.target_price ?? null,
            stop: ep.stop_loss_price ?? null,
        });
    }

    for (const set of recommendationSets) {
        for (const r of set.items) {
            candidates.push({
                symbol: r.symbol,
                action: r.signal,
                source: set.label,
                conviction: r.strength,
                price: r.close ?? null,
                detail: r.reason ?? '',
            });
        }
    }

    const best = new Map<string, ActionItem>();
    for (const item of candidates) {
        const key = `${item.symbol}:${item.action}`;
        const existing = best.get(key);
        if (!existing || item.conviction > existing.conviction) best.set(key, item);
    }

    return Array.from(best.values())
        .sort((a, b) => b.conviction - a.conviction)
        .slice(0, limit);
}
