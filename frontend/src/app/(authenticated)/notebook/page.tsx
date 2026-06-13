'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { NotebookInterface } from '@/components/chat/NotebookInterface';
import { NotebookDashboard } from '@/components/chat/NotebookDashboard';

export const dynamic = 'force-dynamic';

function NotebookPageContent() {
    const searchParams = useSearchParams();
    const notebookId = searchParams.get('id');

    if (notebookId) {
        return (
            <DashboardLayout title="Notebook" subtitle="AI-powered research notebook" noPadding>
                <div className="h-[calc(100vh-72px)] overflow-hidden">
                    <NotebookInterface notebookId={notebookId} />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title="Notebooks" subtitle="Your AI-powered research notebooks">
            <NotebookDashboard />
        </DashboardLayout>
    );
}

export default function NotebookPage() {
    return (
        <Suspense fallback={null}>
            <NotebookPageContent />
        </Suspense>
    );
}
