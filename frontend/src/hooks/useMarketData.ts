import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';

export interface StockData {
    ticker: string;
    close: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    turnover: number;
    change: number;
    percent_change: number;
    sector: string;
    roc?: number;
}

export interface MarketSummaryData {
    market_summary: {
        date: string;
        total_turnover: number;
        total_volume: number;
        total_points: number;
        points_change: number;
        percent_change: number;
        advancers: number;
        decliners: number;
        advancers_percent: number;
        decliners_percent: number;
    };
    top_volume: StockData[];
    top_turnover: StockData[];
    top_gainers: StockData[];
    bottom_volume: StockData[];
    bottom_turnover: StockData[];
    top_losers: StockData[];
    sector_summary?: {
        name: string;
        change: number;
        turnover: number;
        volume: number;
        count: number;
    }[];
    whale_watch?: any[]; // For Smart Money Flow
}

export function useMarketData(refreshInterval = 10000) {
    const [data, setData] = useState<MarketSummaryData | null>(null);
    const [allStocks, setAllStocks] = useState<StockData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [indexHistory, setIndexHistory] = useState<{ date: string, value: number, volume: number, turnover: number }[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (!data) setLoading(true); // Only show loader on initial fetch
                const summaryResponse = await api.get('/api/stocks/summary/');
                setData(summaryResponse.data);

                try {
                    const historyResponse = await api.get('/api/stocks/sector-history/NEPSE/');
                    setIndexHistory(historyResponse.data);
                } catch (hErr) {
                    console.error("Failed to fetch index history", hErr);
                }

                // Gather unique stocks from all top lists
                const uniqueStocks = new Map<string, StockData>();
                const sourceLists = [
                    summaryResponse.data.top_gainers,
                    summaryResponse.data.top_losers,
                    summaryResponse.data.top_turnover,
                    summaryResponse.data.top_volume
                ];

                sourceLists.flat().filter(Boolean).forEach(s => {
                    uniqueStocks.set(s.ticker, {
                        ...s,
                        sector: s.sector || 'Others'
                    });
                });
                setAllStocks(Array.from(uniqueStocks.values()));

            } catch (err: any) {
                console.error('Failed to fetch market data', err);
                const msg = err.response?.data?.detail || err.message;
                setError(`Failed to load data: ${msg}`);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        
        let interval: NodeJS.Timeout | null = null;
        if (refreshInterval > 0) {
            interval = setInterval(fetchData, refreshInterval);
        }
        
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [refreshInterval]);

    const marketSentiment = useMemo(() => {
        if (!data || !data.market_summary) return 50;
        const { advancers, decliners, points_change } = data.market_summary;
        const total = advancers + decliners;
        if (total === 0) return 50;
        const breadthRatio = (advancers / total) * 100;
        const momentumBonus = points_change > 0 ? 10 : -10;
        return Math.max(0, Math.min(100, breadthRatio + momentumBonus));
    }, [data]);

    const marketHealth = useMemo(() => {
        if (!data || !data.market_summary || indexHistory.length < 30) {
            return {
                scores: { volume: 50, turnover: 50, breadth: 50, volatility: 50, participation: 50 },
                raw: null
            };
        }

        const last30 = indexHistory.slice(-30);
        const avgVol = last30.reduce((sum, d) => sum + (d.volume || 0), 0) / last30.length;
        const avgTurn = last30.reduce((sum, d) => sum + (d.turnover || 0), 0) / last30.length;

        const todayVol = data.market_summary.total_volume;
        const todayTurn = data.market_summary.total_turnover;

        const volScore = Math.min(100, (todayVol / (avgVol || 1)) * 50);
        const turnScore = Math.min(100, (todayTurn / (avgTurn || 1)) * 50);
        const breadthScore = data.market_summary.advancers_percent;
        const participationScore = (data.market_summary.advancers / (data.market_summary.advancers + data.market_summary.decliners || 1)) * 100;

        return {
            scores: {
                volume: volScore,
                turnover: turnScore,
                breadth: breadthScore,
                volatility: 75,
                participation: participationScore
            },
            raw: {
                volume: todayVol,
                avgVolume: avgVol,
                turnover: todayTurn,
                avgTurnover: avgTurn
            }
        };
    }, [data, indexHistory]);

    const indexSparkData = useMemo(() => {
        if (indexHistory.length > 0) {
            return indexHistory.slice(-20).map(d => d.value);
        }
        if (!data || !data.market_summary) return [];
        return [];
    }, [data, indexHistory]);

    return {
        data,
        allStocks,
        loading,
        error,
        indexHistory,
        marketSentiment,
        marketHealth,
        indexSparkData
    };
}
