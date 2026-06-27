import { Suspense } from 'react';
import SignalsBoard from '@/components/signals/SignalsBoard';
import DashboardLayout from '@/components/DashboardLayout';
import { PageLoader } from '@/components/ui/StockLoader';

export const dynamic = 'force-dynamic';

export default function SignalsPage() {
    return (
        <Suspense fallback={<DashboardLayout title="Signals"><PageLoader /></DashboardLayout>}>
            <SignalsBoard />
        </Suspense>
    );
}
