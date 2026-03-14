'use client';

import DashboardLayout from "@/components/DashboardLayout";
import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
    '/accumulation/overview': 'Accumulation Overview',
    '/accumulation/aggressive': 'Aggressive Patterns',
    '/accumulation/trends': 'Broker Trends',
    '/accumulation/favorites': 'Broker Favorites',
    '/accumulation/navigator': 'Accumulators Navigator',
    '/accumulation/history': 'Accumulation History',
    '/accumulation/share-transfer': 'Share Transfer Dashboard',
    '/accumulation/below-cost': 'Below Cost Positions',
};

export default function AccumulationLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const title = titles[pathname] || 'Accumulation Analysis';

    return (
        <DashboardLayout title={title}>
            <div className="animate-in fade-in duration-500 pt-6 pb-10">
                {children}
            </div>
        </DashboardLayout>
    );
}
