import { useState, useEffect } from 'react';
import api from '@/lib/api';

export interface PortfolioStats {
    totalInvestment: number;
    totalCurrentValue: number;
    totalGainLoss: number;
    totalGainLossPercent: number;
    totalDayGainLoss: number;
    profitCount: number;
    lossCount: number;
}

export function usePortfolioSummary(selectedAccount: string = 'all') {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<PortfolioStats | null>(null);

    useEffect(() => {
        const fetchPortfolio = async () => {
            try {
                setLoading(true);
                const params: any = {};
                if (selectedAccount !== 'all') {
                    params.account = selectedAccount;
                }

                const response = await api.get('/api/stocks/portfolio/', { params });
                const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
                setItems(data);

                // Calculate Summary
                const investment = data.reduce((acc: number, item: any) => acc + Number(item.investment_value), 0);
                const current = data.reduce((acc: number, item: any) => acc + Number(item.current_value), 0);
                const dayGain = data.reduce((acc: number, item: any) => acc + Number(item.day_gain_loss), 0);
                const profit = data.filter((i: any) => Number(i.gain_loss) > 0).length;
                const loss = data.filter((i: any) => Number(i.gain_loss) < 0).length;

                setStats({
                    totalInvestment: investment,
                    totalCurrentValue: current,
                    totalGainLoss: current - investment,
                    totalGainLossPercent: investment ? ((current - investment) / investment * 100) : 0,
                    totalDayGainLoss: dayGain,
                    profitCount: profit,
                    lossCount: loss
                });
            } catch (err) {
                console.error('Failed to fetch portfolio summary', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPortfolio();
    }, [selectedAccount]);

    return { items, loading, stats };
}
