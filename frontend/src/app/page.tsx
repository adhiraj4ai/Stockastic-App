'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { MarketSummary } from '@/components/MarketSummary';
import PublicLayout from '@/components/PublicLayout';
import { FullPageLoader } from '@/components/ui/StockLoader';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get('access_token');
    if (token) {
      setIsAuthenticated(true);
      router.replace('/market');
    } else {
      setIsAuthenticated(false);
    }
  }, [router]);

  if (isAuthenticated === null) {
    return <FullPageLoader />;
  }

  if (isAuthenticated) {
    return <FullPageLoader />;
  }

  return (
    <PublicLayout>
      <MarketSummary />
    </PublicLayout>
  );
}
