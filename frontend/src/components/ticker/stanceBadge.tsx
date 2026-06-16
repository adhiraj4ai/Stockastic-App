const STANCE_STYLES: Record<string, string> = {
    bullish: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    bearish: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const ASPECT_LABELS: Record<string, string> = {
    technical: 'Technical',
    fundamental: 'Fundamental',
    both: 'Technical + fundamental',
};

function pill(className: string, label: string) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
            {label}
        </span>
    );
}

export function StanceBadge({ stance }: { stance: string }) {
    const style = STANCE_STYLES[stance] ?? STANCE_STYLES.neutral;
    const label = stance ? stance[0].toUpperCase() + stance.slice(1) : 'Neutral';
    return pill(style, label);
}

export function AspectBadge({ aspect }: { aspect: string }) {
    return pill('bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', ASPECT_LABELS[aspect] ?? 'Both');
}
