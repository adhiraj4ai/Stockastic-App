'use client';

import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Search,
    Building2,
    Loader2,
    Filter,
    ArrowRight,
    ChevronLeft,
    Eye
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { SECTOR_TO_TEMPLATE } from '@/constants/financialTemplates';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface Company {
    symbol: string;
    name: string;
    sector: string;
    latest_annual_report?: string;
    latest_quarterly_report?: string;
}
import api from '@/lib/api';

export default function AdminPage() {
    const router = useRouter();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Get all unique sectors from the mapping, excluding Mutual Funds
    const allSectors = useMemo(() => Object.keys(SECTOR_TO_TEMPLATE).filter(s => s !== 'Mutual Fund'), []);
    const [selectedSectors, setSelectedSectors] = useState<string[]>(allSectors);

    useEffect(() => {
        const fetchAllCompanies = async () => {
            setLoading(true);
            try {
                const res = await api.get('/api/stocks/companies/');
                setCompanies(res.data.results || res.data);
            } catch (err) {
                console.error('Failed to fetch companies', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAllCompanies();
    }, []);

    const toggleSector = (sector: string) => {
        setSelectedSectors(prev =>
            prev.includes(sector)
                ? prev.filter(s => s !== sector)
                : [...prev, sector]
        );
    };

    const toggleAllSectors = () => {
        if (selectedSectors.length === allSectors.length) {
            setSelectedSectors([]);
        } else {
            setSelectedSectors(allSectors);
        }
    };

    const filteredCompanies = useMemo(() => {
        return companies.filter(c => {
            const matchesSearch = c.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesSector = selectedSectors.includes(c.sector);
            return matchesSearch && matchesSector;
        });
    }, [companies, searchTerm, selectedSectors]);

    return (
        <DashboardLayout title="Financials">
            <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">

                {/* Filters & Search */}
                <div className="flex flex-col gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border dark:border-slate-800 shadow-sm transition-colors duration-500">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                            <Input
                                placeholder="Search symbol or name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-10 rounded-lg bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                            />
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-10 gap-2 border-dashed border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                    <Filter className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                                    <span className="text-gray-600 dark:text-slate-300">Filter by Sector</span>
                                    {selectedSectors.length < allSectors.length && selectedSectors.length > 0 && (
                                        <Badge variant="secondary" className="ml-1 px-1.5 h-5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                                            {selectedSectors.length}
                                        </Badge>
                                    )}
                                    {selectedSectors.length === allSectors.length && (
                                        <Badge variant="secondary" className="ml-1 px-1.5 h-5 text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800">
                                            All
                                        </Badge>
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-64 max-h-96 overflow-y-auto dark:bg-slate-900 dark:border-slate-800" align="end">
                                <DropdownMenuLabel className="dark:text-slate-300">Sectors</DropdownMenuLabel>
                                <DropdownMenuSeparator className="dark:bg-slate-800" />
                                <DropdownMenuCheckboxItem
                                    checked={selectedSectors.length === allSectors.length}
                                    onCheckedChange={toggleAllSectors}
                                    className="font-medium dark:text-slate-300 dark:focus:bg-slate-800"
                                >
                                    Select All
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator className="dark:bg-slate-800" />
                                {allSectors.map((sector) => (
                                    <DropdownMenuCheckboxItem
                                        key={sector}
                                        checked={selectedSectors.includes(sector)}
                                        onCheckedChange={() => toggleSector(sector)}
                                        className="dark:text-slate-400 dark:focus:bg-slate-800 dark:focus:text-slate-200"
                                    >
                                        {sector}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Active filter summary */}
                    {selectedSectors.length > 0 && selectedSectors.length < allSectors.length && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 font-medium px-1">
                            Showing {filteredCompanies.length} companies from {selectedSectors.length} selected sectors.
                        </p>
                    )}
                </div>

                {/* Company Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                ) : filteredCompanies.length > 0 ? (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-500">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50/50 dark:bg-slate-800/50 hover:bg-gray-50/50 dark:hover:bg-slate-800/50 border-b dark:border-slate-800">
                                    <TableHead className="w-[100px] font-bold text-gray-900 dark:text-slate-100">Symbol</TableHead>
                                    <TableHead className="font-bold text-gray-900 dark:text-slate-100">Name</TableHead>
                                    <TableHead className="font-bold text-gray-900 dark:text-slate-100">Sector</TableHead>
                                    <TableHead className="font-bold text-gray-900 dark:text-slate-100">Latest Annual</TableHead>
                                    <TableHead className="font-bold text-gray-900 dark:text-slate-100">Latest Quarterly</TableHead>
                                    <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCompanies.map((company) => (
                                    <TableRow
                                        key={company.symbol}
                                        className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer group transition-colors border-b dark:border-slate-800"
                                        onClick={() => router.push(`/financials/${company.symbol}`)}
                                    >
                                        <TableCell className="font-bold text-gray-900 dark:text-slate-100">{company.symbol}</TableCell>
                                        <TableCell className="font-medium text-gray-600 dark:text-slate-400">{company.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 font-medium">
                                                {company.sector}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {company.latest_annual_report ? (
                                                <Badge variant="outline" className="text-green-600 dark:text-emerald-400 border-green-200 dark:border-emerald-900/50 bg-green-50 dark:bg-emerald-900/10 font-mono">
                                                    {company.latest_annual_report}
                                                </Badge>
                                            ) : (
                                                <span className="text-gray-400 dark:text-slate-600 text-sm">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {company.latest_quarterly_report ? (
                                                <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/10 font-mono">
                                                    {company.latest_quarterly_report}
                                                </Badge>
                                            ) : (
                                                <span className="text-gray-400 dark:text-slate-600 text-sm">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 gap-2 dark:border-slate-700 dark:text-slate-300 group-hover:bg-blue-600 dark:group-hover:bg-blue-500 group-hover:text-white group-hover:border-blue-600 dark:group-hover:border-blue-500 transition-colors"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                Manage
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 dark:border-slate-800">
                        <Building2 className="w-10 h-10 text-gray-300 dark:text-slate-700 mx-auto mb-3" />
                        <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">No companies found</h3>
                        <p className="text-gray-400 dark:text-slate-500 text-xs mt-1">Try adjusting your filters.</p>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
