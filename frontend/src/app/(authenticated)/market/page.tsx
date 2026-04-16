'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { MarketSummary } from '@/components/MarketSummary';

export default function DashboardPage() {
    return (
        <DashboardLayout
            noPadding
            title={<>Market <span className="text-blue-600 dark:text-blue-400">Terminal</span></>}
            subtitle="Real-time analytics and predictive insights for your strategic operations."
        >
            <MarketSummary />
        </DashboardLayout>
    );
}
