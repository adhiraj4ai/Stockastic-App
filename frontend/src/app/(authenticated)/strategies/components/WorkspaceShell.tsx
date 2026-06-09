'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { StrategyWorkspaceNav } from './StrategyWorkspaceNav';

/**
 * One consistent chrome for every strategy tab (Overview / Build / Code / Backtest /
 * Optimize): the dashboard shell + the persistent workspace header & tab bar + a shared
 * content container. Each tab renders ONLY its own content inside this, so switching tabs
 * keeps the same frame instead of showing a different page header each time.
 */
export function WorkspaceShell({ strategyId, children }: {
    strategyId: string; children: React.ReactNode;
}) {
    return (
        <DashboardLayout showBack>
            <div className="w-full px-4 sm:px-6 py-4 space-y-4">
                <StrategyWorkspaceNav strategyId={strategyId} />
                {children}
            </div>
        </DashboardLayout>
    );
}
