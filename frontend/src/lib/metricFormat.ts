import { formatPercent, formatRupees } from '@/lib/formatters';

/**
 * Format a StockFundamental metric by its semantic type.
 * Percent fields (ROE, yields, growth) get a % suffix, ratios stay plain
 * numbers, per-share values get rupee formatting and market cap is shown
 * in crores. Backend DecimalFields arrive as strings.
 */

const PERCENT_KEYS = new Set([
    'ro_equity', 'ro_assets', 'dividend_yield', 'dividend_payout_ratio',
    'qoq_earnings_growth', 'yoy_earnings_growth', 'graham_number_diff',
    'earning_yield', 'operating_margin', 'net_margin', 'net_margin_quarterly', 'asset_turnover',
]);

const RATIO_KEYS = new Set([
    'pe_ratio', 'price_to_book', 'pb_ratio', 'peg_ratio', 'price_to_sales', 'debt_to_equity',
    'pe_ratio_5yr', 'beta_3m', 'beta_1y', 'beta_3y',
]);

// String-valued fields ('Positive' / 'Negative') shown as-is
const TEXT_KEYS = new Set(['eps_trend', 'roe_trend']);

const CRORE = 10000000;

export function formatMetricValue(key: string, value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '-';
    const baseKey = key.replace(/_unaudited$/, '');
    if (TEXT_KEYS.has(baseKey)) return String(value);
    const numValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(numValue)) return '-';

    if (PERCENT_KEYS.has(baseKey)) return formatPercent(numValue);
    if (RATIO_KEYS.has(baseKey)) return numValue.toFixed(2);
    if (baseKey === 'market_cap') return `${formatRupees(numValue / CRORE, 2)} Cr`;
    return formatRupees(numValue, 2);
}
