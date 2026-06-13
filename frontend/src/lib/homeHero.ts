// Pure logic for the home-page hero: market-phase trader greetings and
// omnibox intent resolution (ticker search vs. AI chat).

export type MarketPhase = 'preopen' | 'open' | 'closed';

export interface OmniboxCompany {
    symbol: string;
    name: string;
}

export type OmniboxIntent =
    | { type: 'ticker'; symbol: string }
    | { type: 'chat'; q: string }
    | null;

// NEPSE trades Sunday–Thursday, 11:00–15:00 local time.
const TRADING_DAYS = new Set([0, 1, 2, 3, 4]); // getDay(): Sun=0 … Thu=4

export function marketPhase(now: Date): MarketPhase {
    if (!TRADING_DAYS.has(now.getDay())) return 'closed';
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes < 11 * 60) return 'preopen';
    if (minutes < 15 * 60) return 'open';
    return 'closed';
}

export const TRADER_PROMPTS: Record<MarketPhase, string[]> = {
    preopen: [
        'The bell rings at 11 — who’s on your radar before the crowd wakes up?',
        'Plans made before the open are worth double. What’s yours today?',
        'Quiet tape, clear head. Which setup are you stalking this morning?',
        'Smart money positions early — done your homework?',
    ],
    open: [
        'The tape is live — where is the smart money flowing right now?',
        'Every candle tells a story. Which one are you reading?',
        'Volume never lies. Who’s accumulating while everyone else is scrolling?',
        'Market’s open — trade the plan, not the emotion.',
    ],
    closed: [
        'Markets are closed — the best traders are reviewing, not refreshing.',
        'The tape sleeps; the homework doesn’t. What did today teach you?',
        'Closed session, open mind — which setup earns a spot on tomorrow’s plan?',
        'Patience is a position too. Who’s on your watchlist for the next bell?',
    ],
};

// Date-seeded selection: stable within a day, rotates daily.
export function traderPrompt(now: Date): string {
    const pool = TRADER_PROMPTS[marketPhase(now)];
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
    return pool[dayOfYear % pool.length];
}

const QUESTION_OPENERS = new Set([
    'why', 'what', 'how', 'when', 'where', 'which', 'who',
    'should', 'is', 'are', 'can', 'will', 'does', 'do', 'did',
    'tell', 'show', 'explain', 'compare', 'analyze', 'analyse', 'summarize',
]);

/**
 * Decide where Enter on the omnibox goes.
 *
 * Precedence: exact symbol match → ticker (so "ADBL" never opens chat);
 * then question signals (a "?", a question-word opener, or 4+ words) → chat;
 * then live search results → first match; lone unknown token → ticker guess.
 * The dropdown's explicit "Ask AI" row remains the escape hatch when the
 * heuristic guesses search but the user wanted chat.
 */
export function resolveOmniboxIntent(
    input: string,
    companies: OmniboxCompany[],
    canChat: boolean,
): OmniboxIntent {
    const text = input.trim();
    if (!text) return null;

    const exact = companies.find(c => c.symbol.toLowerCase() === text.toLowerCase());
    if (exact) return { type: 'ticker', symbol: exact.symbol };

    const words = text.split(/\s+/);
    const looksLikeQuestion =
        text.includes('?') ||
        QUESTION_OPENERS.has(words[0].toLowerCase().replace(/[^a-z]/g, '')) ||
        words.length >= 4;
    if (canChat && looksLikeQuestion) return { type: 'chat', q: text };

    if (companies.length > 0) return { type: 'ticker', symbol: companies[0].symbol };
    if (words.length === 1) return { type: 'ticker', symbol: words[0].toUpperCase() };
    if (canChat) return { type: 'chat', q: text };
    return { type: 'ticker', symbol: words[0].toUpperCase() };
}
