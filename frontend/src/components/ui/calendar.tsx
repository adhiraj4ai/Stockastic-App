"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn("p-3 relative", className)}
            classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4 w-full relative pt-10", // Add padding top for absolute nav
                month_caption: "hidden",
                caption_label: "text-sm font-medium",
                nav: "flex items-center justify-between absolute top-3 left-0 w-full px-4",
                button_previous: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-8 w-8 bg-white/80 backdrop-blur-sm p-0 opacity-70 hover:opacity-100 shadow-sm border-blue-100 hover:border-blue-300 hover:text-blue-600 transition-all z-20"
                ),
                button_next: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-8 w-8 bg-white/80 backdrop-blur-sm p-0 opacity-70 hover:opacity-100 shadow-sm border-blue-100 hover:border-blue-300 hover:text-blue-600 transition-all z-20"
                ),
                month_grid: "w-full border-collapse",
                weekdays: "flex justify-between w-full mb-2",
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
                ...classNames,
            }}
            components={{
                Chevron: ({ ...props }) => {
                    if (props.orientation === 'left') {
                        return <ChevronLeft className="h-4 w-4" />;
                    }
                    return <ChevronRight className="h-4 w-4" />;
                }
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"

export { Calendar }
