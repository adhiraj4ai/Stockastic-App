import { describe, it, expect } from 'vitest';
import {
    getTypeConfig, getSeverity, getVariant, buildRoute, getMetrics,
    getQuickActions, POPUP_DURATION, type AppNotification,
} from '@/lib/notifications/config';

const base: AppNotification = {
    id: 1, title: 't', message: 'm', type: 'STOP_LOSS_HIT', ticker: 'NABIL',
    read: false, created_at: '2026-06-11T10:00:00Z',
};

describe('notification registry', () => {
    it('maps every known type and falls back for unknown', () => {
        expect(getTypeConfig('STOP_LOSS_HIT').tone).toBe('danger');
        expect(getTypeConfig('TARGET_REACHED').tone).toBe('success');
        expect(getTypeConfig('NOT_A_REAL_TYPE').tone).toBe('info'); // fallback
    });

    it('severity: backend field wins, registry is fallback', () => {
        expect(getSeverity({ ...base, severity: 'low' })).toBe('low');
        expect(getSeverity({ ...base, severity: undefined })).toBe('critical');
    });

    it('variant: registry default, summary escalates to panel', () => {
        expect(getVariant(base)).toBe('card');
        expect(getVariant({ ...base, type: 'SIGNAL_BUY' })).toBe('line');
        expect(getVariant({ ...base, type: 'PORTFOLIO_DIVERSITY' })).toBe('none');
        expect(getVariant({ ...base, ticker: 'SUMMARY' })).toBe('panel');
        expect(getVariant({ ...base, type: 'SIGNAL_BUY', metadata: { symbols: ['A', 'B'] } })).toBe('panel');
        expect(getVariant({ ...base, type: 'DAILY_PLAN_READY' })).toBe('panel');
    });

    it('route: redirect_url first, then ticker page, then notifications', () => {
        expect(buildRoute({ ...base, redirect_url: '/portfolio?tab=holdings' })).toBe('/portfolio?tab=holdings');
        expect(buildRoute({ ...base, redirect_url: undefined })).toBe('/ticker/NABIL');
        expect(buildRoute({ ...base, redirect_url: undefined, ticker: 'SUMMARY' })).toBe('/notifications');
        expect(buildRoute({ ...base, redirect_url: undefined, ticker: null })).toBe('/notifications');
    });

    it('metrics: builds ordered strip from metadata contract keys', () => {
        const metrics = getMetrics({
            ...base,
            metadata: { price: 471.1, level: 480, level_type: 'stop', change_pct: -8.2 },
        });
        expect(metrics).toEqual([
            { label: 'LTP', value: 471.1, kind: 'price' },
            { label: 'Stop', value: 480, kind: 'price' },
            { label: 'Change', value: -8.2, kind: 'percent' },
        ]);
        expect(getMetrics({ ...base, metadata: undefined })).toEqual([]);
    });

    it('quick actions: daily plan gets briefing + plan links', () => {
        const actions = getQuickActions({
            ...base, type: 'DAILY_PLAN_READY', ticker: null, redirect_url: '/chat?session=42',
        });
        expect(actions).toEqual([
            { label: 'Open briefing', href: '/chat?session=42' },
            { label: 'View plan', href: '/plan' },
        ]);
    });

    it('popup durations by severity', () => {
        expect(POPUP_DURATION.critical).toBe(Infinity);
        expect(POPUP_DURATION.high).toBe(10000);
        expect(POPUP_DURATION.normal).toBe(6000);
    });
});
