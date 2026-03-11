/**
 * Export data to CSV and trigger browser download.
 */

interface CsvColumn<T> {
    key: keyof T;
    header: string;
    format?: (value: any) => string;
}

export function exportToCsv<T extends Record<string, any>>(
    filename: string,
    data: T[],
    columns: CsvColumn<T>[]
) {
    if (data.length === 0) return;

    const escapeField = (val: string): string => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
    };

    const header = columns.map(c => escapeField(c.header)).join(',');
    const rows = data.map(row =>
        columns.map(col => {
            const raw = row[col.key];
            if (raw === null || raw === undefined) return '';
            const value = col.format ? col.format(raw) : String(raw);
            return escapeField(value);
        }).join(',')
    );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
