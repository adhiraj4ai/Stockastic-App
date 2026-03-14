import { Suspense } from 'react';
import ChatContent from './ChatPageClient';
import DashboardLayout from '@/components/DashboardLayout';
import { FullPageLoader } from '@/components/ui/StockLoader';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Chat" noPadding>
                <FullPageLoader />
            </DashboardLayout>
        }>
            <ChatContent />
        </Suspense>
    );
}
