import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Recommendation {
    strategy_id: number;
    strategy_name: string;
    symbol: string;
    company_name: string;
    signal: 'BUY' | 'SELL';
    date: string;
    price: number;
    published_parameters: any;
}

export default function RecommendationsTab() {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        fetchRecommendations();
    }, []);

    const fetchRecommendations = async () => {
        setLoading(true);
        try {
            const response = await api.get('/api/stocks/strategies/recommendations/');
            if (Array.isArray(response.data)) {
                setRecommendations(response.data);
            }
        } catch (error) {
            console.error("Failed to fetch recommendations", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Market Recommendations</h2>
                    <p className="text-sm text-gray-500">Live signals from your published strategies running on latest market data.</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchRecommendations} disabled={loading}>
                    Referesh Signals
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500 animate-pulse">Scanning market...</div>
            ) : recommendations.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-gray-500">No signals found today from published strategies.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3">Strategy</th>
                                <th className="px-6 py-3">Symbol</th>
                                <th className="px-6 py-3">Signal</th>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3 text-right">Price</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {recommendations.map((rec, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{rec.strategy_name}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-900">{rec.symbol}</span>
                                            <span className="text-xs text-gray-500 truncate max-w-[150px]">{rec.company_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <Badge
                                            variant="outline"
                                            className={`${rec.signal === 'BUY' ? 'bg-green-50 text-green-700 border-green-200' :
                                                    rec.signal === 'SELL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-100 text-gray-700'
                                                }`}
                                        >
                                            {rec.signal === 'BUY' ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                                            {rec.signal}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{new Date(rec.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-right font-mono">Rs. {rec.price.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 text-blue-600"
                                            onClick={() => router.push(`/strategies/${rec.strategy_id}/run`)}
                                        >
                                            <Play size={14} className="mr-1" /> View Strategy
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}
