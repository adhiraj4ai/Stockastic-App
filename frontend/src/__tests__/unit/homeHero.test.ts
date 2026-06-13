import { describe, it, expect } from 'vitest';
import {
    marketPhase,
    traderPrompt,
    TRADER_PROMPTS,
    resolveOmniboxIntent,
} from '@/lib/homeHero';

// Local-time Date helper: 2026-06-14 is a Sunday (NEPSE trading day)
const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 5, day, hour, minute);

describe('marketPhase', () => {
    it('is preopen before 11:00 on a trading day (Sunday)', () => {
        expect(marketPhase(at(14, 9))).toBe('preopen');
        expect(marketPhase(at(14, 10, 59))).toBe('preopen');
    });

    it('is open between 11:00 and 15:00 on trading days (Sun–Thu)', () => {
        expect(marketPhase(at(14, 11))).toBe('open'); // Sunday
        expect(marketPhase(at(18, 14, 59))).toBe('open'); // Thursday
    });

    it('is closed after 15:00 on a trading day', () => {
        expect(marketPhase(at(14, 15))).toBe('closed');
        expect(marketPhase(at(14, 20))).toBe('closed');
    });

    it('is closed all day on Friday and Saturday', () => {
        expect(marketPhase(at(19, 12))).toBe('closed'); // Friday
        expect(marketPhase(at(20, 9))).toBe('closed');  // Saturday
    });
});

describe('traderPrompt', () => {
    it('returns a prompt from the pool matching the phase', () => {
        const openPrompt = traderPrompt(at(14, 12));
        expect(TRADER_PROMPTS.open).toContain(openPrompt);
        const closedPrompt = traderPrompt(at(20, 9));
        expect(TRADER_PROMPTS.closed).toContain(closedPrompt);
    });

    it('is stable within the same day (date-seeded, not random)', () => {
        expect(traderPrompt(at(14, 11, 5))).toBe(traderPrompt(at(14, 14, 55)));
    });

    it('rotates across consecutive trading days', () => {
        const prompts = [14, 15, 16, 17].map(d => traderPrompt(at(d, 12)));
        expect(new Set(prompts).size).toBeGreaterThan(1);
    });
});

describe('resolveOmniboxIntent', () => {
    const companies = [
        { symbol: 'ADBL', name: 'Agricultural Development Bank' },
        { symbol: 'NABIL', name: 'Nabil Bank Ltd.' },
    ];

    it('routes an exact symbol match to the ticker page, case-insensitively', () => {
        expect(resolveOmniboxIntent('adbl', companies, true))
            .toEqual({ type: 'ticker', symbol: 'ADBL' });
    });

    it('routes anything with a question mark to chat', () => {
        expect(resolveOmniboxIntent('ADBL?', companies, true))
            .toEqual({ type: 'chat', q: 'ADBL?' });
    });

    it('routes question-word openers to chat', () => {
        expect(resolveOmniboxIntent('should I buy ADBL', companies, true))
            .toEqual({ type: 'chat', q: 'should I buy ADBL' });
        expect(resolveOmniboxIntent('why is nabil up today', companies, true))
            .toEqual({ type: 'chat', q: 'why is nabil up today' });
    });

    it('routes long natural-language input (4+ words) to chat', () => {
        expect(resolveOmniboxIntent('tell me about my portfolio', companies, true))
            .toEqual({ type: 'chat', q: 'tell me about my portfolio' });
    });

    it('keeps short company-name searches on the ticker path', () => {
        // two words with a live search match — search intent, not a question
        const results = [{ symbol: 'NABIL', name: 'Nabil Bank Ltd.' }];
        expect(resolveOmniboxIntent('nabil bank', results, true))
            .toEqual({ type: 'ticker', symbol: 'NABIL' });
    });

    it('falls back to the first company match for partial input', () => {
        expect(resolveOmniboxIntent('agri', companies, true))
            .toEqual({ type: 'ticker', symbol: 'ADBL' });
    });

    it('uppercases a lone unknown token as a ticker guess', () => {
        expect(resolveOmniboxIntent('upper', [], true))
            .toEqual({ type: 'ticker', symbol: 'UPPER' });
    });

    it('never routes to chat without the chat permission', () => {
        expect(resolveOmniboxIntent('should I buy ADBL', companies, false).type)
            .toBe('ticker');
        expect(resolveOmniboxIntent('ADBL?', companies, false))
            .toEqual({ type: 'ticker', symbol: 'ADBL' });
    });

    it('returns null for empty input', () => {
        expect(resolveOmniboxIntent('   ', companies, true)).toBeNull();
    });
});
