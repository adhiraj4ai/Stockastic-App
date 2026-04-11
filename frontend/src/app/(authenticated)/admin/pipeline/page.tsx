import { Suspense } from 'react';
import PipelinePageContent from './PipelinePageClient';
import DashboardLayout from '@/components/DashboardLayout';
import { FullPageLoader } from '@/components/ui/StockLoader';

export const dynamic = 'force-dynamic';

export default function PipelinePage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Market Pipeline">
                <FullPageLoader />
            </DashboardLayout>
        }>
            <PipelinePageContent />
        </Suspense>
    );
}
