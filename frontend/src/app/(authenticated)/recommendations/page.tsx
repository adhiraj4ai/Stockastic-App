import { Suspense } from 'react';
import RecommendationsPageContent from './RecommendationsPageClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Target } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function RecommendationsPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Market Recommendations">
                <div className="flex z-50 h-screen w-full items-center justify-center bg-white/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                        <Target className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="text-sm font-medium text-gray-500">Scanning Market Signals...</p>
                    </div>
                </div>
            </DashboardLayout>
        }>
            <RecommendationsPageContent />
        </Suspense>
    );
}
