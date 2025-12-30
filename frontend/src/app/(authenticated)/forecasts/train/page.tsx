import { Suspense } from 'react';
import TrainModelPageContent from './TrainPageClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function TrainModelPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Train New Model" subtitle="Configure and train forecasting models for stock price prediction">
                <div className="h-screen flex flex-col items-center justify-center text-gray-400 p-12 text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                        <Activity size={32} className="opacity-20 animate-pulse" />
                    </div>
                    <p className="text-sm">Loading training interface...</p>
                </div>
            </DashboardLayout>
        }>
            <TrainModelPageContent />
        </Suspense>
    );
}
