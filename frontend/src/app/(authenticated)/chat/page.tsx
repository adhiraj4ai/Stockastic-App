import { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { FullPageLoader } from '@/components/ui/StockLoader';
import ChatPageClient from './ChatPageClient';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
    return (
        <Suspense
            fallback={
                <DashboardLayout title="Chat" noPadding>
                    <FullPageLoader />
                </DashboardLayout>
            }
        >
            <ChatPageClient />
        </Suspense>
    );
}
