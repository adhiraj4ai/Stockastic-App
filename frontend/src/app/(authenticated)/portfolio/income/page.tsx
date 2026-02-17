'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { DividendIncome } from '@/components/DividendIncome';

export default function IncomePage() {
    return (
        <DashboardLayout
            title="Dividend & Bonus Tracker"
            subtitle="Track your cash flow and stock dividends based on book closure dates"
        >
            {/* Added container for padding consistency if needed, but DashboardLayout handles general padding */}
            <DividendIncome />
        </DashboardLayout>
    );
}
