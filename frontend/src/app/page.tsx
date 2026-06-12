import { cookies } from 'next/headers';
import { MarketSummary } from '@/components/MarketSummary';
import PublicLayout from '@/components/PublicLayout';
import { TickerLanding } from '@/components/TickerLanding';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';

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
    // Home is now Ticker Intelligence. The live-market dashboard moved to /market/live.
    // TickerLanding includes its own DashboardLayout internally.
    // This route sits outside the (authenticated) group, so it must mount
    // NotificationProvider itself — DashboardLayout's AlertsDropdown consumes it.
    return (
      <NotificationProvider>
        <TickerLanding />
      </NotificationProvider>
    );
  }

  // Guest landing view
  return (
    <PublicLayout>
      <MarketSummary />
    </PublicLayout>
  );
}
