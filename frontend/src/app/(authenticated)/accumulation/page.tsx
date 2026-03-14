'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AccumulationPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/accumulation/overview');
    }, [router]);

    return (
        <div className="flex h-[70vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                <p className="text-gray-500 font-medium">Redirecting to Accumulation Overview...</p>
            </div>
        </div>
    );
}
