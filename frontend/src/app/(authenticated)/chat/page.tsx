import { Suspense } from 'react';
import ChatContent from './ChatPageClient';
import DashboardLayout from '@/components/DashboardLayout';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Chat" noPadding>
                <div className="flex h-full items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
                </div>
            </DashboardLayout>
        }>
            <ChatContent />
        </Suspense>
    );
}
