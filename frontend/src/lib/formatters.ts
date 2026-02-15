/**
 * Format a number in Nepali style (lakhs and crores system)
 * Example: 12345678 -> 1,23,45,678
 */
export function formatNepaliNumber(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';

    // Convert to string and remove existing formatting
    const numStr = value.toString().replace(/,/g, '');

    // Handle decimal numbers
    const parts = numStr.split('.');
    let integerPart = parts[0];
    const decimalPart = parts[1];

    // Handle negative numbers
    const isNegative = integerPart.startsWith('-');
    if (isNegative) {
        integerPart = integerPart.substring(1);
    }

    // Apply Nepali formatting
    let formatted = '';
    const length = integerPart.length;

    if (length <= 3) {
        formatted = integerPart;
    } else {
        // Last 3 digits
        formatted = integerPart.substring(length - 3);
        let remaining = integerPart.substring(0, length - 3);

        // Add commas every 2 digits for the rest
        while (remaining.length > 0) {
            if (remaining.length <= 2) {
                formatted = remaining + ',' + formatted;
                remaining = '';
            } else {
                formatted = remaining.substring(remaining.length - 2) + ',' + formatted;
                remaining = remaining.substring(0, remaining.length - 2);
            }
        }
    }

    // Add negative sign back if needed
    if (isNegative) {
        formatted = '-' + formatted;
    }

    // Add decimal part if exists
    if (decimalPart) {
        formatted += '.' + decimalPart;
    }

    return formatted;
}

/**
 * Parse a Nepali formatted number string to a plain number string
 * Example: "1,23,45,678" -> "12345678"
 */
export function parseNepaliNumber(value: string): string {
    if (!value) return '';
    return value.replace(/,/g, '');
}

/**
 * Format number for display in Nepali style with optional decimal places
 */
export function formatNepaliCurrency(value: number | string | null | undefined, decimals: number = 2): string {
    if (value === null || value === undefined || value === '' || value === undefined) return '';

    const numValue = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;

    if (isNaN(numValue)) return '';

    // Round to specified decimal places
    const rounded = decimals > 0 ? numValue.toFixed(decimals) : Math.round(numValue).toString();

    return formatNepaliNumber(rounded);
}

/**
 * Format a value as Nepali Rupees (रू)
 * Example: 12345678 -> रू 1,23,45,678
 */
export function formatRupees(value: number | string | null | undefined, decimals: number = 0): string {
    const formatted = formatNepaliCurrency(value, decimals);
    if (!formatted) return '';
    return `रू ${formatted}`;
}
