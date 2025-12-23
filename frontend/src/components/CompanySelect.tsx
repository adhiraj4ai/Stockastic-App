"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
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
import axios from "axios"

interface Company {
    symbol: string;
    name: string;
}

interface CompanySelectProps {
    value?: string;
    onChange: (value: string) => void;
    className?: string; // Add className prop
}

export function CompanySelect({ value, onChange, className }: CompanySelectProps) {
    const [open, setOpen] = React.useState(false)
    const [companies, setCompanies] = React.useState<Company[]>([])
    const [loading, setLoading] = React.useState(false)
    const [search, setSearch] = React.useState("")

    React.useEffect(() => {
        const fetchCompanies = async () => {
            setLoading(true);
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const response = await axios.get(`${apiUrl}/api/stocks/companies/`, {
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
        }, 300); // Debounce search

        return () => clearTimeout(timeoutId);
    }, [search]);

    // Ensure we show at least the current value if not in search results (optional interaction)
    // Actually, backend search is cleaner.

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between", className)}
                >
                    {value
                        ? companies.find((framework) => framework.symbol === value)?.symbol || value
                        : "Select stock..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                    {/* shouldFilter=false because we filter on backend/effect, 
             OR use true and fetch ALL? 
             Fetching ALL ~200-300 companies is fine. Let's fetch ALL initially and filter client side for better UX?
             User requested dropdown. 
             If list is huge, backend search is better. 
             But Command component is client-side filter by default.
             Let's switch to fetch all ONCE on mount for smoother UX if list is < 1000.
             Assuming Nepal Stock has < 500 companies.
          */}
                    <CommandInput placeholder="Search ticker or name..." onValueChange={(val) => {
                        // We can still trigger backend search if we want, or rely on client side matching
                        setSearch(val)
                    }}
                    />
                    <CommandList>
                        <CommandEmpty>No stock found.</CommandEmpty>
                        <CommandGroup>
                            {companies.map((framework) => (
                                <CommandItem
                                    key={framework.symbol}
                                    value={framework.symbol}
                                    onSelect={() => {
                                        onChange(framework.symbol === value ? "" : framework.symbol)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === framework.symbol ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-bold">{framework.symbol}</span>
                                        <span className="text-xs text-gray-500">{framework.name}</span>
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
