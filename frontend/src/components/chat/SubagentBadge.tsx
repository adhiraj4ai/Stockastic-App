import { Activity, LineChart, Target, Wallet, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUBAGENT_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; }> = {
    'market-analyst': { label: 'Market Analyst', icon: Activity },
    'stock-analyst': { label: 'Stock Analyst', icon: LineChart },
    'buy-sell-strategist': { label: 'Strategist', icon: Target },
    'portfolio-advisor': { label: 'Portfolio Advisor', icon: Wallet },
};

export function SubagentBadge({
    name,
    className,
    size = 'md',
}: {
    name: string;
    className?: string;
    size?: 'sm' | 'md';
}) {
    const meta = SUBAGENT_META[name] || { label: name, icon: Bot };
    const Icon = meta.icon;
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 font-medium text-foreground',
                size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
                className,
            )}
        >
            <Icon size={size === 'sm' ? 10 : 12} className="text-muted-foreground" />
            {meta.label}
        </span>
    );
}
