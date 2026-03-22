export interface AccumulationData {
    symbol: string;
    name: string;
    sector: string;
    close: number;
    buy_qty: number;
    sell_qty: number;
    net_qty: number;
    total_qty: number;
    accumulation_ratio: number;
    top_buyers: string[];
    top_sellers: string[];
    rsi?: number;
    roc?: number;
}

export interface BrokerTrend {
    symbol: string;
    broker: number;
    cumulative_net: number;
    range_net?: number;
    wac?: number;
    ltp: number;
    trend_5d: string;
    change_5d: number;
    trend_10d: string;
    change_10d: number;
    trend_20d: string;
    change_20d: number;
    trend_50d: string;
    change_50d: number;
}

export interface VolumeLeader {
    broker: string;
    volume: number;
    percentage: number;
}

export interface AggressiveTrader {
    broker: string;
    net_qty: number;
    buy_qty: number;
    sell_qty: number;
    buy_rate: number;
    sell_rate: number;
    net_amt?: number;
}

export interface AggressivePattern {
    symbol: string;
    name: string;
    sector: string;
    institutional_buy: number;
    institutional_sell: number;
    net_qty: number;
    avg_vol_20d: number;
    close: number;
    intensity: number;
    producers: string[];
    offloaders: string[];
}

export interface BrokerFavorite {
    symbol: string;
    name: string;
    current_net: number;
    wac?: number;
    qty_accumulated: number;
    net_amount: number;
    ltp: number;
    roc: number;
    rsi?: number;
}

export interface BelowCostPosition {
    symbol: string;
    broker: string;
    cumulative_net: number;
    range_net?: number;
    wac: number;
    ltp: number;
    roc: number;
    name: string;
    sector: string;
    trend_5d: string;
    change_5d: number;
    trend_10d: string;
    change_10d: number;
    trend_15d: string;
    change_15d: number;
    trend_20d: string;
    change_20d: number;
    trend_50d: string;
    change_50d: number;
    rsi?: number;
}

export interface AccumulationItem {
    date: string;
    buy_qty: number;
    buy_rate: number;
    buy_amount: number;
    sell_qty: number;
    sell_rate: number;
    sell_amount: number;
    net_quantity: number;
    cumulative_qty: number;
    wac: number;
}
