export type Family = 'accumulation' | 'technical' | 'your_strategies';

export interface SignalContributor {
    source: string;
    strategy_name: string;
    tier: string;
    strength: number | null;
    conditions: string[];
    validation_state: 'validated' | 'research' | null;
}

export interface SignalCardData {
    source: string;
    family: Family;
    symbol: string;
    direction: 'BUY' | 'SELL';
    strength: number | null;
    tier: string;
    entry_price: string | null;
    stop_loss_price: string | null;
    target_price: string | null;
    conditions: string[];
    validation_state: 'validated' | 'research' | null;
    freshness_date: string | null;
    strategy_name: string;
    rationale: string;
    source_labels: string[];
    contributors: SignalContributor[];
}

export interface BoardResponse {
    cards: SignalCardData[];
    consensus: Record<string, Record<string, { families: Family[]; count: number }>>;
}

export interface GlossaryEntry { label: string; description: string; }
export interface Glossary {
    sources: Record<string, GlossaryEntry>;
    tiers: Record<string, GlossaryEntry>;
    terms: Record<string, GlossaryEntry>;
}
