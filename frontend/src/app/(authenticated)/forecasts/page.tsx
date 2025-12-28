import { Suspense } from 'react';
import ForecastsPageContent from './ForecastsPageClient';
import DashboardLayout from '@/components/DashboardLayout';
import { BrainCircuit } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function ForecastsPage() {
    return (
        <Suspense fallback={
            <DashboardLayout
                title={
                    <div className="flex items-center gap-3">
                        <BrainCircuit className="w-8 h-8 text-blue-600" />
                        <span>ML Forecasting</span>
                    </div>
                }
                subtitle="Orchestrate and monitor your predictive intelligence"
            >
                <div className="space-y-3 bg-slate-50/50 min-h-screen flex items-center justify-center">
                    <div className="h-20 w-20 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin"></div>
                </div>
            </DashboardLayout>
        }>
            <ForecastsPageContent />
        </Suspense>
    );
}
