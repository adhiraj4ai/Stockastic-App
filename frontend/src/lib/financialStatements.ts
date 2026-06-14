import { FINANCIAL_TEMPLATES } from '@/constants/financialTemplates';
import { num } from '@/lib/numbers';

/**
 * Labelling and value formatting for the ticker page financial statements
 * (balance sheet, profit & loss, cash flow). Raw API data is keyed by terse
 * snake_case keys; this module maps them to the proper financial terms defined
 * in the sector templates and formats values so the currency unit lives once in
 * the table header rather than being repeated on every cell.
 */

const CRORE = 10000000;

export const STATEMENT_UNIT_LABEL = 'रू in crore';

type UnitClass = 'currency' | 'percent' | 'count' | 'pershare';

const buildLabelMaps = () => {
    const metricLabels = new Map<string, string>();
    const categoryLabels = new Map<string, string>();
    for (const template of Object.values(FINANCIAL_TEMPLATES)) {
        for (const sections of Object.values(template.sections)) {
            for (const section of sections ?? []) {
                if (!categoryLabels.has(section.key)) categoryLabels.set(section.key, section.label);
                for (const particular of section.particulars) {
                    if (!metricLabels.has(particular.key)) metricLabels.set(particular.key, particular.label);
                }
            }
        }
    }
    return { metricLabels, categoryLabels };
};

const { metricLabels: METRIC_LABELS, categoryLabels: CATEGORY_LABELS } = buildLabelMaps();

const titleCaseWord = (word: string): string =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

const titleCase = (raw: string): string =>
    raw.replace(/_/g, ' ').split(' ').map(titleCaseWord).join(' ');

/** Human-readable label for a metric key or a category section key. */
export const humanizeFinancialLabel = (raw: string): string => {
    if (METRIC_LABELS.has(raw)) return METRIC_LABELS.get(raw)!;
    if (CATEGORY_LABELS.has(raw)) return titleCase(CATEGORY_LABELS.get(raw)!);
    return titleCase(raw);
};

const COUNT_KEYS = new Set(['total_employees', 'branches', 'atms', 'shares', 'policies_count']);
const PERSHARE_KEYS = new Set([
    'eps', 'eps_reported', 'eps_annualized', 'book_value', 'book_value_reported',
]);

const classifyMetric = (key: string): UnitClass => {
    const label = (METRIC_LABELS.get(key) ?? '').toLowerCase();
    if (label.includes('%') || /_ratio$|_rate$/.test(key) || ['spread', 'roe', 'roe_reported', 'npl', 'cost_of_funds'].includes(key)) return 'percent';
    if (COUNT_KEYS.has(key) || label.includes('no. of') || label.includes('number of')) return 'count';
    if (PERSHARE_KEYS.has(key) || label.includes('per share') || /\beps\b/.test(key)) return 'pershare';
    return 'currency';
};

const TWO_DP = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** Format a statement cell, putting the crore unit in the header for currency. */
export const formatStatementValue = (value: unknown, key: string): string => {
    if (value === null || value === undefined || value === '') return '-';
    const n = num(value, NaN);
    if (Number.isNaN(n)) return '-';
    switch (classifyMetric(key)) {
        case 'percent': return `${n.toLocaleString(undefined, TWO_DP)}%`;
        case 'count': return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
        case 'pershare': return `रू ${n.toLocaleString(undefined, TWO_DP)}`;
        default: return (n / CRORE).toLocaleString(undefined, TWO_DP);
    }
};
