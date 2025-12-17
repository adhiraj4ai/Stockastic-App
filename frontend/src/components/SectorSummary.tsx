import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart } from 'lucide-react';

interface SectorData {
    name: string;
    change: number;
    turnover: number;
    count: number;
}

export function SectorSummary({ sectors }: { sectors: SectorData[] }) {
    return (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle>Sector Performance</CardTitle>
                    <PieChart className="h-4 w-4 text-gray-500" />
                </div>
            </CardHeader>
            <CardContent className="h-[calc(100%-60px)]">
                <div className="overflow-x-auto h-full overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Sector</TableHead>
                                <TableHead className="text-right">Change</TableHead>
                                <TableHead className="text-right">Turnover</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sectors.map((sector) => {
                                const isPositive = sector.change >= 0;
                                return (
                                    <TableRow key={sector.name} className="hover:bg-gray-50">
                                        <TableCell className="font-medium">{sector.name}</TableCell>
                                        <TableCell className={`text-right font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                            {isPositive ? '+' : ''}{sector.change.toFixed(2)}%
                                        </TableCell>
                                        <TableCell className="text-right text-gray-500 text-xs">
                                            Rs. {(sector.turnover / 1_000_000).toFixed(1)}M
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
