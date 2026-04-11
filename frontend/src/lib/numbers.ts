/**
 * Robust numeric coercion and formatting layer.
 * Designed to prevent "TypeError: .toFixed is not a function" 
 * and "NaN" propagation from unreliable API data.
 */

/**
 * Coerces any input value to a finite number.
 * Handles strings with suffixes (%, Rs.), null/undefined, and objects.
 */
export const num = (v: any, fallback: number = 0): number => {
    if (v === null || v === undefined || v === '') return fallback;
    
    // If it's already a number, just check if it's finite
    if (typeof v === 'number') {
        return Number.isFinite(v) ? v : fallback;
    }

    // Handle strings (including those with currencies, percentages, or commas)
    if (typeof v === 'string') {
        const cleaned = v.replace(/[^\d.-]/g, '');
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    // Handle single-value arrays
    if (Array.isArray(v) && v.length === 1) {
        return num(v[0], fallback);
    }

    // Fallback for objects or other types
    return fallback;
};

/**
 * Safely formats a number with fixed decimal places.
 * Returns a string formatted to d decimal places or the fallback string.
 */
export const fixed = (v: any, d: number = 0, fallback: string = '0'): string => {
    // We use NaN as an internal marker for invalid inputs
    const n = num(v, NaN);
    
    if (Number.isNaN(n)) return fallback;
    
    // toFixed is safe here because n is a finite number
    return n.toFixed(d);
};

/**
 * Convenient wrapper for currency/price formatting.
 */
export const formatPrice = (v: any, fallback: string = '—'): string => {
    const n = num(v, NaN);
    if (Number.isNaN(n)) return fallback;
    return `Rs.${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

/**
 * Safely calculate percentage change between two numbers.
 */
export const calcPct = (current: any, reference: any, fallback: string = '0'): string => {
    const c = num(current, NaN);
    const r = num(reference, NaN);
    
    if (Number.isNaN(c) || Number.isNaN(r) || r === 0) return fallback;
    
    const pct = ((c - r) / r) * 100;
    return fixed(pct, 1, fallback);
};
