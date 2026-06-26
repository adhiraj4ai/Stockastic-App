'use client';

import DashboardLayout from "@/components/DashboardLayout";
import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
    '/accumulation/dashboard': 'Accumulation Command Center',
    '/accumulation/trends': 'Broker Trends',
    '/accumulation/favorites': 'Broker Favorites',
    '/accumulation/navigator': 'Accumulators Navigator',
    '/accumulation/history': 'Accumulation History',
    '/accumulation/share-transfer': 'Share Transfer Dashboard',
    '/accumulation/price-study': 'Accumulation → Price Study',
    '/accumulation/smart-money': 'Smart Money Intelligence',
    '/accumulation/focus-ranking': 'Broker Focus Ranking',
    '/accumulation/below-cost': 'Below Cost Positions',
    '/accumulation/trading': 'Accumulation trading',
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
