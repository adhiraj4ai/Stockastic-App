import { Suspense } from 'react';
import FinancialsPageContent from './FinancialsPageClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Financials">
                <div className="flex h-screen items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
            </DashboardLayout>
        }>
            <FinancialsPageContent />
        </Suspense>
    );
}
