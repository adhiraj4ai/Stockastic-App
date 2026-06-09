'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { StrategyWorkspaceNav } from './StrategyWorkspaceNav';

/**
 * One consistent chrome for every strategy tab (Overview / Build / Code / Backtest /
 * Optimize): the dashboard shell + the persistent workspace header & tab bar + a shared
 * content container. Each tab renders ONLY its own content inside this, so switching tabs
 * keeps the same frame instead of showing a different page header each time.
 */
export function WorkspaceShell({ strategyId, children, wide = false }: {
    strategyId: string; children: React.ReactNode; wide?: boolean;
}) {
    return (
        <DashboardLayout showBack>
            <div className={`${wide ? 'max-w-[1600px]' : 'max-w-7xl'} mx-auto px-4 py-4 space-y-4`}>
                <StrategyWorkspaceNav strategyId={strategyId} />
                {children}
            </div>
        </DashboardLayout>
    );
}
