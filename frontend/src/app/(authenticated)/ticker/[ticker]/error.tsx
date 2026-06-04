'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function TickerError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Ticker page error:', error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-slate-50 dark:bg-slate-950">
            <div className="max-w-2xl w-full bg-white dark:bg-card rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-lg">
                <h2 className="text-xl font-bold text-red-500 mb-2">Page Error</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-4 font-mono text-sm break-all">{error.message}</p>
                {error.stack && (
                    <pre className="text-left text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl overflow-auto max-h-48 mb-4">{error.stack}</pre>
                )}
                <Button onClick={reset}>Try Again</Button>
            </div>
        </div>
    );
}
