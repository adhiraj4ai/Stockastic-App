import { cookies } from 'next/headers';
import { MarketSummary } from '@/components/MarketSummary';
import PublicLayout from '@/components/PublicLayout';
import { MarketPulse } from '@/components/MarketPulse';

/**
 * Root Home Page - Server Component
 * Detects authentication state via HttpOnly cookies and renders 
 * the appropriate dashboard view.
 */
export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  const isAuthenticated = !!token;

  if (isAuthenticated) {
    // MarketPulse includes its own DashboardLayout internally
    return (
      <MarketPulse />
    );
  }

  // Guest landing view
  return (
    <PublicLayout>
      <MarketSummary />
    </PublicLayout>
  );
}
