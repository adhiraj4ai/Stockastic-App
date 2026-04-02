import { Suspense } from 'react';
import TrackRecordClient from './TrackRecordClient';
import DashboardLayout from '@/components/DashboardLayout';
import { RefreshCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function SignalTrackRecordPage() {
    return (
        <DashboardLayout title="Track Record" subtitle="Historical signal performance and win/loss analysis">
            <Suspense fallback={
                <div className="flex z-50 h-[calc(100vh-100px)] w-full items-center justify-center bg-transparent">
                    <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="text-sm font-medium text-slate-500">Loading Track Record...</p>
                    </div>
                </div>
            }>
                <TrackRecordClient />
            </Suspense>
        </DashboardLayout>
    );
}
