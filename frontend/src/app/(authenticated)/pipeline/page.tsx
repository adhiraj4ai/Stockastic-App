import { Suspense } from 'react';
import PipelinePageContent from './PipelinePageClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Loader2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function PipelinePage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Market Pipeline">
                <div className="flex z-50 h-screen w-full items-center justify-center bg-white/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="text-sm font-medium text-gray-500">Loading Pipeline...</p>
                    </div>
                </div>
            </DashboardLayout>
        }>
            <PipelinePageContent />
        </Suspense>
    );
}
