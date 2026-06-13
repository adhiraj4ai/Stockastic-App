import { type AppNotification, getSeverity, getVariant, type Severity } from './config';

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const MAX_POPUPS = 3;

export function selectPopups(
    notifications: AppNotification[],
    seenIds: ReadonlySet<number>,
): { popups: AppNotification[]; overflow: number } {
    const candidates = notifications
        .filter(n => !n.read && !seenIds.has(n.id) && getVariant(n) !== 'none')
        .sort((a, b) => SEVERITY_ORDER[getSeverity(a)] - SEVERITY_ORDER[getSeverity(b)]);
    return {
        popups: candidates.slice(0, MAX_POPUPS),
        overflow: Math.max(0, candidates.length - MAX_POPUPS),
    };
}
