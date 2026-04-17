'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { MarketTerminal } from '@/components/MarketTerminal';

export default function DashboardPage() {
    return (
        <DashboardLayout
            noPadding
            title={<>Market <span className="text-blue-600 dark:text-blue-400">Terminal</span></>}
            subtitle="Deep analytical insights and portfolio-correlated market mapping."
        >
            <MarketTerminal />
        </DashboardLayout>
    );
}
