import { describe, it, expect } from 'vitest';
import { navItems } from '@/components/navItems';

type Item = { name: string; href?: string; permission?: string; subItems?: Item[] };

const items = navItems as Item[];
const group = (name: string) => items.find((i) => i.name === name)!;
const subNames = (name: string) => group(name).subItems!.map((s) => s.name);
const allLeaves = (): Item[] => items.flatMap((i) => (i.subItems ? i.subItems : [i]));

describe('sidebar navItems structure', () => {
    it('orders top-level sections Plan → Watch → Act → Review', () => {
        expect(items.map((i) => i.name)).toEqual([
            'Home',
            'Plan',
            'Signals',
            'Market',
            'Floorsheet',
            'Portfolio',
            'Broker Research',
            'AI Tools',
            'Admin',
        ]);
    });

    it('keeps Floorsheet to pure floorsheet views', () => {
        expect(subNames('Floorsheet')).toEqual([
            'Floorsheet',
            'Bulk Transactions',
            'Matching Transactions',
            'Volume Profile',
        ]);
    });

    it('moves Accumulation History and Share Transfer into Broker Research', () => {
        expect(subNames('Broker Research')).toEqual([
            'Command Center',
            'Smart Money',
            'Broker Trends',
            'Focus Ranking',
            'Price Study',
            'Broker Favorites',
            'Accumulators Navigator',
            'Below Cost Positions',
            'Accumulation History',
            'Share Transfer',
        ]);
        const hrefs = group('Broker Research').subItems!.map((s) => s.href);
        expect(hrefs).toContain('/accumulation/history');
        expect(hrefs).toContain('/accumulation/share-transfer');
    });

    it('renames items without touching their routes', () => {
        const byHref = Object.fromEntries(allLeaves().map((l) => [l.href, l.name]));
        expect(byHref['/market/activity']).toBe('Market Activity');
        expect(byHref['/market/pa-screener']).toBe('PA Screener');
        expect(byHref['/admin/users']).toBe('Users');
    });

    it('keeps the exact route set unchanged (38 unique hrefs)', () => {
        const hrefs = allLeaves().map((l) => l.href).sort();
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs).toEqual(
            [
                '/',
                '/plan',
                '/signals',
                '/strategies',
                '/signals/track-record',
                '/market/live',
                '/market',
                '/market/movers',
                '/market/activity',
                '/market/rotation',
                '/market/pa-screener',
                '/social',
                '/floorsheet',
                '/market/bulk',
                '/market/matching',
                '/market/volume-profile',
                '/portfolio',
                '/portfolio/performance',
                '/portfolio/income',
                '/portfolio/transactions',
                '/plan/trade-plans',
                '/plan/watchlist',
                '/paper-trading',
                '/accumulation/dashboard',
                '/accumulation/smart-money',
                '/accumulation/trends',
                '/accumulation/focus-ranking',
                '/accumulation/price-study',
                '/accumulation/favorites',
                '/accumulation/navigator',
                '/accumulation/below-cost',
                '/accumulation/history',
                '/accumulation/share-transfer',
                '/chat',
                '/notebook',
                '/admin/users',
                '/admin/financials',
                '/admin/pipeline',
            ].sort(),
        );
    });

    it('keeps permission keys for moved/renamed items', () => {
        const byHref = Object.fromEntries(allLeaves().map((l) => [l.href, l.permission]));
        expect(byHref['/accumulation/history']).toBe('accumulation_history');
        expect(byHref['/accumulation/share-transfer']).toBe('share_transfer');
        expect(byHref['/market/activity']).toBe('market_activity');
        expect(byHref['/market/pa-screener']).toBe('market_pa_screener');
        expect(byHref['/admin/users']).toBe('admin_user_mgmt');
    });
});
