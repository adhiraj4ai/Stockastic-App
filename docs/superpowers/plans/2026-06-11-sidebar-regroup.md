# Sidebar Regroup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder, regroup, and rename the sidebar navigation to match the user's Plan → Watch → Act → Review workflow with plain descriptive names, per the approved spec at `docs/superpowers/specs/2026-06-11-sidebar-regroup-design.md`.

**Architecture:** Extract the `navItems` array out of `frontend/src/components/DashboardLayout.tsx` into a new data-only module `frontend/src/components/navItems.ts` (so it can be unit-tested without importing the whole layout's dependency tree), apply the new structure there, and update the handful of other files that hardcode old group labels. No routes, permission keys, or rendering logic change.

**Tech Stack:** Next.js (App Router) + TypeScript frontend in `frontend/`, lucide-react icons, vitest (jsdom, `@` → `src` alias). All commands below run from `frontend/`.

**Invariants (from spec):** Every `href` and every `permission` string stays byte-identical. Only `name` labels, grouping, and ordering change.

---

## File Structure

- Create: `frontend/src/components/navItems.ts` — the nav data (groups, items, icons, permissions), exported as `navItems`.
- Create: `frontend/src/__tests__/unit/navItems.test.ts` — locks in group order, moved items, renames, and the full unchanged route set.
- Modify: `frontend/src/components/DashboardLayout.tsx` — delete inline `navItems` (lines 26–115), import from `./navItems`, trim the lucide import, update the basic-tier fallback array, rename the hardcoded `/signals` header.
- Modify: `frontend/src/app/(authenticated)/signals/page.tsx` — "Strategic Hub" → "Signals" (title + loading text).
- Modify: `frontend/src/app/(authenticated)/admin/users/UsersManagementClient.tsx` — permission-group labels that mirror nav group names.

---

### Task 1: Write the failing nav-structure test

**Files:**
- Test: `frontend/src/__tests__/unit/navItems.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/navItems.test.ts` with exactly:

```ts
import { describe, it, expect } from 'vitest';
import { navItems } from '@/components/navItems';

type Item = { name: string; href?: string; permission?: string; subItems?: Item[] };

const items = navItems as Item[];
const group = (name: string) => items.find((i) => i.name === name)!;
const subNames = (name: string) => group(name).subItems!.map((s) => s.name);
const allLeaves = (): Item[] => items.flatMap((i) => (i.subItems ? i.subItems : [i]));

describe('sidebar navItems structure', () => {
    it('orders top-level sections Plan → Watch → Act → Review', () => {
        expect(items.map((i) => i.name)).toEqual([
            'Home',
            "Tomorrow's Plan",
            'Signals',
            'Market',
            'Floorsheet',
            'Portfolio',
            'Broker Research',
            'AI Tools',
            'Admin',
        ]);
    });

    it('keeps Floorsheet to pure floorsheet views', () => {
        expect(subNames('Floorsheet')).toEqual([
            'Floorsheet',
            'Bulk Transactions',
            'Matching Transactions',
            'Volume Profile',
        ]);
    });

    it('moves Accumulation History and Share Transfer into Broker Research', () => {
        expect(subNames('Broker Research')).toEqual([
            'Command Center',
            'Smart Money',
            'Broker Trends',
            'Focus Ranking',
            'Price Study',
            'Broker Favorites',
            'Accumulators Navigator',
            'Below Cost Positions',
            'Accumulation History',
            'Share Transfer',
        ]);
        const hrefs = group('Broker Research').subItems!.map((s) => s.href);
        expect(hrefs).toContain('/accumulation/history');
        expect(hrefs).toContain('/accumulation/share-transfer');
    });

    it('renames items without touching their routes', () => {
        const byHref = Object.fromEntries(allLeaves().map((l) => [l.href, l.name]));
        expect(byHref['/market/activity']).toBe('Market Activity');
        expect(byHref['/market/pa-screener']).toBe('PA Screener');
        expect(byHref['/admin/users']).toBe('Users');
    });

    it('keeps the exact route set unchanged (38 unique hrefs)', () => {
        const hrefs = allLeaves().map((l) => l.href).sort();
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs).toEqual(
            [
                '/',
                '/plan',
                '/signals',
                '/strategies',
                '/signals/track-record',
                '/market/live',
                '/market',
                '/market/movers',
                '/market/activity',
                '/market/rotation',
                '/market/pa-screener',
                '/social',
                '/floorsheet',
                '/market/bulk',
                '/market/matching',
                '/market/volume-profile',
                '/portfolio',
                '/portfolio/performance',
                '/portfolio/income',
                '/portfolio/transactions',
                '/portfolio/watchlist',
                '/portfolio/plans',
                '/paper-trading',
                '/accumulation/dashboard',
                '/accumulation/smart-money',
                '/accumulation/trends',
                '/accumulation/focus-ranking',
                '/accumulation/price-study',
                '/accumulation/favorites',
                '/accumulation/navigator',
                '/accumulation/below-cost',
                '/accumulation/history',
                '/accumulation/share-transfer',
                '/chat',
                '/notebook',
                '/admin/users',
                '/admin/financials',
                '/admin/pipeline',
            ].sort(),
        );
    });

    it('keeps permission keys for moved/renamed items', () => {
        const byHref = Object.fromEntries(allLeaves().map((l) => [l.href, l.permission]));
        expect(byHref['/accumulation/history']).toBe('accumulation_history');
        expect(byHref['/accumulation/share-transfer']).toBe('share_transfer');
        expect(byHref['/market/activity']).toBe('market_activity');
        expect(byHref['/market/pa-screener']).toBe('market_pa_screener');
        expect(byHref['/admin/users']).toBe('admin_user_mgmt');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/__tests__/unit/navItems.test.ts`
Expected: FAIL — cannot resolve `@/components/navItems` (module does not exist yet).

### Task 2: Create the navItems data module

**Files:**
- Create: `frontend/src/components/navItems.ts`

- [ ] **Step 1: Create the module with the new structure**

Create `frontend/src/components/navItems.ts` with exactly (every `href`, `permission`, `icon`, and `color` is carried over from the old inline array in `DashboardLayout.tsx:26-115` — only names, grouping, and order differ):

```ts
import { Home, CalendarClock, Layers, Radar, Lightbulb, History, Building2, Activity, LayoutDashboard, Zap, BarChart3, Target, Share2, FileText, GitMerge, Wallet, Briefcase, TrendingUp, DollarSign, Eye, Star, Brain, Users, TrendingDown, MessageSquare, NotebookPen, Shield } from 'lucide-react';

export const navItems = [
    { name: 'Home', href: '/', icon: Home, permission: 'home', color: 'text-blue-500' },
    { name: "Tomorrow's Plan", href: '/plan', icon: CalendarClock, permission: 'daily_plan', color: 'text-orange-500' },
    {
        name: 'Signals',
        icon: Layers,
        color: 'text-cyan-500',
        subItems: [
            { name: 'Intel Hub', href: '/signals', icon: Radar, permission: 'intel_hub' },
            { name: 'Strategies', href: '/strategies', icon: Lightbulb, permission: 'strategies' },
            { name: 'Track Record', href: '/signals/track-record', icon: History, permission: 'track_record' },
        ]
    },
    {
        name: 'Market',
        icon: Building2,
        color: 'text-emerald-500',
        subItems: [
            { name: 'Live Market', href: '/market/live', icon: Activity, permission: 'home' },
            { name: 'Terminal', href: '/market', icon: LayoutDashboard, permission: 'market_overview' },
            { name: 'Movers & Shakers', href: '/market/movers', icon: Zap, permission: 'market_movers' },
            { name: 'Market Activity', href: '/market/activity', icon: Activity, permission: 'market_activity' },
            { name: 'Sector Rotation', href: '/market/rotation', icon: BarChart3, permission: 'market_rotation' },
            { name: 'PA Screener', href: '/market/pa-screener', icon: Target, permission: 'market_pa_screener' },
            { name: 'Social Highlights', href: '/social', icon: Share2, permission: 'market_social' },
        ]
    },
    {
        name: 'Floorsheet',
        icon: FileText,
        color: 'text-amber-500',
        subItems: [
            { name: 'Floorsheet', href: '/floorsheet', icon: FileText, permission: 'market_floorsheet' },
            { name: 'Bulk Transactions', href: '/market/bulk', icon: Layers, permission: 'market_bulk' },
            { name: 'Matching Transactions', href: '/market/matching', icon: GitMerge, permission: 'market_matching' },
            { name: 'Volume Profile', href: '/market/volume-profile', icon: BarChart3, permission: 'market_volume' },
        ]
    },
    {
        name: 'Portfolio',
        icon: Wallet,
        color: 'text-violet-500',
        subItems: [
            { name: 'My Portfolio', href: '/portfolio', icon: Briefcase, permission: 'portfolio_main' },
            { name: 'Performance', href: '/portfolio/performance', icon: TrendingUp, permission: 'portfolio_performance' },
            { name: 'Income', href: '/portfolio/income', icon: DollarSign, permission: 'portfolio_income' },
            { name: 'Transactions', href: '/portfolio/transactions', icon: History, permission: 'portfolio_transactions' },
            { name: 'Watchlist', href: '/portfolio/watchlist', icon: Eye, permission: 'portfolio_watchlist' },
            { name: 'Trade Plans', href: '/portfolio/plans', icon: Layers, permission: 'portfolio_trade_plans' },
            { name: 'Paper Trading', href: '/paper-trading', icon: LayoutDashboard, permission: 'paper_trading' },
        ]
    },
    {
        name: 'Broker Research',
        icon: Activity,
        color: 'text-rose-500',
        subItems: [
            { name: 'Command Center', href: '/accumulation/dashboard', icon: Layers, permission: 'accumulation_dash' },
            { name: 'Smart Money', href: '/accumulation/smart-money', icon: Brain, permission: 'smart_money' },
            { name: 'Broker Trends', href: '/accumulation/trends', icon: BarChart3, permission: 'broker_trends' },
            { name: 'Focus Ranking', href: '/accumulation/focus-ranking', icon: Target, permission: 'focus_ranking' },
            { name: 'Price Study', href: '/accumulation/price-study', icon: TrendingUp, permission: 'price_study' },
            { name: 'Broker Favorites', href: '/accumulation/favorites', icon: Star, permission: 'broker_favorites' },
            { name: 'Accumulators Navigator', href: '/accumulation/navigator', icon: Users, permission: 'navigator' },
            { name: 'Below Cost Positions', href: '/accumulation/below-cost', icon: TrendingDown, permission: 'below_cost' },
            { name: 'Accumulation History', href: '/accumulation/history', icon: History, permission: 'accumulation_history' },
            { name: 'Share Transfer', href: '/accumulation/share-transfer', icon: Share2, permission: 'share_transfer' },
        ]
    },
    {
        name: 'AI Tools',
        icon: Brain,
        color: 'text-fuchsia-500',
        subItems: [
            { name: 'Chat', href: '/chat', icon: MessageSquare, permission: 'chat' },
            { name: 'Notebooks', href: '/notebook', icon: NotebookPen, permission: 'chat' },
        ]
    },
    {
        name: 'Admin',
        icon: Shield,
        color: 'text-slate-500 dark:text-slate-400',
        subItems: [
            { name: 'Users', href: '/admin/users', icon: Users, permission: 'admin_user_mgmt' },
            { name: 'Financials', href: '/admin/financials', icon: FileText, permission: 'admin_financials' },
            { name: 'Pipeline', href: '/admin/pipeline', icon: GitMerge, permission: 'admin_pipeline' },
        ]
    },
];
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- src/__tests__/unit/navItems.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add src/components/navItems.ts src/__tests__/unit/navItems.test.ts
git commit -m "feat(nav): extract navItems module with workflow-ordered grouping"
```

### Task 3: Wire DashboardLayout to the new module

**Files:**
- Modify: `frontend/src/components/DashboardLayout.tsx` (inline array at lines 26–115, lucide import at line 8, basic-tier array at line 259, hardcoded header at line 604)

- [ ] **Step 1: Replace the lucide import (line 8)**

Only these icons are still used by the layout itself after the nav data moves out (`Home` and `User` appear later in the file only as strings, not icons — do not import them):

```ts
import { TrendingUp, TrendingDown, LogOut, ArrowLeft, Settings, PanelLeftClose, PanelLeftOpen, ChevronDown } from 'lucide-react';
```

- [ ] **Step 2: Delete the inline `navItems` array (lines 26–115, including the `// Chat moved to top nav` comment) and add the import**

Next to the other local imports (e.g., after the `SearchBar` import):

```ts
import { navItems } from './navItems';
```

- [ ] **Step 3: Update the basic-tier fallback array (line 259)**

Old:
```ts
            const basic = ['Home', 'Market', 'Finfolio'];
```
New:
```ts
            const basic = ['Home', 'Market', 'Portfolio'];
```

- [ ] **Step 4: Rename the hardcoded `/signals` header (line 604)**

Old:
```tsx
                                            Strategic Hub
```
New:
```tsx
                                            Signals
```
(The `<h2>` inside the `pathname.startsWith('/signals')` branch; subtitle text stays.)

- [ ] **Step 5: Type-check and run tests**

Run: `npx tsc --noEmit`
Expected: no errors (if it flags a now-unused lucide icon name in DashboardLayout.tsx, remove that name from the import added in Step 1).

Run: `npm test -- src/__tests__/unit/navItems.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardLayout.tsx
git commit -m "feat(nav): workflow-ordered sidebar; plain group names"
```

### Task 4: Update remaining old-label references

**Files:**
- Modify: `frontend/src/app/(authenticated)/signals/page.tsx` (lines 11, 15)
- Modify: `frontend/src/app/(authenticated)/admin/users/UsersManagementClient.tsx` (lines 292, 327, 329, 1036, 1038)

Leave alone: `MarketSummary.tsx:58` ("Sector Deep Dive" is a marketing blurb about sector rotation, unrelated to the renamed nav item) and the "User Management" page titles at `admin/users/page.tsx:11` / `UsersManagementClient.tsx:487` (accurate page headings, not nav-group references).

- [ ] **Step 1: signals/page.tsx — rename title and loading text**

Old (line 11): `<DashboardLayout title="Strategic Hub">` → New: `<DashboardLayout title="Signals">`
Old (line 15): `Loading Strategic Hub...` → New: `Loading Signals...`

- [ ] **Step 2: UsersManagementClient.tsx — sync permission-group labels with new nav names**

Five exact string replacements:

| Line | Old | New |
|------|-----|-----|
| 292 | `market_pa_screener: 'Global PA Screener',` | `market_pa_screener: 'PA Screener',` |
| 327 | `{ name: 'Finfolio Suite', keys: [...` | `{ name: 'Portfolio Suite', keys: [...` (only the name string) |
| 329 | `{ name: 'Strategic Hub', keys: [...` | `{ name: 'Signals', keys: [...` (only the name string) |
| 1036 | `group.name === 'Finfolio Suite'` | `group.name === 'Portfolio Suite'` |
| 1038 | `group.name === 'Strategic Hub'` | `group.name === 'Signals'` |

Lines 1036/1038 must match 327/329 exactly or the permission-group color coding silently breaks.

- [ ] **Step 3: Verify no stale group-label references remain**

Run: `grep -rn -E "Finfolio|Strategic Hub|Stockastic AI|'Deep Dive'|Global PA Screener" src --include='*.tsx' --include='*.ts'`
Expected: no matches.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass (9 pre-existing test files + the new navItems test).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(authenticated\)/signals/page.tsx src/app/\(authenticated\)/admin/users/UsersManagementClient.tsx
git commit -m "feat(nav): align page titles and permission groups with new nav names"
```

### Task 5: Final verification

- [ ] **Step 1: Full test suite + production build**

Run: `npm test && npm run build`
Expected: tests pass; `next build` completes with no type or lint errors.

- [ ] **Step 2: Manual smoke check (if a dev server is available)**

Run `npm run dev`, load the app, and confirm: 9 sections in the order Home, Tomorrow's Plan, Signals, Market, Floorsheet, Portfolio, Broker Research, AI Tools, Admin; expanding Broker Research shows Accumulation History and Share Transfer; clicking items navigates to unchanged routes; the /signals header reads "Signals".

**Deploy note (not part of this plan):** localhost:3000 serves the Docker-built frontend — the change is visible there only after a frontend image rebuild + hard refresh.
