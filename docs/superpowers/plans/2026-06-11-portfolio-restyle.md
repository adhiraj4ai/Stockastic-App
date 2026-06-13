# Portfolio Page Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/portfolio` (Holdings + Watchlist tabs) to the Command Center visual language per the spec at `docs/superpowers/specs/2026-06-11-portfolio-restyle-design.md`, with zero changes to data fetching, endpoints, or business logic.

**Architecture:** New presentational primitives in `frontend/src/components/portfolio/ui.tsx` (SectionCard with gradient header, KpiCard, SentimentBadge, FadeIn motion wrapper, skeletons), then section-by-section adoption in `portfolio/page.tsx` (with the approved v4 reorder) and an in-place class restyle of `PortfolioTable.tsx`.

**Tech Stack:** Next.js App Router + TypeScript, Tailwind (token classes: `bg-card`, `border-border`, `bg-muted`, `text-muted-foreground`), framer-motion v12 (already a dependency), lucide-react, vitest + @testing-library/react. All commands run from `frontend/`.

**Invariants (from spec — every task must preserve these):**
- No endpoint, fetch, state, handler, or business-logic changes. Only JSX wrappers, classNames, and section order change.
- All `formatRupees`/`formatNepaliNumber` usage, InfoTooltip texts, modals, and dialogs stay byte-identical unless a step explicitly shows new code.
- Known pre-existing failure `ChatInterface.test.tsx > renders tool_use block with tool name` is OUT OF SCOPE — report, don't fix.

**Approved v4 Holdings-tab order:** action bar → KPI cards → Strategic Holdings (full-width) → [Risk Radar | Sector Allocation] → [P&L by Sector | P&L Heatmap] → Portfolio Health (full-width).

**Motion note:** the spec mentions `AnimatePresence` on tab switch; this plan deliberately achieves the same visible fade via `FadeIn` on section remount (the `{activeTab === ...}` conditionals remount sections on every tab change), avoiding a risky restructure of the conditional blocks. This is the approved interpretation — do not add `AnimatePresence`.

---

### Task 1: Presentational primitives + unit tests

**Files:**
- Create: `frontend/src/components/portfolio/ui.tsx`
- Test: `frontend/src/__tests__/unit/PortfolioUi.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/PortfolioUi.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SectionCard, KpiCard, SentimentBadge, KpiSkeleton, CardSkeleton } from '@/components/portfolio/ui';
import { Wallet } from 'lucide-react';

describe('portfolio ui primitives', () => {
    it('SectionCard renders title, badges, actions and children', () => {
        render(
            <SectionCard
                accent="emerald"
                icon={Wallet}
                title="Strategic Holdings"
                badges={<span>14 positions</span>}
                actions={<button>Add</button>}
            >
                <p>body content</p>
            </SectionCard>,
        );
        expect(screen.getByText('Strategic Holdings')).toBeInTheDocument();
        expect(screen.getByText('14 positions')).toBeInTheDocument();
        expect(screen.getByText('Add')).toBeInTheDocument();
        expect(screen.getByText('body content')).toBeInTheDocument();
    });

    it('KpiCard renders label, value and sub', () => {
        render(
            <KpiCard
                accent="blue"
                icon={Wallet}
                label="Capital Deployed"
                value="रू 21,40,000"
                sub={<SentimentBadge tone="neutral">3 accounts</SentimentBadge>}
            />,
        );
        expect(screen.getByText('Capital Deployed')).toBeInTheDocument();
        expect(screen.getByText('रू 21,40,000')).toBeInTheDocument();
        expect(screen.getByText('3 accounts')).toBeInTheDocument();
    });

    it('SentimentBadge applies tone classes', () => {
        render(<SentimentBadge tone="up">+12.4%</SentimentBadge>);
        const badge = screen.getByText('+12.4%');
        expect(badge.className).toContain('emerald');
        expect(badge.className).toContain('rounded-full');
    });

    it('skeletons render pulse placeholders', () => {
        const { container } = render(
            <>
                <KpiSkeleton />
                <CardSkeleton rows={3} />
            </>,
        );
        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/unit/PortfolioUi.test.tsx`
Expected: FAIL — cannot resolve `@/components/portfolio/ui`.

- [ ] **Step 3: Create the primitives module**

Create `frontend/src/components/portfolio/ui.tsx` with exactly:

```tsx
'use client';

import { type ComponentType, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

export type Accent = 'blue' | 'emerald' | 'amber' | 'indigo' | 'rose';

type IconType = ComponentType<{ className?: string }>;

// Static class strings per accent — never build these dynamically (Tailwind JIT safety).
const ACCENTS: Record<Accent, { chip: string; grad: string; icon: string }> = {
    blue: { chip: 'bg-blue-500/15 text-blue-500', grad: 'from-blue-500/15 to-transparent', icon: 'text-blue-500' },
    emerald: { chip: 'bg-emerald-500/15 text-emerald-500', grad: 'from-emerald-500/15 to-transparent', icon: 'text-emerald-500' },
    amber: { chip: 'bg-amber-500/15 text-amber-500', grad: 'from-amber-500/15 to-transparent', icon: 'text-amber-500' },
    indigo: { chip: 'bg-indigo-500/15 text-indigo-500', grad: 'from-indigo-500/15 to-transparent', icon: 'text-indigo-500' },
    rose: { chip: 'bg-rose-500/15 text-rose-500', grad: 'from-rose-500/15 to-transparent', icon: 'text-rose-500' },
};

export function SectionCard({
    accent,
    icon: Icon,
    title,
    info,
    badges,
    actions,
    className,
    bodyClassName,
    children,
}: {
    accent: Accent;
    icon: IconType;
    title: string;
    info?: string;
    badges?: ReactNode;
    actions?: ReactNode;
    className?: string;
    bodyClassName?: string;
    children: ReactNode;
}) {
    const a = ACCENTS[accent];
    return (
        <div className={cn('rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow', className)}>
            <div className={cn('flex flex-wrap items-center gap-2 rounded-t-2xl bg-gradient-to-r px-4 py-2.5', a.grad)}>
                <Icon className={cn('h-4 w-4 shrink-0', a.icon)} />
                <span className="text-xs font-semibold text-foreground">{title}</span>
                {info && <InfoTooltip content={info} />}
                {badges}
                {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
            </div>
            <div className={cn('p-4', bodyClassName)}>{children}</div>
        </div>
    );
}

export function KpiCard({
    accent,
    icon: Icon,
    label,
    info,
    value,
    valueClassName,
    sub,
}: {
    accent: Accent;
    icon: IconType;
    label: string;
    info?: string;
    value: ReactNode;
    valueClassName?: string;
    sub?: ReactNode;
}) {
    const a = ACCENTS[accent];
    return (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2">
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', a.chip)}>
                    <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                    {info && <InfoTooltip content={info} />}
                </span>
            </div>
            <div className={cn('mt-2 text-xl font-semibold tabular-nums text-foreground', valueClassName)}>{value}</div>
            {sub && <div className="mt-1.5">{sub}</div>}
        </div>
    );
}

export function SentimentBadge({
    tone,
    className,
    children,
}: {
    tone: 'up' | 'down' | 'warn' | 'neutral';
    className?: string;
    children: ReactNode;
}) {
    const tones = {
        up: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
        down: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
        warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
        neutral: 'bg-muted text-muted-foreground border-border',
    };
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums', tones[tone], className)}>
            {children}
        </span>
    );
}

export function FadeIn({
    delay = 0,
    className,
    children,
}: {
    delay?: number;
    className?: string;
    children: ReactNode;
}) {
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay }} className={className}>
            {children}
        </motion.div>
    );
}

export function KpiSkeleton() {
    return (
        <div className="animate-pulse rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-muted" />
                <div className="h-2.5 w-24 rounded bg-muted" />
            </div>
            <div className="mt-3 h-6 w-32 rounded bg-muted" />
            <div className="mt-2 h-4 w-20 rounded-full bg-muted" />
        </div>
    );
}

export function CardSkeleton({ rows = 6 }: { rows?: number }) {
    return (
        <div className="animate-pulse rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 h-4 w-40 rounded bg-muted" />
            <div className="space-y-3">
                {Array.from({ length: rows }, (_, i) => (
                    <div key={i} className="h-8 rounded bg-muted/70" />
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/unit/PortfolioUi.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/portfolio/ui.tsx src/__tests__/unit/PortfolioUi.test.tsx
git commit -m "feat(portfolio): presentational primitives for the Command Center restyle"
```

### Task 2: Action bar + KPI cards (page.tsx)

**Files:**
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx` (imports; action bar ~lines 392-449; summary cards ~lines 451-533)

- [ ] **Step 1: Add the primitives import**

Next to the other `@/components` imports at the top of the file:

```tsx
import { SectionCard, KpiCard, SentimentBadge, FadeIn, KpiSkeleton, CardSkeleton } from '@/components/portfolio/ui';
```

Do NOT remove the existing `Card`/`CardHeader`/`CardContent`/`CardTitle` imports yet — later sections still use them until Task 7 cleans up.

- [ ] **Step 2: Restyle the action bar (exact string replacements)**

| Old (in the action-bar block, ~392-449) | New |
|---|---|
| `appearance-none bg-white dark:bg-card border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 py-2.5 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-sm cursor-pointer` | `appearance-none bg-card border border-border text-foreground py-2.5 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium shadow-sm cursor-pointer` |
| `p-2.5 bg-white dark:bg-card border border-gray-300 dark:border-slate-700 rounded-lg shadow-sm transition-all` (Settings button template prefix) | `p-2.5 bg-card border border-border rounded-xl shadow-sm transition-all` |
| `bg-white dark:bg-card border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 p-2.5 rounded-lg shadow-sm transition-all` (New Account button) | `bg-card border border-border hover:bg-muted text-foreground p-2.5 rounded-xl shadow-sm transition-all` |
| `flex items-center gap-2 bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed` (Optimize button) | `flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed` |

Inside the Settings button's conditional classes, also replace `hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400` with `hover:bg-muted text-muted-foreground hover:text-indigo-500`.

- [ ] **Step 3: Replace the Summary Cards block (current lines ~451-533) entirely with:**

```tsx
                {/* Summary Cards - Only for Holdings */}
                {activeTab === 'holdings' && (
                    loading && displayedItems.length === 0 ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[0, 1, 2, 3].map(i => <KpiSkeleton key={i} />)}
                        </div>
                    ) : (
                        <FadeIn className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <KpiCard
                                accent="blue"
                                icon={Wallet}
                                label="Capital Deployed"
                                info="Total initial investment across all active holdings in the selected account."
                                value={formatRupees(totalInvestment)}
                                sub={<SentimentBadge tone="neutral">{displayedItems.length} holdings</SentimentBadge>}
                            />
                            <KpiCard
                                accent="emerald"
                                icon={DollarSign}
                                label="Portfolio Value"
                                info="Current market valuation of all holdings based on real-time price feeds."
                                value={formatRupees(totalCurrentValue)}
                                sub={<SentimentBadge tone="neutral">Real-time valuation</SentimentBadge>}
                            />
                            <KpiCard
                                accent="emerald"
                                icon={totalGainLoss >= 0 ? TrendingUp : TrendingDown}
                                label="Total Returns"
                                info="Net unrealized profit or loss since inception, including reinvested capital."
                                value={formatRupees(Math.abs(totalGainLoss))}
                                valueClassName={totalGainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
                                sub={
                                    <span className="flex items-center gap-2">
                                        <SentimentBadge tone={totalGainLoss >= 0 ? 'up' : 'down'}>
                                            {totalGainLoss >= 0 ? '+' : '−'}{Math.abs(totalGainLossPercent).toFixed(2)}%
                                        </SentimentBadge>
                                        {bestPerformer && (
                                            <span className="text-[11px] text-muted-foreground">
                                                Top: <span className="text-foreground">{bestPerformer.ticker}</span>
                                            </span>
                                        )}
                                    </span>
                                }
                            />
                            <KpiCard
                                accent="amber"
                                icon={Zap}
                                label="Session Swing"
                                info="Intraday profit or loss change for the current market session."
                                value={formatRupees(Math.abs(totalDayGainLoss))}
                                valueClassName={totalDayGainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
                                sub={<SentimentBadge tone={totalDayGainLoss >= 0 ? 'up' : 'down'}>Intraday movement</SentimentBadge>}
                            />
                        </FadeIn>
                    )
                )}
```

(`Wallet`, `DollarSign`, `TrendingUp`, `TrendingDown`, `Zap` are already imported in this file. The old block's `Card`, `CardHeader`, `CardTitle`, `CardContent`, `InfoTooltip` usage for these four tiles disappears.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — no NEW errors (pre-existing chat-test mock errors are out of scope).
Run: `npm test -- src/__tests__/unit/PortfolioUi.test.tsx` — PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(authenticated)/portfolio/page.tsx"
git commit -m "feat(portfolio): restyled action bar and KPI cards with skeleton loading"
```

### Task 3: Strategic Holdings section — SectionCard, reorder above Risk Radar, pagination

**Files:**
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx` (standalone RiskRadar block ~535-539; holdings Card ~543-735)

- [ ] **Step 1: Delete the standalone RiskRadar block**

Remove (it returns in Task 4 next to Sector Allocation):

```tsx
                {activeTab === 'holdings' && (
                    <div className="mt-8">
                        <RiskRadar accountId={selectedAccount} />
                    </div>
                )}
```

The holdings table block now sits directly after the Summary Cards block — the approved order.

- [ ] **Step 2: Convert the holdings Card shell to SectionCard**

Replace the opening `<Card className="shadow-lg border-blue-50/50 dark:border-slate-800 dark:bg-card">` through `</CardHeader>` (the whole CardHeader/CardTitle block, ~544-585) AND the `<CardContent className="p-0">` opener with:

```tsx
                    <FadeIn delay={0.05}>
                    <SectionCard
                        accent="emerald"
                        icon={Grid3X3}
                        title="Strategic Holdings"
                        info="Real-time list of all active positions, tracking entry costs, current value, and profit metrics."
                        badges={<>
                            <SentimentBadge tone="up">#{stats.profit} Profit</SentimentBadge>
                            <SentimentBadge tone="down">#{stats.loss} Loss</SentimentBadge>
                        </>}
                        actions={<>
                            {selectedAccount !== 'all' && (
                                <div className="flex items-center gap-3">
                                    <span className="text-muted-foreground text-xs font-normal">
                                        (Account: {accounts.find(a => a.id.toString() == selectedAccount)?.name}
                                        {accounts.find(a => a.id.toString() == selectedAccount)?.account_type === 'PAPER' ? ' - Paper Trading' : ''})
                                    </span>
                                    <button
                                        onClick={() => {
                                            setDefaultModalAccount(selectedAccount);
                                            setPromoteTicker('');
                                            setIsModalOpen(true);
                                        }}
                                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all shadow-sm active:scale-95"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Add Transaction
                                    </button>
                                </div>
                            )}
                            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>}
                        </>}
                        bodyClassName="p-0"
                    >
```

The existing onClick handlers above are byte-identical to the old code — only classNames changed. Close the section by replacing `</CardContent>` + `</Card>` at the end of the block (~733-734) with `</SectionCard>` + `</FadeIn>`. The entire inner content (empty state, all-accounts grouping, `PortfolioTable` usage, `ExitStrategyDialog`, pagination) stays in place.

- [ ] **Step 3: Loading skeleton for first load**

Inside the body, wrap the existing empty/table ternary: change

```tsx
                            {displayedItems.length === 0 && !loading ? (
```

to

```tsx
                            {loading && displayedItems.length === 0 ? (
                                <div className="p-4"><CardSkeleton rows={8} /></div>
                            ) : displayedItems.length === 0 && !loading ? (
```

(The rest of the ternary chain is unchanged.)

- [ ] **Step 4: Restyle the account-group separators (all-accounts view, ~604-625)**

Replace `className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-blue-500 pl-3 pr-2"` with `className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-500/5 px-3 py-2"`.
Replace `<h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">{acc.name}</h3>` with `<h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">{acc.name}</h3>`.
Replace the gain span classes `text-xs font-bold ${accTotalGain >= 0 ? 'text-green-600' : 'text-red-600'}` with `text-xs font-bold tabular-nums ${accTotalGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`.
Replace the per-account "Add Transaction" button classes `bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700` with `bg-indigo-600 hover:bg-indigo-700`.
Replace the inner table wrapper `rounded-xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm` with `rounded-xl border border-border overflow-hidden`.

- [ ] **Step 5: Restyle pagination (~697-732)**

Replace the pagination block content classes:
- Container: `flex flex-col sm:flex-row items-center justify-between gap-4 py-6 px-6 border-t border-gray-50` → `flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-6 border-t border-border`
- Summary div: `text-xs font-semibold` → `text-xs text-muted-foreground`, and both inner `text-gray-900` spans → `text-foreground font-semibold`
- Prev/Next buttons: `p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all` → `p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all` (both)
- Page-number buttons: active `bg-blue-600 text-white shadow-lg shadow-blue-500/30` → `bg-indigo-600 text-white shadow-sm`; inactive `text-gray-500 hover:bg-gray-100` → `text-muted-foreground hover:bg-muted`

- [ ] **Step 6: Restyle the empty state (~588-591)**

Replace `text-center py-10 text-gray-500 dark:text-gray-400 flex flex-col items-center gap-2` → `text-center py-12 text-muted-foreground flex flex-col items-center gap-2` and `h-10 w-10 text-gray-200 dark:text-gray-700` → `h-10 w-10 text-muted`.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit` — no new errors. Run: `npm test -- src/__tests__/unit/PortfolioUi.test.tsx` — PASS.

```bash
git add "src/app/(authenticated)/portfolio/page.tsx"
git commit -m "feat(portfolio): Strategic Holdings full-width SectionCard directly below KPI tiles"
```

### Task 4: Chart rows — [Risk Radar | Sector Allocation] and [P&L by Sector | Heatmap]

**Files:**
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx` (the "Visual Analytics & Heatmap Section", ~753-887 before this task)
- Modify: `frontend/src/components/RiskRadar.tsx` (outer container classes only)

- [ ] **Step 1: Replace the whole visualizer+heatmap section with two new grid rows**

Delete the block from `{/* Visual Analytics & Heatmap Section - Only for Holdings */}` through its closing `)}` and insert. The Pie/Bar/legend/heatmap JSX below is the EXISTING code moved verbatim — only the wrappers are new:

```tsx
                {/* Risk Radar + Sector Allocation - Only for Holdings */}
                {activeTab === 'holdings' && (
                    <FadeIn delay={0.1} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className={displayedItems.length > 0 ? '' : 'lg:col-span-2'}>
                            <RiskRadar accountId={selectedAccount} />
                        </div>
                        {displayedItems.length > 0 && (
                            <SectionCard
                                accent="indigo"
                                icon={PieIcon}
                                title="Sector Allocation"
                                info="Graphical deep-dive into your asset allocation and sector diversification."
                                badges={<SentimentBadge tone="neutral">{sectorData.length} sectors</SentimentBadge>}
                            >
                                <div className="relative h-[260px]">
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Diversification</span>
                                        <span className="text-lg font-semibold text-foreground">{sectorData.length} Sectors</span>
                                    </div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={sectorData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {sectorData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="rgba(255,255,255,0.2)" />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-border">
                                    {sectorData.map((s, i) => (
                                        <div key={s.name} className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                {s.name} ({((s.value / totalCurrentValue) * 100).toFixed(0)}%)
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}
                    </FadeIn>
                )}

                {/* P&L by Sector + P&L Heatmap - Only for Holdings */}
                {activeTab === 'holdings' && displayedItems.length > 0 && (
                    <FadeIn delay={0.15} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <SectionCard
                            accent="indigo"
                            icon={BarIcon}
                            title="P&L by Sector"
                            info="Performance contribution of each sector to overall profit and loss."
                        >
                            <div className="h-[260px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={sectorData} layout="vertical" margin={{ left: 20, right: 20 }}>
                                        <XAxis type="number" hide />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 11, fontWeight: 600, fill: '#6B7280' }}
                                            width={80}
                                        />
                                        <RechartsTooltip
                                            cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'rgba(0,0,0,0.8)' }}
                                        />
                                        <Bar
                                            dataKey="pnl"
                                            radius={[0, 4, 4, 0]}
                                            barSize={20}
                                        >
                                            {sectorData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.pnl >= 0 ? '#10B981' : '#F43F5E'}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </SectionCard>

                        <SectionCard
                            accent="emerald"
                            icon={Activity}
                            title="P&L Heatmap"
                            info="Each tile is a holding, colored by unrealized gain or loss intensity."
                        >
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                {displayedItems.map((item) => {
                                    const pnlP = item.gain_loss_percent;
                                    let bgColor = 'bg-gray-100 dark:bg-slate-800';
                                    if (pnlP > 20) bgColor = 'bg-emerald-600 dark:bg-emerald-700';
                                    else if (pnlP > 10) bgColor = 'bg-emerald-500 dark:bg-emerald-600';
                                    else if (pnlP > 0) bgColor = 'bg-emerald-400 dark:bg-emerald-500';
                                    else if (pnlP > -10) bgColor = 'bg-rose-400 dark:bg-rose-500';
                                    else if (pnlP > -20) bgColor = 'bg-rose-500 dark:bg-rose-600';
                                    else bgColor = 'bg-rose-600 dark:bg-rose-700';

                                    return (
                                        <div
                                            key={item.id}
                                            className={`aspect-square ${bgColor} rounded-xl flex flex-col items-center justify-center text-white shadow-inner group relative cursor-help transition-transform hover:scale-105 hover:z-20`}
                                        >
                                            <span className="text-sm font-semibold">{item.ticker}</span>
                                            <span className="text-xs font-bold opacity-80 tabular-nums">{Number(pnlP).toFixed(0)}%</span>

                                            {/* Tooltip on Hover */}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-gray-900 dark:bg-slate-950 text-white p-2 rounded-lg text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-sm z-30">
                                                <p className="font-semibold border-b border-gray-700 dark:border-slate-800 pb-1 mb-1">{item.ticker}</p>
                                                <p className="flex justify-between">Profit: <span className="font-mono">{formatRupees(item.gain_loss)}</span></p>
                                                <p className="flex justify-between">Value: <span className="font-mono">{formatRupees(item.current_value)}</span></p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <span>Bearish</span>
                                <div className="flex gap-1">
                                    <div className="h-2 w-2 rounded-sm bg-rose-600" />
                                    <div className="h-2 w-2 rounded-sm bg-rose-500" />
                                    <div className="h-2 w-2 rounded-sm bg-rose-400" />
                                    <div className="h-2 w-2 rounded-sm bg-emerald-400" />
                                    <div className="h-2 w-2 rounded-sm bg-emerald-500" />
                                    <div className="h-2 w-2 rounded-sm bg-emerald-600" />
                                </div>
                                <span>Bullish</span>
                            </div>
                        </SectionCard>
                    </FadeIn>
                )}
```

(Notable intentional changes inside the moved code: bar negative color `#EF4444`→`#F43F5E` (rose), heatmap green/red→emerald/rose, tiles `rounded-md`→`rounded-xl`, and the old dynamically-built legend swatches `bg-red-${i*200}` — which Tailwind JIT can't even generate — become six static divs. `Activity` is already imported in page.tsx; `PieIcon`/`BarIcon` are the existing import aliases.)

- [ ] **Step 2: RiskRadar container touch-up (amber accent per spec)**

In `frontend/src/components/RiskRadar.tsx`, find the component's outermost container (grep for `className=` on the root `Card` or `div`). Update ONLY its shape/border classes to match: rounded corners → `rounded-2xl`, any `border-gray-*`/`border-slate-*` outer border → `border-border`, any `shadow-lg` → `shadow-sm hover:shadow-md transition-shadow`. Then find its title/header area (the element containing the "Risk Radar" heading text): convert that header row to the SectionCard header style — wrap/replace its container classes with `flex items-center gap-2 rounded-t-2xl bg-gradient-to-r from-amber-500/15 to-transparent px-4 py-2.5`, the heading text classes with `text-xs font-semibold text-foreground`, and its leading icon (if any) with `h-4 w-4 text-amber-500`. Do not change its chart, data fetching, or layout logic. If the existing header structure makes this swap non-mechanical (e.g., title mixed with controls), apply the gradient/typography classes to the closest equivalent elements and report what you adapted.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit` — no new errors. Run: `npm test -- src/__tests__/unit/PortfolioUi.test.tsx` — PASS.

```bash
git add "src/app/(authenticated)/portfolio/page.tsx" src/components/RiskRadar.tsx
git commit -m "feat(portfolio): radar+allocation and sector-pnl+heatmap chart rows"
```

### Task 5: Portfolio Health — full-width rose SectionCard

**Files:**
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx` ("Risk Management Section", the block starting `<Card className="bg-slate-50/50 dark:bg-card border-slate-200 dark:border-slate-800 border-dashed">`)

- [ ] **Step 1: Convert the shell**

Replace the `<Card className="bg-slate-50/50 dark:bg-card border-slate-200 dark:border-slate-800 border-dashed">` + CardHeader/CardTitle block + `<CardContent>` opener with:

```tsx
                    <FadeIn delay={0.2}>
                    <SectionCard
                        accent="rose"
                        icon={ShieldAlert}
                        title="Portfolio Health"
                        info="Automated scan for sector concentration, oversized positions, and volatility hotspots."
                    >
```

and the closing `</CardContent></Card>` with `</SectionCard></FadeIn>`. Inner `<div className="grid grid-cols-1 md:grid-cols-2 gap-8">` and all logic stay.

- [ ] **Step 2: Class swaps inside the health content (exact replacements)**

| Old | New |
|---|---|
| `text-xs font-semibold mb-4 tracking-[0.2em] flex items-center gap-2 dark:text-slate-400` (Allocation Alerts h4) | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2` |
| `flex justify-between text-xs mb-1.5 p-2 bg-white dark:bg-card rounded border border-border dark:border-slate-800` | `flex justify-between items-center text-xs mb-1.5 p-2 bg-muted/30 rounded-lg border border-border` |
| `font-bold text-slate-600 dark:text-slate-300` (sector name) | `font-semibold text-foreground` |
| `text-xs font-semibold ${percent > 40 ? "text-red-500" : "text-slate-400"}` | `text-xs font-semibold tabular-nums ${percent > 40 ? "text-rose-500" : "text-muted-foreground"}` |
| `w-16 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden` | `w-16 h-1.5 bg-muted rounded-full overflow-hidden` |
| `h-full rounded-full ${percent > 40 ? 'bg-red-500' : 'bg-blue-400'}` | `h-full rounded-full ${percent > 40 ? 'bg-gradient-to-r from-rose-500 to-rose-400' : percent > 25 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-emerald-500/70'}` |
| `text-xs font-bold text-red-500 pl-2` (overexposure warning p) | `text-xs font-semibold text-rose-500 pl-2` |
| `text-xs font-semibold tracking-[0.2em] dark:text-slate-400` (Holdings Concentration h4) | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3` |
| `flex items-center justify-between text-xs bg-red-50/50 dark:bg-red-900/20 p-2.5 rounded-lg border border-red-100 dark:border-red-900/50 text-red-800 dark:text-red-400` | `flex items-center justify-between text-xs bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/25 text-rose-600 dark:text-rose-400` |
| `font-semibold bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-full` | `font-semibold tabular-nums bg-rose-500/15 px-2 py-0.5 rounded-full` |
| `text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2` | `text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/25 flex items-center gap-2` |
| `text-xs font-semibold text-slate-400 mb-4 uppercase tracking-[0.2em]` (Volatility h4) | `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3` |
| `flex items-center gap-1.5 bg-white dark:bg-card text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 shadow-sm` (volatility chip) | `flex items-center gap-1.5 bg-muted/40 text-foreground px-3 py-1.5 rounded-full text-xs font-semibold border border-border` |
| `text-xs text-slate-400 dark:text-slate-500 italic` | `text-xs text-muted-foreground italic` |

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit` — no new errors.

```bash
git add "src/app/(authenticated)/portfolio/page.tsx"
git commit -m "feat(portfolio): Portfolio Health full-width rose section with gradient bars"
```

### Task 6: PortfolioTable restyle

**Files:**
- Modify: `frontend/src/components/PortfolioTable.tsx`

- [ ] **Step 1: Import SentimentBadge**

```tsx
import { SentimentBadge } from '@/components/portfolio/ui';
```

- [ ] **Step 2: Header restyle (exact replacements)**

- Header row classes: `bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/30` → `bg-muted/40 hover:bg-muted/40 border-border`
- Replace ALL occurrences (11) of `font-bold text-gray-900 dark:text-slate-100` in `TableHead` classNames with `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`

- [ ] **Step 3: Row restyle**

Replace the body `TableRow` className template (currently the long string starting `transition-all duration-200 cursor-pointer border-l-4 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5 ...`) with:

```tsx
                                    className={`transition-colors duration-150 cursor-pointer border-l-4 border-border/50 even:bg-muted/20 ${isExitPlanDialogOpen && selectedPortfolioItem?.ticker === item.ticker ? 'bg-indigo-500/10 border-l-indigo-500' : isUnderwater ? 'border-l-rose-500/50 hover:bg-rose-500/5 hover:border-l-rose-500' : hasStrategy ? 'border-l-emerald-500/50 hover:bg-emerald-500/5 hover:border-l-emerald-500' : 'border-l-transparent hover:bg-muted/40 hover:border-l-indigo-400/50'}`}
```

(The status border-left semantics — blue selected, red underwater, green strategy — are preserved with token colors; the scale/translate hover effects are dropped per the Command Center flat-hover style.)

- [ ] **Step 4: Cell and chip restyles (exact replacements)**

- SN cell: `text-center font-bold text-gray-400 dark:text-gray-500 text-sm py-4 px-6` → `text-center font-semibold text-muted-foreground text-xs py-4 px-6 tabular-nums`
- Underwater badge classes: `bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800` → `bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25`
- Active badge classes: `bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800` → `bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25`
- SL chip: `bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800 font-bold tracking-tight shadow-sm` → `bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full border border-rose-500/25 font-semibold tabular-nums`
- TP chip: `bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-100 dark:border-green-800 font-bold tracking-tight shadow-sm` → `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/25 font-semibold tabular-nums`
- R/R chip: `bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800 font-bold tracking-tight shadow-sm` → `bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full border border-indigo-500/25 font-semibold tabular-nums`
- Numeric cells: replace all 4 occurrences of `text-gray-600 dark:text-slate-400 font-bold tracking-tight` with `text-muted-foreground font-medium tabular-nums` and the 2 occurrences of `text-gray-900 dark:text-slate-100 font-bold tracking-tight` / `font-bold text-gray-900 dark:text-slate-100 tracking-tight` with `text-foreground font-semibold tabular-nums`
- P&L cell wrapper: `text-right ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} py-4` → `text-right ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} py-4`, and its inner `font-bold text-base tracking-tight` → `font-semibold text-sm tabular-nums`
- P&L percent chip: replace the whole inner div

```tsx
                                        <div className={`text-xs font-bold tracking-tight ${isPos ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'} px-1 rounded inline-block mt-0.5`}>
                                            {Number(item.gain_loss_percent).toFixed(2)}%
                                        </div>
```

with

```tsx
                                        <div className="mt-0.5">
                                            <SentimentBadge tone={isPos ? 'up' : 'down'}>
                                                {isPos ? '+' : ''}{Number(item.gain_loss_percent).toFixed(2)}%
                                            </SentimentBadge>
                                        </div>
```

- Today's P/L cell: `text-right font-bold tracking-tight ${isDayPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} py-4` → `text-right font-semibold tabular-nums text-sm ${isDayPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} py-4`
- Health badge red tier: `bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400` → `bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400`
- Action buttons: in the Buy/Sell buttons replace `text-gray-300 dark:text-slate-600 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20` → `text-muted-foreground/40 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10` and `text-gray-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20` → `text-muted-foreground/40 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10`; in the Strategies button replace `bg-blue-600 dark:bg-blue-500 text-white shadow-xl` → `bg-indigo-600 text-white shadow-sm` and `text-gray-300 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20` → `text-muted-foreground/40 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10`
- Empty state: `p-4 text-center text-gray-500` → `p-6 text-center text-sm text-muted-foreground`

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit` — no new errors. Run: `npm test` — same pass/fail profile as baseline (only the known ChatInterface failure).

```bash
git add src/components/PortfolioTable.tsx
git commit -m "feat(portfolio): token-based table restyle with sentiment badges"
```

### Task 7: Watchlist tab restyle + cleanup + final verification

**Files:**
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx` ("Strategic Watchlist Section", `{activeTab === 'watchlist' && (...)}` block, ~988 onward)

- [ ] **Step 1: Convert the watchlist Card shell to SectionCard**

Replace `<Card className="shadow-lg border-blue-50/50 dark:border-slate-800 dark:bg-card">` + its CardHeader/CardTitle wrapper + `<CardContent className="pt-0 p-0">` opener with:

```tsx
                    <FadeIn>
                    <SectionCard
                        accent="indigo"
                        icon={Eye}
                        title="Strategic Watchlist"
                        badges={<SentimentBadge tone="neutral">{sortedAndFilteredWatchlist.length} tickers</SentimentBadge>}
                        actions={<>{/* move ALL existing CardTitle children here unchanged (the Add button and any siblings), preserving their onClick handlers */}</>}
                        bodyClassName="p-0"
                    >
```

and the block's closing `</CardContent></Card>` with `</SectionCard></FadeIn>`. Move every existing element that lived inside the old `CardTitle` (e.g., the "Add" button and any title controls) into `actions` byte-identical except: the Add button classes `bg-gray-900 dark:bg-slate-800 ... hover:bg-black dark:hover:bg-slate-700` → `bg-indigo-600 hover:bg-indigo-700` (keep the rest of its classes). If the old CardTitle contained a text label, drop it (SectionCard now provides the title).

- [ ] **Step 2: Watchlist table header restyle**

In the watchlist `TableHeader` (~1016-1027): row classes `bg-gray-50/50 dark:bg-slate-800/50 hover:bg-gray-50/50 dark:hover:bg-slate-800/50` → `bg-muted/40 hover:bg-muted/40 border-border`; replace all `font-bold text-gray-900 dark:text-slate-100` in its TableHead classNames with `text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`.

- [ ] **Step 3: Watchlist body green/red → emerald/rose sweep**

Within the watchlist block ONLY (from `{activeTab === 'watchlist' && (` to its closing `)}`), apply these class-string replacements wherever they appear (use grep to find each):
- `text-green-600` → `text-emerald-600`, `dark:text-green-400` → `dark:text-emerald-400`, `bg-green-50` → `bg-emerald-500/10`, `dark:bg-green-900/30` → `dark:bg-emerald-500/10`, `border-green-100` → `border-emerald-500/25`, `dark:border-green-800` → `dark:border-emerald-500/25`
- Same pattern for red→rose: `text-red-600` → `text-rose-600`, `dark:text-red-400` → `dark:text-rose-400`, `bg-red-50` → `bg-rose-500/10`, `dark:bg-red-900/30` → `dark:bg-rose-500/10`, `border-red-100` → `border-rose-500/25`, `dark:border-red-800` → `dark:border-rose-500/25`
Do NOT touch the modal block (`isWatchlistModalOpen`) beyond these mechanical color swaps if the strings appear there; behavior must not change. Empty state (`~1008-1011`): `text-gray-500 dark:text-gray-400` → `text-muted-foreground`, `text-gray-200 dark:text-gray-800` → `text-muted`.

- [ ] **Step 4: Watchlist pagination restyle**

Find the watchlist pagination block (anchored by the text `Monitoring` ... `key tickers`, ~1283-1310). Restyle it with the same classes as Task 3 Step 5: container border `border-border`, summary text `text-xs text-muted-foreground` with `text-foreground font-semibold` numbers, prev/next `p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-all`, active page `bg-indigo-600 text-white shadow-sm`, inactive `text-muted-foreground hover:bg-muted`. Keep all existing onClick handlers and the `watchlistCurrentPage`/`watchlistTotalPages` logic byte-identical (verify the exact state-setter names in the file before editing).

- [ ] **Step 5: Unused-import cleanup**

Run: `npx tsc --noEmit` and check whether `Card`, `CardHeader`, `CardContent`, `CardTitle` are still referenced in `page.tsx` (grep `<Card` etc.). Remove only import names with zero remaining JSX usages in this file. Same check for icons orphaned by the restyle (e.g., `BarIcon`/`PieIcon` should still be used by Task 4's sections — keep).

- [ ] **Step 6: Full verification**

Run: `npm test`
Expected: all pass except the known pre-existing `ChatInterface.test.tsx` tool_use failure.
Run: `npm run build`
Expected: production build succeeds with no type/lint errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(authenticated)/portfolio/page.tsx"
git commit -m "feat(portfolio): watchlist tab restyle and import cleanup"
```

---

**Deploy note (not part of this plan):** localhost:3000 serves the Docker-built frontend — visible only after a frontend image rebuild + hard refresh. Verify both light and dark themes visually after deploy.
