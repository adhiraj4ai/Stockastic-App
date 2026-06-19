# Portfolio Holding Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users classify each portfolio holding as `investment` or `trading`, edit it inline via a symbol, and see portfolio totals split by the two groups.

**Architecture:** Add a `classification` CharField to `PortfolioItem` storing the lowercase keywords `investment`/`trading` (default `trading`). Expose it via the serializer plus a dedicated `update_classification` PATCH action mirroring the existing `update_tags`. On the frontend, a self-contained `ClassificationToggle` (modeled on `TagPopover`) renders a lucide symbol per row and PATCHes on click; the portfolio page computes investment-vs-trading split totals from the raw holdings and shows them inline beside the existing KPIs.

**Tech Stack:** Django 5.2 + DRF, pytest; Next.js 16 / React 19, TypeScript, Vitest + Testing Library, lucide-react icons.

## Global Constraints

- Database stores the literal lowercase keywords `investment` and `trading`; the symbol is UI-only.
- Default classification is `trading` (existing rows backfill to `trading`).
- One classification per holding (`PortfolioItem` row); no share-level split.
- Symbols: investment → lucide `Landmark`; trading → lucide `Repeat`.
- 30-line hard limit per function/method; SOLID; no magic strings (use the `Classification` enum / a shared constant).
- TDD: write the failing test first for every behavior.
- Frontend money formatting uses `lib/numbers` (`formatRupees`) — never ad hoc.
- Local Postgres is on port 5434; backend tests run via `pytest` from `backend/`.

---

## File Structure

**Backend**
- Modify: `backend/stocks/models/portfolio.py` — add `Classification` choices + `classification` field on `PortfolioItem`.
- Create: `backend/stocks/migrations/0041_portfolioitem_classification.py` — add field with default `trading`.
- Modify: `backend/stocks/serializers/portfolio.py` — add `classification` to `PortfolioItemSerializer.fields`.
- Modify: `backend/stocks/views/portfolio_views/portfolio_viewset.py` — add `update_classification` action.
- Create: `backend/stocks/tests/test_portfolio_classification.py` — model default + action tests.

**Frontend**
- Create: `frontend/src/components/ClassificationToggle.tsx` — inline symbol toggle that PATCHes.
- Create: `frontend/src/lib/portfolioTotals.ts` — pure `splitTotalsByClassification` helper.
- Modify: `frontend/src/components/PortfolioTable.tsx` — add `classification` to the `PortfolioItem` type, add `onClassificationChange` prop, render the toggle in the ticker cell.
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx` — thread `onClassificationChange`, render split totals inline near the KPIs.
- Create: `frontend/src/__tests__/unit/ClassificationToggle.test.tsx` — render + click PATCH test.
- Create: `frontend/src/__tests__/unit/portfolioTotals.test.ts` — split-helper unit test.

---

## Task 1: Backend model field + migration

**Files:**
- Modify: `backend/stocks/models/portfolio.py` (class `PortfolioItem`, ~lines 25-46)
- Create: `backend/stocks/migrations/0041_portfolioitem_classification.py`
- Test: `backend/stocks/tests/test_portfolio_classification.py`

**Interfaces:**
- Produces: `PortfolioItem.Classification` (TextChoices, values `'investment'`, `'trading'`); `PortfolioItem.classification` field defaulting to `'trading'`.

- [ ] **Step 1: Write the failing test**

Create `backend/stocks/tests/test_portfolio_classification.py`:

```python
import pytest
from django.contrib.auth.models import User
from stocks.models.portfolio import PortfolioItem


@pytest.mark.django_db
class TestPortfolioItemClassification:
    def _user(self):
        return User.objects.create_user(username='clsuser', password='pw')

    def test_new_holding_defaults_to_trading(self):
        user = self._user()
        item = PortfolioItem.objects.create(
            user=user, ticker='NABIL', quantity=10, buy_price=500
        )
        assert item.classification == 'trading'

    def test_classification_choices_are_keywords(self):
        assert PortfolioItem.Classification.INVESTMENT == 'investment'
        assert PortfolioItem.Classification.TRADING == 'trading'
        assert set(PortfolioItem.Classification.values) == {'investment', 'trading'}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest stocks/tests/test_portfolio_classification.py -v`
Expected: FAIL — `AttributeError: type object 'PortfolioItem' has no attribute 'Classification'`.

- [ ] **Step 3: Add the field to the model**

In `backend/stocks/models/portfolio.py`, inside `class PortfolioItem(models.Model):` add a nested choices class and field (place the field near `strategy_type`):

```python
    class Classification(models.TextChoices):
        INVESTMENT = 'investment', 'Investment'
        TRADING = 'trading', 'Trading'

    classification = models.CharField(
        max_length=10,
        choices=Classification.choices,
        default=Classification.TRADING,
    )
```

- [ ] **Step 4: Generate the migration**

Run: `cd backend && python manage.py makemigrations stocks`
Expected: creates `stocks/migrations/0041_portfolioitem_classification.py` adding `classification` with default `trading`. Verify the file name/number; if a different number is assigned, use that.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest stocks/tests/test_portfolio_classification.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/models/portfolio.py backend/stocks/migrations/0041_portfolioitem_classification.py backend/stocks/tests/test_portfolio_classification.py
git commit -m "feat(portfolio): add investment/trading classification field to PortfolioItem"
```

---

## Task 2: Serializer field + update_classification action

**Files:**
- Modify: `backend/stocks/serializers/portfolio.py` (`PortfolioItemSerializer.Meta.fields`, ~lines 33-38)
- Modify: `backend/stocks/views/portfolio_views/portfolio_viewset.py` (add action after `update_tags`, ~line 419)
- Test: `backend/stocks/tests/test_portfolio_classification.py` (extend)

**Interfaces:**
- Consumes: `PortfolioItem.Classification` from Task 1.
- Produces: endpoint `PATCH /api/stocks/portfolio/{id}/update_classification/` (DRF url name `portfolio-update-classification`), body `{"classification": "investment"|"trading"}`, returns `{"id", "ticker", "classification"}`; 400 on invalid value. `classification` present in `PortfolioItemSerializer` output.

- [ ] **Step 1: Write the failing tests**

Append to `backend/stocks/tests/test_portfolio_classification.py`:

```python
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestUpdateClassificationAction:
    def _client_and_item(self):
        user = User.objects.create_user(username='clsapi', password='pw')
        client = APIClient()
        client.force_authenticate(user=user)
        item = PortfolioItem.objects.create(
            user=user, ticker='NABIL', quantity=10, buy_price=500
        )
        return client, item

    def test_set_to_investment(self):
        client, item = self._client_and_item()
        url = reverse('portfolio-update-classification', args=[item.id])
        res = client.patch(url, {'classification': 'investment'}, format='json')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['classification'] == 'investment'
        item.refresh_from_db()
        assert item.classification == 'investment'

    def test_invalid_value_rejected(self):
        client, item = self._client_and_item()
        url = reverse('portfolio-update-classification', args=[item.id])
        res = client.patch(url, {'classification': 'gambling'}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        item.refresh_from_db()
        assert item.classification == 'trading'

    def test_serializer_exposes_classification(self):
        client, item = self._client_and_item()
        res = client.get(reverse('portfolio-list'))
        assert res.status_code == status.HTTP_200_OK
        assert 'classification' in res.data[0]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest stocks/tests/test_portfolio_classification.py::TestUpdateClassificationAction -v`
Expected: FAIL — `NoReverseMatch` for `portfolio-update-classification` (and the serializer test KeyErrors).

- [ ] **Step 3: Add `classification` to the serializer**

In `backend/stocks/serializers/portfolio.py`, add `'classification'` to `PortfolioItemSerializer.Meta.fields` (append to the existing list, e.g. after `'strategy_type'`):

```python
                  'thesis', 'strategy_type', 'classification', 'tags', 'target_allocation_pct']
```

- [ ] **Step 4: Add the action to the viewset**

In `backend/stocks/views/portfolio_views/portfolio_viewset.py`, after the `update_tags` method (ends ~line 419), add:

```python
    @action(detail=True, methods=['patch'])
    def update_classification(self, request, pk=None):
        item = self.get_object()
        value = request.data.get('classification')
        if value not in PortfolioItem.Classification.values:
            return Response(
                {"error": "classification must be 'investment' or 'trading'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item.classification = value
        item.save(update_fields=['classification'])
        return Response({"id": item.id, "ticker": item.ticker, "classification": item.classification})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest stocks/tests/test_portfolio_classification.py -v`
Expected: PASS (all classes green).

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/serializers/portfolio.py backend/stocks/views/portfolio_views/portfolio_viewset.py backend/stocks/tests/test_portfolio_classification.py
git commit -m "feat(portfolio): expose classification and add update_classification action"
```

---

## Task 3: Frontend ClassificationToggle + table wiring

**Files:**
- Create: `frontend/src/components/ClassificationToggle.tsx`
- Modify: `frontend/src/components/PortfolioTable.tsx` (type ~line 22-44; props ~line 64-86; ticker cell ~line 191-203)
- Test: `frontend/src/__tests__/unit/ClassificationToggle.test.tsx`

**Interfaces:**
- Consumes: `update_classification` endpoint from Task 2.
- Produces: `Classification` type (`'investment' | 'trading'`); `<ClassificationToggle itemId classification onChange? />`; `PortfolioItem.classification?: Classification`; new `PortfolioTable` prop `onClassificationChange?: (id: number, value: Classification) => void`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/ClassificationToggle.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import api from '@/lib/api';
import { ClassificationToggle } from '@/components/ClassificationToggle';

vi.mock('@/lib/api', () => ({
    default: { patch: vi.fn().mockResolvedValue({ data: {} }) },
}));

describe('ClassificationToggle', () => {
    afterEach(() => vi.clearAllMocks());

    it('shows the investment symbol with an investment label', () => {
        render(<ClassificationToggle itemId={1} classification="investment" />);
        expect(screen.getByRole('button', { name: /investment/i })).toBeInTheDocument();
    });

    it('flips trading -> investment and PATCHes update_classification', async () => {
        const onChange = vi.fn();
        render(<ClassificationToggle itemId={7} classification="trading" onChange={onChange} />);
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() =>
            expect(api.patch).toHaveBeenCalledWith(
                '/api/stocks/portfolio/7/update_classification/',
                { classification: 'investment' },
            ),
        );
        expect(onChange).toHaveBeenCalledWith(7, 'investment');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/ClassificationToggle.test.tsx`
Expected: FAIL — cannot resolve `@/components/ClassificationToggle`.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/ClassificationToggle.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { Landmark, Repeat } from 'lucide-react';
import api from '@/lib/api';

export type Classification = 'investment' | 'trading';

const META: Record<Classification, { label: string; Icon: typeof Landmark; cls: string }> = {
    investment: { label: 'Investment', Icon: Landmark, cls: 'text-blue-600 dark:text-blue-400' },
    trading: { label: 'Trading', Icon: Repeat, cls: 'text-amber-600 dark:text-amber-400' },
};

interface Props {
    itemId: number;
    classification: Classification;
    onChange?: (id: number, value: Classification) => void;
}

export function ClassificationToggle({ itemId, classification, onChange }: Props) {
    const [value, setValue] = useState<Classification>(classification);
    const [saving, setSaving] = useState(false);

    const toggle = async () => {
        const next: Classification = value === 'investment' ? 'trading' : 'investment';
        const prev = value;
        setValue(next);
        setSaving(true);
        try {
            await api.patch(`/api/stocks/portfolio/${itemId}/update_classification/`, { classification: next });
            onChange?.(itemId, next);
        } catch {
            setValue(prev);
        } finally {
            setSaving(false);
        }
    };

    const { label, Icon, cls } = META[value];
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            disabled={saving}
            aria-label={`${label} — click to switch`}
            title={`${label} — click to switch`}
            className={`p-0.5 rounded transition-all hover:bg-muted/60 ${cls}`}
        >
            <Icon size={14} />
        </button>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/ClassificationToggle.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 5: Wire it into PortfolioTable**

In `frontend/src/components/PortfolioTable.tsx`:

a) Add the import near the top:

```tsx
import { ClassificationToggle, Classification } from '@/components/ClassificationToggle';
```

b) In the `PortfolioItem` interface (~line 22-44) add:

```tsx
    classification?: Classification;
```

c) In `PortfolioTableProps` (~line 64-74) add:

```tsx
    onClassificationChange?: (id: number, value: Classification) => void;
```

d) Destructure it in the component signature (~line 76-86), adding `onClassificationChange,` to the params.

e) In the ticker cell, render the toggle right after `<StockLink ticker={item.ticker} />` (~line 192):

```tsx
                                                <ClassificationToggle
                                                    itemId={item.id}
                                                    classification={item.classification ?? 'trading'}
                                                    onChange={onClassificationChange}
                                                />
```

- [ ] **Step 6: Run the table-related tests + lint**

Run: `cd frontend && npx vitest run src/__tests__/unit/ClassificationToggle.test.tsx && npm run lint`
Expected: tests PASS; lint clean for the changed files.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ClassificationToggle.tsx frontend/src/components/PortfolioTable.tsx frontend/src/__tests__/unit/ClassificationToggle.test.tsx
git commit -m "feat(portfolio): inline investment/trading symbol toggle in holdings table"
```

---

## Task 4: Split totals on the portfolio page

**Files:**
- Create: `frontend/src/lib/portfolioTotals.ts`
- Create: `frontend/src/__tests__/unit/portfolioTotals.test.ts`
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx` (state ~line 92; pass prop to `PortfolioTable` ~lines 586/616; render split totals near KPIs ~lines 460-480)

**Interfaces:**
- Consumes: `PortfolioItem` (with `classification`) and `ClassificationToggle.onChange` from Task 3.
- Produces: `splitTotalsByClassification(items)` returning `{ investment: GroupTotals; trading: GroupTotals }` where `GroupTotals = { invested: number; current: number; gainLoss: number }`.

- [ ] **Step 1: Write the failing helper test**

Create `frontend/src/__tests__/unit/portfolioTotals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitTotalsByClassification } from '@/lib/portfolioTotals';

describe('splitTotalsByClassification', () => {
    const items = [
        { classification: 'investment', investment_value: 1000, current_value: 1200, gain_loss: 200 },
        { classification: 'trading', investment_value: 500, current_value: 450, gain_loss: -50 },
        { classification: 'trading', investment_value: 300, current_value: 360, gain_loss: 60 },
    ];

    it('sums invested, current and gain/loss per group', () => {
        const totals = splitTotalsByClassification(items as never);
        expect(totals.investment).toEqual({ invested: 1000, current: 1200, gainLoss: 200 });
        expect(totals.trading).toEqual({ invested: 800, current: 810, gainLoss: 10 });
    });

    it('treats a missing classification as trading', () => {
        const totals = splitTotalsByClassification([{ investment_value: 100, current_value: 110, gain_loss: 10 }] as never);
        expect(totals.trading.invested).toBe(100);
        expect(totals.investment.invested).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/portfolioTotals.test.ts`
Expected: FAIL — cannot resolve `@/lib/portfolioTotals`.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/lib/portfolioTotals.ts`:

```ts
import type { PortfolioItem } from '@/components/PortfolioTable';

export interface GroupTotals {
    invested: number;
    current: number;
    gainLoss: number;
}

export interface SplitTotals {
    investment: GroupTotals;
    trading: GroupTotals;
}

const empty = (): GroupTotals => ({ invested: 0, current: 0, gainLoss: 0 });

export function splitTotalsByClassification(items: PortfolioItem[]): SplitTotals {
    const totals: SplitTotals = { investment: empty(), trading: empty() };
    for (const item of items) {
        const group = item.classification === 'investment' ? totals.investment : totals.trading;
        group.invested += Number(item.investment_value);
        group.current += Number(item.current_value);
        group.gainLoss += Number(item.gain_loss);
    }
    return totals;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/portfolioTotals.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Render split totals + wire the toggle callback in the page**

In `frontend/src/app/(authenticated)/portfolio/page.tsx`:

a) Add the import near the other imports (~line 40):

```tsx
import { splitTotalsByClassification } from '@/lib/portfolioTotals';
```

b) Compute split totals from the account-scoped raw holdings. Add after `displayedItems` is defined (~line 292):

```tsx
    const splitTotals = useMemo(
        () => splitTotalsByClassification(displayedItems),
        [displayedItems],
    );
```

c) Render the split inline beside the existing KPIs. Locate the KPI block (the `KpiCard`s around lines 460-480) and add, after the last KPI card in that row:

```tsx
                            <KpiCard
                                accent="blue"
                                icon={Landmark}
                                label="Investment vs trading"
                                value={`${formatRupees(splitTotals.investment.current)} / ${formatRupees(splitTotals.trading.current)}`}
                                sub={
                                    <SentimentBadge tone="neutral">
                                        {`P/L ${formatRupees(splitTotals.investment.gainLoss)} / ${formatRupees(splitTotals.trading.gainLoss)}`}
                                    </SentimentBadge>
                                }
                            />
```

Ensure `Landmark` is imported from `lucide-react` in the page (add to the existing lucide import on ~line 11), and `formatRupees`/`KpiCard`/`SentimentBadge` are already imported (they are, per current file).

d) Pass the toggle callback to BOTH `PortfolioTable` usages (~lines 586 and 616). The handler updates `items` so totals recompute:

```tsx
                                                        onClassificationChange={(id, value) =>
                                                            setItems(prev => prev.map(it => it.id === id ? { ...it, classification: value } : it))
                                                        }
```

- [ ] **Step 6: Run all frontend unit tests + lint + build**

Run: `cd frontend && npm run test && npm run lint`
Expected: all unit tests PASS; lint clean.

Run: `cd frontend && npm run build`
Expected: production build succeeds (type-checks the page wiring).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/portfolioTotals.ts frontend/src/__tests__/unit/portfolioTotals.test.ts "frontend/src/app/(authenticated)/portfolio/page.tsx"
git commit -m "feat(portfolio): show investment vs trading split totals near KPIs"
```

---

## Task 5: Full regression + deploy notes

**Files:** none (verification only)

- [ ] **Step 1: Run the backend portfolio suite**

Run: `cd backend && pytest stocks/tests/test_portfolio_classification.py stocks/tests/test_views_portfolio_refactor.py -v`
Expected: all PASS.

- [ ] **Step 2: Run the frontend suite**

Run: `cd frontend && npm run test`
Expected: all PASS.

- [ ] **Step 3: Record deploy steps**

Deploy requires (no seed/beat changes):

```bash
docker-compose exec backend python manage.py migrate
# rebuild frontend image so localhost:3000 picks up the change, then hard refresh
docker-compose up -d --build frontend
```

- [ ] **Step 4: Commit any final docs touch-ups (if needed)**

```bash
git add -A && git commit -m "chore(portfolio): classification feature verification notes" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Data model field + keywords + default `trading` → Task 1. ✓
- Migration backfill → Task 1 (schema default). ✓
- Serializer field + `update_classification` action + validation → Task 2. ✓
- Inline symbol toggle (Landmark/Repeat) → Task 3. ✓
- Split totals inline near KPIs → Task 4. ✓
- TDD tests backend + frontend → Tasks 1-4. ✓
- Deploy notes (migrate + frontend rebuild) → Task 5. ✓

**Out-of-scope (per spec):** filtering, sectioning, share-level split, chat/exports/snapshots — none added. Known limitation: in the all-accounts merged view the toggle edits the representative holding's id; acceptable for this iteration.

**Type consistency:** `Classification = 'investment' | 'trading'` defined once in `ClassificationToggle.tsx` and reused via `PortfolioItem.classification`; `splitTotalsByClassification` returns `{investment, trading}` with `{invested, current, gainLoss}` used consistently in the page render. Endpoint path/url-name identical across Task 2 (definition) and Task 3 (consumer).

**Placeholder scan:** no TBD/TODO; all code blocks complete.
