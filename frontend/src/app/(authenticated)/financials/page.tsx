import { Suspense } from 'react';
import FinancialsPageContent from './FinancialsPageClient';
import DashboardLayout from '@/components/DashboardLayout';
import { PageLoader } from '@/components/ui/StockLoader';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Financials">
                <PageLoader />
            </DashboardLayout>
        }>
            <FinancialsPageContent />
        </Suspense>
    );
}
