// frontend/src/components/CorrelationHeatmap.tsx
import React from 'react';

interface Props {
    tickers: string[];
    matrix: number[][];
}

function cellColor(value: number): string {
    const intensity = Math.min(1, Math.abs(value));
    const hue = value >= 0 ? 0 : 210;            // warm red for positive, cool blue for negative
    return `hsl(${hue}, 70%, ${90 - intensity * 45}%)`;
}

export default function CorrelationHeatmap({ tickers, matrix }: Props) {
    if (tickers.length < 2) return null;
    return (
        <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
                <tbody>
                    {tickers.map((rowTicker, i) => (
                        <tr key={rowTicker}>
                            <th className="pr-2 text-right font-medium">{rowTicker}</th>
                            {tickers.map((colTicker, j) => (
                                <td key={colTicker} className="h-9 w-12 text-center"
                                    style={{ backgroundColor: cellColor(matrix[i][j]) }}>
                                    {matrix[i][j].toFixed(2)}
                                </td>
                            ))}
                        </tr>
                    ))}
                    <tr>
                        <th />
                        {tickers.map((t) => <th key={t} className="pt-1 font-medium">{t}</th>)}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
