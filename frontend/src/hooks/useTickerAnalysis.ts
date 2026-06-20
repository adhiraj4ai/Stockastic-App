/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { findIndicator, IndicatorRow } from '@/lib/tickerAnalysis';

// ── Indicator needle constants ────────────────────────────────────────────────
const IND_SMA50 = '50-DAY SMA';
const IND_SMA200 = '200-DAY SMA';
const IND_ATR = 'ATR';
const IND_ADX = 'ADX';
const IND_VWAP = 'VWAP';
const IND_BB = 'BOLLINGER';
const IND_BBP = 'BB%B';
const IND_PIVOT_P = 'PIVOT (P)';
const IND_PIVOT = 'PIVOT';
const IND_SUPPORT1 = 'SUPPORT 1';
const IND_S1 = 'S1';
const IND_RESISTANCE1 = 'RESISTANCE 1';
const IND_R1 = 'R1';
const IND_CCI = 'CCI';
const IND_WILLIAMS = 'WILLIAMS';
const IND_MFI = 'MFI';
const IND_ULTIMATE = 'ULTIMATE';
const IND_STOCH_D = 'STOCHASTIC (%D)';
const IND_D = '%D';
const IND_STOCH_K = 'STOCHASTIC';
const IND_K = '%K';
const IND_AROON_UP = 'AROON UP';
const IND_AROONUP = 'AROONUP';
const IND_AROON_DOWN = 'AROON DOWN';
const IND_AROONDOWN = 'AROONDOWN';
const IND_PSAR = 'PSAR';
const IND_CMF = 'CMF';
const IND_OBV = 'OBV';

// ── Public types ──────────────────────────────────────────────────────────────
export interface TickerAnalysisData {
    price: { cmp: number | null; dayHigh: number | null; dayLow: number | null; w52High: number | null; w52Low: number | null; volume: number | null; turnover: number | null };
    live: { rsi: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null; roc: number | null; trend5d: number | null; trend10d: number | null; trend1m: number | null };
    fundamentals: { pe: number | null; eps: number | null; bookValue: number | null; priceToBook: number | null; roe: number | null; divYield: number | null; marketCap: number | null; yoyGrowth: number | null; qoqGrowth: number | null; debtEquity: number | null; sector: string | null; indicators: Array<{ name: string; value: string; sector_high: number; sector_low: number }> };
    technicals: { sma50: number | null; sma200: number | null; atr: number | null; adx: number | null; vwap: number | null; bbp: number | null; pivotP: number | null; pivotS1: number | null; pivotR1: number | null; cci: number | null; williamsR: number | null; mfi: number | null; ultimateOsc: number | null; stochK: number | null; stochD: number | null; aroonUp: number | null; aroonDown: number | null; psar: number | null; cmf: number | null; obv: number | null };
    accumulation: { ratio: number; netQty: number } | null;
    fibonacci: { trend: string; nearestSupport: number | null; nearestResistance: number | null; levels: Array<{ ratio: number | null; price: number | null; is_above: boolean; distance_pct: number | null }> } | null;
    generatedSignals: Array<{ source: string; signal: string; signal_tier: string; strength: number }>;
    history: Array<{ date: string; signal: string; strategy_name: string; last_close: string }>;
    brokers: Array<{ broker: string | number; wac: number; type: string }>;
    company: { name: string | null; sector: string | null };
}

export interface TickerAnalysisResult {
    loading: boolean;
    error: boolean;
    data: TickerAnalysisData | null;
}

// ── Null helpers ──────────────────────────────────────────────────────────────
function toNum(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parsePrice(detail: any, batch: any, fund: any): TickerAnalysisData['price'] {
    const price = detail?.price ?? {};
    const cmp =
        toNum(batch?.ltp) ??
        toNum(price?.last_price ?? price?.close) ??
        toNum(fund?.last_price) ??
        null;
    return {
        cmp,
        dayHigh: toNum(price?.high),
        dayLow: toNum(price?.low),
        w52High: toNum(fund?.fifty_two_week_high),
        w52Low: toNum(fund?.fifty_two_week_low),
        volume: toNum(price.volume),
        turnover: toNum(price.turnover),
    };
}

function parseLive(batch: any): TickerAnalysisData['live'] {
    return {
        rsi: toNum(batch?.rsi),
        macd: toNum(batch?.macd),
        macdSignal: toNum(batch?.macd_signal),
        macdHist: toNum(batch?.macd_hist),
        roc: toNum(batch?.roc),
        trend5d: toNum(batch?.trends?.['5d']),
        trend10d: toNum(batch?.trends?.['10d']),
        trend1m: toNum(batch?.trends?.['1m']),
    };
}

function parseFundamentals(fund: any): TickerAnalysisData['fundamentals'] {
    return {
        pe: toNum(fund?.pe_ratio_unaudited ?? fund?.pe_ratio),
        eps: toNum(fund?.eps_unaudited ?? fund?.eps),
        bookValue: toNum(fund?.book_value_unaudited ?? fund?.book_value),
        priceToBook: toNum(fund?.price_to_book),
        roe: toNum(fund?.ro_equity),
        divYield: toNum(fund?.dividend_yield),
        marketCap: toNum(fund?.market_cap),
        yoyGrowth: toNum(fund?.yoy_earnings_growth),
        qoqGrowth: toNum(fund?.qoq_earnings_growth),
        debtEquity: toNum(fund?.debt_to_equity),
        sector: fund?.sector ?? null,
        indicators: fund?.fundamental_indicators ?? [],
    };
}

function parseTechnicals(rows: IndicatorRow[]): TickerAnalysisData['technicals'] {
    const fi = (...needles: string[]) => findIndicator(rows, ...needles);
    return {
        sma50: fi(IND_SMA50),
        sma200: fi(IND_SMA200),
        atr: fi(IND_ATR),
        adx: fi(IND_ADX),
        vwap: fi(IND_VWAP),
        bbp: fi(IND_BB, IND_BBP),
        pivotP: fi(IND_PIVOT_P, IND_PIVOT),
        pivotS1: fi(IND_SUPPORT1, IND_S1),
        pivotR1: fi(IND_RESISTANCE1, IND_R1),
        cci: fi(IND_CCI),
        williamsR: fi(IND_WILLIAMS),
        mfi: fi(IND_MFI),
        ultimateOsc: fi(IND_ULTIMATE),
        stochK: fi(IND_STOCH_K, IND_K),
        stochD: fi(IND_STOCH_D, IND_D),
        aroonUp: fi(IND_AROON_UP, IND_AROONUP),
        aroonDown: fi(IND_AROON_DOWN, IND_AROONDOWN),
        psar: fi(IND_PSAR),
        cmf: fi(IND_CMF),
        obv: fi(IND_OBV),
    };
}

function parseAccumulation(accumList: any[], symbol: string): TickerAnalysisData['accumulation'] {
    const entry = accumList.find((s: any) => s.symbol === symbol);
    if (!entry) return null;
    return { ratio: entry.accumulation_ratio, netQty: entry.net_qty };
}

function parseFibonacci(fibData: any): TickerAnalysisData['fibonacci'] {
    if (!fibData) return null;
    const levels = (fibData.levels ?? []).map((lv: any) => ({
        ratio: toNum(lv.ratio),
        price: toNum(lv.price),
        is_above: !!lv.is_above,
        distance_pct: toNum(lv.distance_pct),
    }));
    return {
        trend: fibData.trend,
        nearestSupport: toNum(fibData.nearest_support),
        nearestResistance: toNum(fibData.nearest_resistance),
        levels,
    };
}

function parseGeneratedSignals(genData: any, symbol: string): TickerAnalysisData['generatedSignals'] {
    const all: any[] = Array.isArray(genData) ? genData : [];
    return all.filter((s: any) => s.symbol === symbol);
}

function parseBrokers(fund: any): TickerAnalysisData['brokers'] {
    const acc = fund?.broker_accumulation ?? {};
    return (acc['1M'] ?? []).filter((b: any) => b.type === 'BUY');
}

function parseCompany(detail: any, fund: any): TickerAnalysisData['company'] {
    return {
        name: detail?.company?.name ?? null,
        sector: detail?.company?.sector ?? fund?.sector ?? null,
    };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTickerAnalysis(symbol?: string): TickerAnalysisResult {
    const [state, setState] = useState<TickerAnalysisResult>({ loading: true, error: false, data: null });

    useEffect(() => {
        if (!symbol) return;
        let active = true;
        fetchAnalysis(symbol).then(next => { if (active) setState(next); });
        return () => { active = false; };
    }, [symbol]);

    return state;
}

async function fetchAnalysis(symbol: string): Promise<TickerAnalysisResult> {
    try {
        const [detailRes, signalsRes, batchRes, accumRes, fibRes, genRes] = await Promise.all([
            api.get(`/api/stocks/details/${symbol}/`),
            api.get(`/api/stocks/signals/?symbol=${symbol}&page_size=10`),
            api.get(`/api/stocks/batch-indicators/?symbols=${symbol}`),
            api.get('/api/stocks/companies/accumulation/', { params: { range: '1W' } }),
            api.get(`/api/stocks/fibonacci/${symbol}/`).catch(() => ({ data: null })),
            api.get('/api/stocks/generated-signals/latest/').catch(() => ({ data: [] })),
        ]);
        return buildResult(symbol, detailRes.data, signalsRes.data, batchRes.data, accumRes.data, fibRes.data, genRes.data);
    } catch {
        return { loading: false, error: true, data: null };
    }
}

function buildResult(
    symbol: string,
    detail: any,
    signalsData: any,
    batchData: any,
    accumData: any,
    fibData: any,
    genData: any,
): TickerAnalysisResult {
    const fund = detail?.fundamental ?? {};
    const batch = batchData?.[symbol] ?? null;
    const rows: IndicatorRow[] = detail?.technical_indicators ?? [];
    const accumList: any[] = Array.isArray(accumData) ? accumData : [];

    return {
        loading: false,
        error: false,
        data: {
            price: parsePrice(detail, batch, fund),
            live: parseLive(batch),
            fundamentals: parseFundamentals(fund),
            technicals: parseTechnicals(rows),
            accumulation: parseAccumulation(accumList, symbol),
            fibonacci: parseFibonacci(fibData),
            generatedSignals: parseGeneratedSignals(genData, symbol),
            history: signalsData?.results ?? [],
            brokers: parseBrokers(fund),
            company: parseCompany(detail, fund),
        },
    };
}
