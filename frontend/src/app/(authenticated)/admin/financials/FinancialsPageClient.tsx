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
    LayoutGrid,
    List as ListIcon,
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
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
    const [activeSector, setActiveSector] = useState<string>('');

    // Get all unique sectors from the mapping, excluding Mutual Funds and Debentures
    const allSectors = useMemo(() => Object.keys(SECTOR_TO_TEMPLATE).filter(s => !['Mutual Fund', 'Debentures'].includes(s)), []);
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

    // Group companies by sector
    const groupedCompanies = useMemo(() => {
        const groups: Record<string, Company[]> = {};

        filteredCompanies.forEach(company => {
            if (!groups[company.sector]) {
                groups[company.sector] = [];
            }
            groups[company.sector].push(company);
        });

        // Sort sectors alphabetically
        return Object.keys(groups).sort().reduce((acc, sector) => {
            acc[sector] = groups[sector];
            return acc;
        }, {} as Record<string, Company[]>);
    }, [filteredCompanies]);

    // Scroll Spy Logic
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSector(entry.target.getAttribute('data-sector') || '');
                    }
                });
            },
            { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
        );

        const sections = document.querySelectorAll('[id^="sector-"]');
        sections.forEach((section) => observer.observe(section));

        return () => sections.forEach((section) => observer.unobserve(section));
    }, [groupedCompanies]);

    return (
        <DashboardLayout title="Financials" hideHeader={true}>
            <div className="w-full mx-auto space-y-6 animate-in fade-in duration-500 px-2 lg:px-4">

                {/* Filters & Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-card p-4 rounded-xl border dark:border-slate-800 shadow-sm transition-colors duration-500">
                    <div className="flex flex-1 items-center gap-4">
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
                            <DropdownMenuContent className="w-64 max-h-96 overflow-y-auto dark:bg-card dark:border-slate-800" align="end">
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

                    <div className="flex items-center gap-3">
                        {/* Active filter summary */}
                        {selectedSectors.length > 0 && selectedSectors.length < allSectors.length && (
                            <p className="text-xs text-gray-500 dark:text-slate-400 font-medium px-1 hidden lg:block">
                                Showing {filteredCompanies.length} companies
                            </p>
                        )}

                        {/* View Toggle */}
                        <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-lg p-1 border dark:border-slate-700">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewMode('card')}
                                className={`h-8 px-3 rounded-md transition-all ${viewMode === 'card'
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'}`}
                            >
                                <LayoutGrid className="w-4 h-4 mr-2" />
                                <span className="text-xs font-semibold">Cards</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewMode('list')}
                                className={`h-8 px-3 rounded-md transition-all ${viewMode === 'list'
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'}`}
                            >
                                <ListIcon className="w-4 h-4 mr-2" />
                                <span className="text-xs font-semibold">List</span>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Main Content Layout with Sidebar */}
                <div className="flex gap-8 relative items-start">

                    {/* Content Column */}
                    <div className="flex-1 min-w-0">
                        {loading ? (
                            <div className="flex items-center justify-center py-24">
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            </div>
                        ) : Object.keys(groupedCompanies).length > 0 ? (
                            <div className="space-y-12">
                                {Object.entries(groupedCompanies).map(([sector, sectorCompanies]) => (
                                    <div key={sector} id={`sector-${sector.replace(/\s+/g, '-').toLowerCase()}`} data-sector={sector} className="space-y-4 scroll-mt-24">
                                        <div className="flex items-center gap-3 pl-1 border-l-4 border-blue-500 py-1">
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">{sector}</h3>
                                            <Badge variant="secondary" className="bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 text-xs shadow-sm">
                                                {sectorCompanies.length} companies
                                            </Badge>
                                        </div>

                                        {viewMode === 'card' ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                                                {sectorCompanies.map((company) => (
                                                    <div
                                                        key={company.symbol}
                                                        onClick={() => router.push(`/admin/financials/${company.symbol}`)}
                                                        className="bg-white dark:bg-card p-3 rounded-lg border dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer group relative overflow-hidden"
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            {(company.latest_annual_report || company.latest_quarterly_report) ? (
                                                                <Badge variant="secondary" className="bg-green-50 dark:bg-emerald-900/20 text-green-700 dark:text-emerald-400 border border-green-100 dark:border-emerald-900/30 text-[9px] px-1 h-4">
                                                                    Updated
                                                                </Badge>
                                                            ) : <div className="h-4"></div>}
                                                        </div>

                                                        <h4 className="font-bold text-gray-900 dark:text-slate-100 text-sm mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                            {company.symbol}
                                                        </h4>
                                                        <p className="text-xs text-gray-500 dark:text-slate-500 font-medium line-clamp-1 mb-2" title={company.name}>
                                                            {company.name}
                                                        </p>

                                                        <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-slate-800">
                                                            <div className="flex-1 flex flex-col">
                                                                <span className="text-[9px] font-semibold text-gray-400 dark:text-slate-600 uppercase">Annual</span>
                                                                <span className="text-[10px] font-mono font-medium text-gray-700 dark:text-slate-300">
                                                                    {company.latest_annual_report || '-'}
                                                                </span>
                                                            </div>
                                                            <div className="flex-1 flex flex-col">
                                                                <span className="text-[9px] font-semibold text-gray-400 dark:text-slate-600 uppercase">Quarter</span>
                                                                <span className="text-[10px] font-mono font-medium text-gray-700 dark:text-slate-300">
                                                                    {company.latest_quarterly_report || '-'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="bg-white dark:bg-card rounded-xl border dark:border-slate-800 shadow-sm overflow-hidden transition-colors duration-500">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-gray-50/50 dark:bg-slate-800/50 hover:bg-gray-50/50 dark:hover:bg-slate-800/50 border-b dark:border-slate-800">
                                                            <TableHead className="w-[100px] font-bold text-gray-900 dark:text-slate-100">Symbol</TableHead>
                                                            <TableHead className="font-bold text-gray-900 dark:text-slate-100">Name</TableHead>
                                                            <TableHead className="font-bold text-gray-900 dark:text-slate-100">Latest Annual</TableHead>
                                                            <TableHead className="font-bold text-gray-900 dark:text-slate-100">Latest Quarterly</TableHead>
                                                            <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">Action</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {sectorCompanies.map((company) => (
                                                            <TableRow
                                                                key={company.symbol}
                                                                className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer group transition-colors border-b dark:border-slate-800 last:border-0"
                                                                onClick={() => router.push(`/admin/financials/${company.symbol}`)}
                                                            >
                                                                <TableCell className="font-bold text-gray-900 dark:text-slate-100">{company.symbol}</TableCell>
                                                                <TableCell className="font-medium text-gray-600 dark:text-slate-400">{company.name}</TableCell>
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
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-24 bg-white dark:bg-card rounded-xl border border-dashed border-gray-200 dark:border-slate-800">
                                <Building2 className="w-10 h-10 text-gray-300 dark:text-slate-700 mx-auto mb-3" />
                                <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">No companies found</h3>
                                <p className="text-gray-400 dark:text-slate-500 text-xs mt-1">Try adjusting your filters.</p>
                            </div>
                        )}
                    </div>

                    {/* Sticky Sidebar Navigation (Timeline) */}
                    {Object.keys(groupedCompanies).length > 0 && (
                        <div className="hidden xl:block w-56 sticky top-24 h-[calc(100vh-8rem)]">
                            <div className="bg-white dark:bg-card rounded-xl border dark:border-slate-800 shadow-sm p-4 h-full overflow-y-auto custom-scrollbar">
                                <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4 px-2">
                                    Sectors
                                </h4>
                                <nav className="space-y-1 relative">
                                    {/* Vertical Line */}
                                    <div className="absolute left-2.5 top-2 bottom-2 w-px bg-gray-200 dark:bg-slate-800 z-0" />

                                    {Object.keys(groupedCompanies).map((sector) => {
                                        const id = `sector-${sector.replace(/\s+/g, '-').toLowerCase()}`;
                                        const isActive = activeSector === sector;

                                        return (
                                            <a
                                                key={sector}
                                                href={`#${id}`}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
                                                    setActiveSector(sector);
                                                }}
                                                className={`group flex items-center gap-3 px-2 py-2 rounded-lg transition-all relative z-10 ${isActive ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                                            >
                                                <div className={`w-1.5 h-1.5 rounded-full ring-4 ring-white dark:ring-slate-900 transition-all duration-300 ${isActive ? 'bg-green-600 scale-125' : 'bg-gray-300 dark:bg-slate-700 group-hover:bg-green-400'}`} />
                                                <span className={`text-xs font-medium transition-colors line-clamp-1 ${isActive ? 'text-green-700 dark:text-green-300 font-bold' : 'text-gray-600 dark:text-slate-400 group-hover:text-green-600 dark:group-hover:text-green-400'}`}>
                                                    {sector}
                                                </span>
                                            </a>
                                        );
                                    })}
                                </nav>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </DashboardLayout>
    );
}
