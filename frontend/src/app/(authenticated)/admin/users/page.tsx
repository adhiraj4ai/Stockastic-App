import { Suspense } from 'react';
import UsersManagementClient from './UsersManagementClient';
import DashboardLayout from '@/components/DashboardLayout';
import { PageLoader } from '@/components/ui/StockLoader';

export const dynamic = 'force-dynamic';

export default function UsersManagementPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="User Management">
                <PageLoader />
            </DashboardLayout>
        }>
            <UsersManagementClient />
        </Suspense>
    );
}
