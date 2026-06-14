import { describe, it, expect } from 'vitest';
import {
    humanizeFinancialLabel,
    formatStatementValue,
    STATEMENT_UNIT_LABEL,
} from '@/lib/financialStatements';

describe('humanizeFinancialLabel', () => {
    it('uses the proper financial term for known metric keys', () => {
        expect(humanizeFinancialLabel('total_assets')).toBe('Total Assets');
        expect(humanizeFinancialLabel('pbt')).toBe('Profit Before Income Tax');
        expect(humanizeFinancialLabel('atms')).toBe('No. of ATMs');
    });

    it('title-cases category section keys without underscores', () => {
        expect(humanizeFinancialLabel('INCOME')).toBe('Income');
        expect(humanizeFinancialLabel('OPERATING')).toBe('Operating Activities');
        expect(humanizeFinancialLabel('NON_CURRENT_ASSETS')).toBe('Non-current Assets');
    });

    it('falls back to a title-cased label for unknown keys', () => {
        expect(humanizeFinancialLabel('foo_bar')).toBe('Foo Bar');
    });
});

describe('formatStatementValue', () => {
    it('shows currency figures in crore with no unit suffix', () => {
        expect(formatStatementValue(124503000000, 'total_assets')).toBe('12,450.30');
        expect(formatStatementValue('12045500000', 'net_profit')).toBe('1,204.55');
    });

    it('keeps percentages inline with a % sign', () => {
        expect(formatStatementValue(85.5, 'cd_ratio')).toBe('85.50%');
    });

    it('keeps counts as plain whole numbers', () => {
        expect(formatStatementValue(1500, 'branches')).toBe('1,500');
    });

    it('keeps per-share values in rupees, not crore', () => {
        expect(formatStatementValue(45.5, 'eps_reported')).toBe('रू 45.50');
    });

    it('returns a dash for missing or non-numeric values', () => {
        expect(formatStatementValue(null, 'total_assets')).toBe('-');
        expect(formatStatementValue('N/A', 'total_assets')).toBe('-');
    });
});

describe('STATEMENT_UNIT_LABEL', () => {
    it('names the rupee crore unit shown in the table header', () => {
        expect(STATEMENT_UNIT_LABEL).toBe('रू in crore');
    });
});
