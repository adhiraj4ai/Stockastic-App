import { fixed } from '@/lib/numbers';

export function ConvictionMeter({ value }: { value: number }) {
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div className="flex items-center gap-2">
            <span className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                <span className="block h-full rounded-full bg-foreground/80" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground" style={{ minWidth: 20 }}>
                {fixed(value, 0)}
            </span>
        </div>
    );
}
