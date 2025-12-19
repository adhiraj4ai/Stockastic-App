'use client';

import { CompanySelect } from './CompanySelect';
import { useRouter } from 'next/navigation';

export function SearchBar() {
    const router = useRouter();

    const handleTickerChange = (ticker: string) => {
        if (ticker) {
            router.push(`/stock/${ticker}`);
        }
    };

    return (
        <div className="flex-1 flex justify-center">
            <div className="w-full max-w-md">
                <CompanySelect
                    onChange={handleTickerChange}
                    className="w-full h-10"
                />
            </div>
        </div>
    );
}
