export interface AccumulationFactors {
    concentration: number;
    coiling: number;
    breakout: number;
    score: number;
}

export interface AccumulationCandidate {
    id: number;
    symbol: string;
    scan_date: string;
    score: string;
    factors: AccumulationFactors;
    suggested_entry: string;
    suggested_stop: string;
    suggested_target: string;
    validation_state: 'validated' | 'research';
    status: string;
    suggested_qty: number | null;
}
