'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function RunRedirect() {
    const router = useRouter();
    const params = useParams();
    const id = params.id;

    useEffect(() => {
        // Redirect to backtest page
        router.replace(`/strategies/${id}/backtest`);
    }, [id, router]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <p className="text-gray-500">Redirecting to backtest...</p>
        </div>
    );
}