'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface DataTableProps {
    data: any[];
}

export function DataTable({ data }: DataTableProps) {
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // Get columns from the first item
    const columns = useMemo(() => {
        if (!data || data.length === 0) return [];
        return Object.keys(data[0]);
    }, [data]);

    const sortedData = useMemo(() => {
        if (!sortConfig) return data;

        return [...data].sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [data, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    if (!data || data.length === 0) {
        return <div className="p-4 text-center text-gray-500 text-sm">No data available</div>;
    }

    return (
        <div className="w-full my-4 border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden flex flex-col max-h-[400px]">
            <div className="overflow-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col}
                                    onClick={() => requestSort(col)}
                                    className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none whitespace-nowrap group"
                                >
                                    <div className="flex items-center gap-1">
                                        {col.replace(/_/g, ' ')}
                                        <span className="text-gray-400 group-hover:text-gray-600">
                                            {sortConfig?.key === col ? (
                                                sortConfig.direction === 'asc' ? (
                                                    <ArrowUp size={14} />
                                                ) : (
                                                    <ArrowDown size={14} />
                                                )
                                            ) : (
                                                <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50" />
                                            )}
                                        </span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sortedData.map((row, idx) => (
                            <tr
                                key={idx}
                                className="hover:bg-blue-50/50 transition-colors bg-white even:bg-gray-50/30"
                            >
                                {columns.map((col) => (
                                    <td key={`${idx}-${col}`} className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                                        {row[col]?.toString()}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="bg-gray-50 border-t border-gray-100 px-4 py-2 text-xs text-gray-400 text-right">
                {data.length} records
            </div>
        </div>
    );
}
