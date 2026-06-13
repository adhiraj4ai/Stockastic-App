import { Suspense } from 'react';
import IntelHubClient from './IntelHubClient';
import DashboardLayout from '@/components/DashboardLayout';
import { RefreshCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function SignalsPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Signals">
                <div className="flex z-50 h-screen w-full items-center justify-center bg-white/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="text-sm font-medium text-gray-500">Loading Signals...</p>
                    </div>
                </div>
            </DashboardLayout>
        }>
            <IntelHubClient />
        </Suspense>
    );
}
