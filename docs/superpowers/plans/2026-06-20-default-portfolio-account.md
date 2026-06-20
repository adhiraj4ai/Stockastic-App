# Default Portfolio Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user mark one portfolio account as default, so the portfolio page pre-selects it on load and buy/sell forms pre-fill it.

**Architecture:** Add an `is_default` boolean to `PortfolioAccount` plus a `set_default` viewset action that enforces one default per user atomically. The frontend derives `defaultAccountId` from the fetched accounts and uses it for initial selection and form pre-fill, with a "Set as default" control in the account settings dialog and a "Default" badge.

**Tech Stack:** Django 5.2 + DRF, pytest; Next.js 16 / React 19, TypeScript, Vitest + Testing Library.

## Global Constraints

- One default account per user, enforced in the `set_default` action (atomic) — not a DB constraint.
- `is_default` is read-only in the serializer; changed only via `POST /api/stocks/accounts/{id}/set_default/`.
- Buy/sell pre-fill rule: `selectedAccount !== 'all' ? selectedAccount : (defaultAccountId ?? '')`.
- Initial page pre-selection applies once on load (a did-initialise guard); never overrides a later manual switch.
- Money/number formatting via `@/lib/formatters`; sentence-case, no all-caps; 30-line hard limit per function; SOLID; no magic strings; TDD.
- Backend tests run inside Docker (`docker-compose exec -T backend python -m pytest ...`) — host Postgres on 5432 lacks the `postgres` role.
- Frontend: do NOT run repo-wide `npm run lint`; `npm run build` is the type-check gate.

---

## File Structure

**Backend**
- Modify: `backend/stocks/models/portfolio.py` — `is_default` on `PortfolioAccount`.
- Create: `backend/stocks/migrations/0042_portfolioaccount_is_default.py`.
- Modify: `backend/stocks/serializers/portfolio.py` — `PortfolioAccountSerializer` exposes `is_default` (read-only).
- Modify: `backend/stocks/views/portfolio_views/portfolio_account_viewset.py` — `set_default` action.
- Create: `backend/stocks/tests/test_default_account.py`.

**Frontend**
- Modify: `frontend/src/components/TransactionModal.tsx` — add `is_default?: boolean` to the exported `PortfolioAccount` type.
- Modify: `frontend/src/components/AccountSettingsDialog.tsx` — "Set as default account" control.
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx` — derive `defaultAccountId`, initial pre-selection, buy/sell pre-fill fallback, default badge.
- Test: `frontend/src/__tests__/unit/AccountSettingsDefault.test.tsx`, `frontend/src/__tests__/unit/defaultAccountSelect.test.ts`.

---

## Task 1: Backend — `is_default` field + migration

**Files:**
- Modify: `backend/stocks/models/portfolio.py` (`PortfolioAccount`, ~lines 9-23)
- Create: `backend/stocks/migrations/0042_portfolioaccount_is_default.py`
- Test: `backend/stocks/tests/test_default_account.py`

**Interfaces:**
- Produces: `PortfolioAccount.is_default: bool` (default `False`).

- [ ] **Step 1: Write the failing test**

Create `backend/stocks/tests/test_default_account.py`:

```python
import pytest
from django.contrib.auth.models import User
from stocks.models.portfolio import PortfolioAccount


@pytest.mark.django_db
class TestAccountIsDefaultField:
    def test_new_account_is_not_default(self):
        user = User.objects.create_user(username='acctuser', password='pw')
        acct = PortfolioAccount.objects.create(user=user, name='Main')
        assert acct.is_default is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend python -m pytest stocks/tests/test_default_account.py -q`
Expected: FAIL — `AttributeError`/field does not exist.

- [ ] **Step 3: Add the field**

In `backend/stocks/models/portfolio.py`, inside `class PortfolioAccount(models.Model):` add (after `default_risk_percentage`):

```python
    is_default = models.BooleanField(default=False)
```

- [ ] **Step 4: Generate the migration**

Run: `docker-compose exec -T backend python manage.py makemigrations stocks`
Expected: creates `stocks/migrations/0042_portfolioaccount_is_default.py` adding `is_default` default `False`. Use whatever number Django assigns.

- [ ] **Step 5: Run test to verify it passes**

Run: `docker-compose exec -T backend python -m pytest stocks/tests/test_default_account.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/models/portfolio.py backend/stocks/migrations/0042_portfolioaccount_is_default.py backend/stocks/tests/test_default_account.py
git commit -m "feat(portfolio): add is_default field to PortfolioAccount"
```

---

## Task 2: Backend — serializer field + `set_default` action

**Files:**
- Modify: `backend/stocks/serializers/portfolio.py` (`PortfolioAccountSerializer`, ~lines 11-15)
- Modify: `backend/stocks/views/portfolio_views/portfolio_account_viewset.py`
- Test: `backend/stocks/tests/test_default_account.py` (extend)

**Interfaces:**
- Consumes: `PortfolioAccount.is_default` (Task 1).
- Produces: endpoint `POST /api/stocks/accounts/{id}/set_default/` (DRF url name `portfolio-accounts-set-default`) → returns the updated account; `is_default` present in `PortfolioAccountSerializer` output.

- [ ] **Step 1: Write the failing tests**

Append to `backend/stocks/tests/test_default_account.py`:

```python
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestSetDefaultAction:
    def _setup(self):
        user = User.objects.create_user(username='setdef', password='pw')
        client = APIClient()
        client.force_authenticate(user=user)
        a = PortfolioAccount.objects.create(user=user, name='A')
        b = PortfolioAccount.objects.create(user=user, name='B')
        return client, a, b

    def test_set_default_marks_one_and_clears_others(self):
        client, a, b = self._setup()
        res = client.post(reverse('portfolio-accounts-set-default', args=[a.id]))
        assert res.status_code == status.HTTP_200_OK
        assert res.data['is_default'] is True
        a.refresh_from_db(); b.refresh_from_db()
        assert a.is_default is True and b.is_default is False

        client.post(reverse('portfolio-accounts-set-default', args=[b.id]))
        a.refresh_from_db(); b.refresh_from_db()
        assert b.is_default is True and a.is_default is False

    def test_set_default_does_not_touch_other_users_accounts(self):
        client, a, _ = self._setup()
        other = User.objects.create_user(username='other', password='pw')
        other_default = PortfolioAccount.objects.create(user=other, name='O', is_default=True)
        client.post(reverse('portfolio-accounts-set-default', args=[a.id]))
        other_default.refresh_from_db()
        assert other_default.is_default is True

    def test_serializer_exposes_is_default(self):
        client, a, _ = self._setup()
        res = client.get(reverse('portfolio-accounts-list'))
        assert res.status_code == status.HTTP_200_OK
        assert 'is_default' in res.data[0]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker-compose exec -T backend python -m pytest stocks/tests/test_default_account.py::TestSetDefaultAction -q`
Expected: FAIL — `NoReverseMatch` for `portfolio-accounts-set-default` (and the serializer test KeyErrors).

- [ ] **Step 3: Add `is_default` to the serializer**

In `backend/stocks/serializers/portfolio.py`, `PortfolioAccountSerializer.Meta`: add `'is_default'` to `fields` and to `read_only_fields`:

```python
        fields = ['id', 'name', 'account_type', 'balance', 'default_risk_percentage', 'is_default', 'created_at']
        read_only_fields = ['id', 'created_at', 'is_default']
```

- [ ] **Step 4: Add the action**

In `backend/stocks/views/portfolio_views/portfolio_account_viewset.py`, add the import at the top:

```python
from django.db import transaction
```

and add this method to `PortfolioAccountViewSet` (next to the existing `reset` action):

```python
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        account = self.get_object()
        with transaction.atomic():
            PortfolioAccount.objects.filter(user=account.user).update(is_default=False)
            account.is_default = True
            account.save(update_fields=['is_default'])
        return Response(PortfolioAccountSerializer(account).data)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker-compose exec -T backend python -m pytest stocks/tests/test_default_account.py -q`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/serializers/portfolio.py backend/stocks/views/portfolio_views/portfolio_account_viewset.py backend/stocks/tests/test_default_account.py
git commit -m "feat(portfolio): expose is_default and add set_default account action"
```

---

## Task 3: Frontend — type + "Set as default" control in settings dialog

**Files:**
- Modify: `frontend/src/components/TransactionModal.tsx` (`PortfolioAccount` interface)
- Modify: `frontend/src/components/AccountSettingsDialog.tsx`
- Test: `frontend/src/__tests__/unit/AccountSettingsDefault.test.tsx`

**Interfaces:**
- Consumes: `set_default` endpoint (Task 2).
- Produces: `AccountSettingsDialog` renders a "Set as default account" button for a non-default account (POSTs `set_default`, then calls `onUpdate`) and a "Default account" indicator for the default one. `PortfolioAccount` type gains `is_default?: boolean`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/AccountSettingsDefault.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import api from '@/lib/api';
import { AccountSettingsDialog } from '@/components/AccountSettingsDialog';

vi.mock('@/lib/api', () => ({ default: { patch: vi.fn(), post: vi.fn().mockResolvedValue({ data: {} }), delete: vi.fn() } }));

const baseAccount = { id: 7, name: 'Main', account_type: 'LIVE', balance: 1000, default_risk_percentage: 2, is_default: false } as never;

describe('AccountSettingsDialog default control', () => {
    afterEach(() => vi.clearAllMocks());

    it('sets the account as default and refreshes', async () => {
        const onUpdate = vi.fn();
        render(<AccountSettingsDialog isOpen onOpenChange={vi.fn()} account={baseAccount} onUpdate={onUpdate} onDelete={vi.fn()} portfolioValue={0} />);
        fireEvent.click(screen.getByRole('button', { name: /set as default/i }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/stocks/accounts/7/set_default/'));
        await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    });

    it('shows a default indicator when the account is already default', () => {
        render(<AccountSettingsDialog isOpen onOpenChange={vi.fn()} account={{ ...baseAccount, is_default: true }} onUpdate={vi.fn()} onDelete={vi.fn()} portfolioValue={0} />);
        expect(screen.getByText(/default account/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/AccountSettingsDefault.test.tsx`
Expected: FAIL — no "set as default" button.

- [ ] **Step 3: Add `is_default` to the `PortfolioAccount` type**

In `frontend/src/components/TransactionModal.tsx`, add to the exported `PortfolioAccount` interface:

```tsx
    is_default?: boolean;
```

- [ ] **Step 4: Add the control to `AccountSettingsDialog`**

In `frontend/src/components/AccountSettingsDialog.tsx`, add a handler and render a control (place it in the dialog body, e.g. near the risk-percentage field). Use the existing `onUpdate` to refresh:

```tsx
    const [settingDefault, setSettingDefault] = useState(false);

    const handleSetDefault = async () => {
        if (!account) return;
        setSettingDefault(true);
        try {
            await api.post(`/api/stocks/accounts/${account.id}/set_default/`);
            onUpdate();
        } catch (err) {
            console.error('Failed to set default account', err);
        } finally {
            setSettingDefault(false);
        }
    };
```

Render (sentence-case, no all-caps):

```tsx
    {account?.is_default ? (
        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Default account</div>
    ) : (
        <button
            type="button"
            onClick={handleSetDefault}
            disabled={settingDefault}
            className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
        >
            Set as default account
        </button>
    )}
```

(`useState` is already imported; `api` is already imported in this file.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/AccountSettingsDefault.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TransactionModal.tsx frontend/src/components/AccountSettingsDialog.tsx frontend/src/__tests__/unit/AccountSettingsDefault.test.tsx
git commit -m "feat(portfolio): set-as-default control in account settings dialog"
```

---

## Task 4: Frontend — default selection, badge, and buy/sell pre-fill

**Files:**
- Create: `frontend/src/lib/defaultAccount.ts`
- Modify: `frontend/src/app/(authenticated)/portfolio/page.tsx`
- Test: `frontend/src/__tests__/unit/defaultAccountSelect.test.ts`

**Interfaces:**
- Consumes: `PortfolioAccount` (with `is_default`) from Task 3.
- Produces: `defaultAccountId(accounts): string | null` — id (as string) of the account whose `is_default` is true, else null.

- [ ] **Step 1: Write the failing helper test**

Create `frontend/src/__tests__/unit/defaultAccountSelect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultAccountId } from '@/lib/defaultAccount';

describe('defaultAccountId', () => {
    it('returns the id (as string) of the default account', () => {
        expect(defaultAccountId([{ id: 1, is_default: false }, { id: 5, is_default: true }] as never)).toBe('5');
    });
    it('returns null when no account is default', () => {
        expect(defaultAccountId([{ id: 1, is_default: false }] as never)).toBeNull();
        expect(defaultAccountId([] as never)).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/defaultAccountSelect.test.ts`
Expected: FAIL — cannot resolve `@/lib/defaultAccount`.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/lib/defaultAccount.ts`:

```ts
import type { PortfolioAccount } from '@/components/TransactionModal';

export function defaultAccountId(accounts: PortfolioAccount[]): string | null {
    const found = accounts.find(a => a.is_default);
    return found ? found.id.toString() : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/defaultAccountSelect.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into the portfolio page**

In `frontend/src/app/(authenticated)/portfolio/page.tsx`:

a) Import the helper (near other `@/lib` imports):

```tsx
import { defaultAccountId } from '@/lib/defaultAccount';
```

b) Add a derived value and an init guard. After the `accounts` state (`~line 94`) add:

```tsx
    const didInitAccount = useRef(false);
```

(ensure `useRef` is in the React import). After `fetchAccounts` is defined / where `accounts` is available, add an effect:

```tsx
    useEffect(() => {
        if (didInitAccount.current || accounts.length === 0) return;
        didInitAccount.current = true;
        const def = defaultAccountId(accounts);
        if (def) setSelectedAccount(def);
    }, [accounts]);
```

c) Compute `const defAcctId = defaultAccountId(accounts);` in the render body (before the JSX that opens buy/sell), and change the buy/sell pre-fill sites from
`setDefaultModalAccount(selectedAccount !== 'all' ? selectedAccount : '')`
to:
`setDefaultModalAccount(selectedAccount !== 'all' ? selectedAccount : (defAcctId ?? ''))`
(apply at every such site — currently `~line 197` and any other `setDefaultModalAccount(selectedAccount !== 'all' ? selectedAccount : '')`).

d) Default badge in the account dropdown options: where accounts are mapped to `<option>` (account `<select>` ~line 408-420), append a marker to the default account's label, e.g.:

```tsx
{acc.name}{acc.is_default ? ' · Default' : ''}
```

e) Default badge in the grouped-view account header (where `acc.name` is shown for each account group, ~line 540-570): render a small badge when `acc.is_default`:

```tsx
{acc.is_default && <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Default</span>}
```

- [ ] **Step 6: Build to type-check**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`; `/portfolio` present; no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/defaultAccount.ts frontend/src/__tests__/unit/defaultAccountSelect.test.ts "frontend/src/app/(authenticated)/portfolio/page.tsx"
git commit -m "feat(portfolio): pre-select default account on load, pre-fill buy/sell, show default badge"
```

---

## Task 5: Regression + deploy

**Files:** none (verification only)

- [ ] **Step 1: Backend tests (Docker)**

Run: `docker-compose exec -T backend python -m pytest stocks/tests/test_default_account.py -q`
Expected: all PASS.

- [ ] **Step 2: Frontend tests**

Run: `cd frontend && npx vitest run src/__tests__/unit/AccountSettingsDefault.test.tsx src/__tests__/unit/defaultAccountSelect.test.ts`
Expected: all PASS.

- [ ] **Step 3: Production build**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 4: Deploy**

Run: `docker-compose exec -T backend python manage.py migrate`
Run: `docker-compose up -d --build frontend`
Verify: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000` → `200`.
(Hard-refresh; open account settings for an account → "Set as default account"; reload portfolio → that account is pre-selected; open buy/sell from "All accounts" → account pre-filled with the default.)

---

## Self-Review

**Spec coverage:**
- `is_default` field + migration → Task 1. ✓
- Serializer read-only field + `set_default` action (atomic, user-scoped) → Task 2. ✓
- "Set as default" control in settings dialog → Task 3. ✓
- Initial pre-selection (did-init guard) → Task 4 (b). ✓
- Buy/sell pre-fill fallback to default → Task 4 (c). ✓
- Default badge (dropdown + grouped header) → Task 4 (d,e). ✓
- Deploy = migrate + frontend rebuild → Task 5. ✓

**Placeholder scan:** backend tasks carry full code + tests; frontend tasks carry the helper code, the dialog handler/markup, and concrete page-edit anchors with the exact before/after expressions and complete test code.

**Type consistency:** `is_default` is the field name across model, serializer, TS type, helper, and badges; `set_default` url path/name identical in Task 2 (definition) and Task 3 (consumer); `defaultAccountId(accounts): string | null` (Task 4) matches its uses in the init effect and pre-fill fallback.
