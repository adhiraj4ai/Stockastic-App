import { redirect } from 'next/navigation';

/**
 * Ticker Intelligence is now the home page. This route permanently
 * redirects to `/`, which renders the ticker search landing.
 * Detail pages (/ticker/[ticker]) are unaffected.
 */
export default function TickerIndexRedirect() {
    redirect('/');
}
