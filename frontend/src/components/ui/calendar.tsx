"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { format, setMonth, setYear, getYear, getMonth, addYears, subYears, addMonths, subMonths } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    month: externalMonth,
    onMonthChange: externalOnMonthChange,
    ...props
}: CalendarProps) {
    const [view, setView] = React.useState<'days' | 'months' | 'years'>('days');
    const [navDate, setNavDate] = React.useState<Date>(() => externalMonth || (props.selected && props.selected instanceof Date) ? props.selected : new Date());

    const handleMonthChange = (newMonth: Date) => {
        setNavDate(newMonth);
        externalOnMonthChange?.(newMonth);
    };

    const handleNext = () => {
        if (view === 'days') handleMonthChange(addMonths(navDate, 1));
        else if (view === 'months') handleMonthChange(addYears(navDate, 1));
        else if (view === 'years') handleMonthChange(addYears(navDate, 12));
    };

    const handlePrev = () => {
        if (view === 'days') handleMonthChange(subMonths(navDate, 1));
        else if (view === 'months') handleMonthChange(subYears(navDate, 1));
        else if (view === 'years') handleMonthChange(subYears(navDate, 12));
    };

    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const Header = () => (
        <div className="flex items-center justify-between mb-2 px-1">
            <button
                onClick={handlePrev}
                className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0 bg-transparent opacity-50 hover:opacity-100")}
            >
                <ChevronLeft className="h-4 w-4" />
            </button>
            <button
                onClick={() => {
                    if (view === 'days') setView('months');
                    else if (view === 'months') setView('years');
                }}
                className={cn(
                    "text-sm font-bold text-gray-700 hover:text-blue-600 transition-colors",
                    view === 'years' && "cursor-default hover:text-gray-700"
                )}
                disabled={view === 'years'}
            >
                {view === 'days' && format(navDate, "MMMM yyyy")}
                {view === 'months' && format(navDate, "yyyy")}
                {view === 'years' && (() => {
                    const startYear = Math.floor(getYear(navDate) / 12) * 12;
                    return `${startYear} - ${startYear + 11}`;
                })()}
            </button>
            <button
                onClick={handleNext}
                className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0 bg-transparent opacity-50 hover:opacity-100")}
            >
                <ChevronRight className="h-4 w-4" />
            </button>
        </div>
    );

    return (
        <div className={cn("p-3 relative bg-white border rounded-xl shadow-lg w-auto inline-block", className)}>
            <Header />

            {view === 'months' && (
                <div className="grid grid-cols-3 gap-2 w-[260px]">
                    {months.map((m, i) => (
                        <button
                            key={m}
                            onClick={() => {
                                handleMonthChange(setMonth(navDate, i));
                                setView('days');
                            }}
                            className={cn(
                                "py-2 text-xs font-medium rounded-md hover:bg-blue-50 hover:text-blue-600 transition-all",
                                getMonth(navDate) === i ? "bg-blue-600 text-white hover:bg-blue-600 hover:text-white" : "text-gray-600"
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            )}

            {view === 'years' && (
                <div className="grid grid-cols-3 gap-2 w-[260px]">
                    {(() => {
                        const startYear = Math.floor(getYear(navDate) / 12) * 12;
                        return Array.from({ length: 12 }, (_, i) => startYear + i).map(y => (
                            <button
                                key={y}
                                onClick={() => {
                                    handleMonthChange(setYear(navDate, y));
                                    setView('months');
                                }}
                                className={cn(
                                    "py-2 text-xs font-medium rounded-md hover:bg-blue-50 hover:text-blue-600 transition-all",
                                    getYear(navDate) === y ? "bg-blue-600 text-white hover:bg-blue-600 hover:text-white" : "text-gray-600"
                                )}
                            >
                                {y}
                            </button>
                        ));
                    })()}
                </div>
            )}

            {view === 'days' && (
                <DayPicker
                    showOutsideDays={showOutsideDays}
                    month={navDate}
                    onMonthChange={handleMonthChange}
                    className="p-0"
                    classNames={{
                        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                        month: "space-y-4",
                        caption: "hidden", // We use custom header
                        caption_label: "hidden",
                        nav: "hidden", // We use custom nav
                        month_grid: "w-full border-collapse",
                        weekdays: "flex justify-between w-full mb-2 px-1",
                        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center",
                        week: "flex w-full mt-2 justify-between",
                        day: cn(
                            buttonVariants({ variant: "ghost" }),
                            "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
                        ),
                        selected: "bg-blue-600 text-white hover:bg-blue-700 hover:text-white focus:bg-blue-600 focus:text-white",
                        today: "bg-accent text-accent-foreground font-bold border border-blue-200",
                        outside: "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
                        disabled: "text-muted-foreground opacity-20 cursor-not-allowed",
                        hidden: "invisible",
                        vhidden: "hidden",
                        ...classNames,
                    }}
                    {...props}
                />
            )}
        </div>
    )
}
Calendar.displayName = "Calendar"

export { Calendar }
