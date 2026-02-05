"use client"

import * as React from "react"
import { Check, ChevronsUpDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import api from "@/lib/api"

interface Company {
    symbol: string;
    name: string;
}

interface SymbolSelectorProps {
    value?: string;
    onChange: (value: string) => void;
    className?: string; // Added className prop
}

export function SymbolSelector({ value, onChange, className }: SymbolSelectorProps) {
    const [open, setOpen] = React.useState(false)
    const [companies, setCompanies] = React.useState<Company[]>([])
    const [loading, setLoading] = React.useState(false)
    const [search, setSearch] = React.useState("")

    React.useEffect(() => {
        const fetchCompanies = async () => {
            setLoading(true);
            try {
                const response = await api.get('/api/stocks/companies/', {
                    params: { search: search }
                });
                setCompanies(response.data);
            } catch (error) {
                console.error("Failed to fetch companies", error);
            } finally {
                setLoading(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchCompanies();
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [search]);

    const selectedCompany = companies.find((c) => c.symbol === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "h-9 px-4 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm transition-all hover:shadow-md justify-between",
                        className
                    )}
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <TrendingUp size={16} className="text-green-500 shrink-0" />
                        <div className="flex flex-col items-start overflow-hidden">
                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">
                                {value || "Select Symbol"}
                            </span>
                            {selectedCompany && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                    {selectedCompany.name}
                                </span>
                            )}
                        </div>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="center">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search ticker or company..."
                        onValueChange={(val) => setSearch(val)}
                        className="h-9"
                    />
                    <CommandList>
                        <CommandEmpty>
                            {loading ? "Loading..." : "No stock found."}
                        </CommandEmpty>
                        <CommandGroup>
                            {companies.map((company) => (
                                <CommandItem
                                    key={company.symbol}
                                    value={company.symbol}
                                    onSelect={() => {
                                        onChange(company.symbol);
                                        setOpen(false);
                                    }}
                                    className="cursor-pointer"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === company.symbol ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col flex-1">
                                        <span className="font-bold text-sm dark:text-slate-100">{company.symbol}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{company.name}</span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
