# Default portfolio account

**Date:** 2026-06-20
**Status:** Approved design, pending implementation

## Context

A user has multiple `PortfolioAccount` rows (`backend/stocks/models/portfolio.py`).
The portfolio page (`frontend/src/app/(authenticated)/portfolio/page.tsx`) has an
account dropdown whose state `selectedAccount` always starts on `'all'`. There is
an existing per-account **Account settings dialog**
(`frontend/src/components/AccountSettingsDialog.tsx`) opened from the settings
button (disabled while `selectedAccount === 'all'`). There is no concept of a
"default" account today.

## Goal

Let a user mark one account as their **default** so that:
1. The portfolio page pre-selects it on load (instead of "All accounts").
2. Buy/sell/transaction modals pre-fill their account field with it.

## Decisions (from brainstorming)

- **Storage:** server-side — an `is_default` boolean on `PortfolioAccount`, with
  exactly one default per user enforced.
- **Drives both:** initial portfolio-page selection AND buy/sell form pre-fill.
- **Set from:** the existing Account settings dialog (per selected account), plus a
  visible "Default" badge in the account dropdown / grouped view.

## Data model

Add to `PortfolioAccount`:

```python
is_default = models.BooleanField(default=False)
```

Migration adds the column defaulting to `False`. The single-default-per-user
invariant is enforced by the `set_default` action (below), not a DB constraint —
keeping the model simple and the "switch default" operation atomic.

## API

- `PortfolioAccountSerializer` (`backend/stocks/serializers/portfolio.py`): add
  `'is_default'` to `fields`, as **read-only** (changed only via the action).
- New detail action on `PortfolioAccountViewSet`
  (`backend/stocks/views/portfolio_views/portfolio_*` — the accounts viewset,
  router basename `portfolio-accounts`):

```python
@action(detail=True, methods=['post'])
def set_default(self, request, pk=None):
    account = self.get_object()
    with transaction.atomic():
        PortfolioAccount.objects.filter(user=request.user).update(is_default=False)
        account.is_default = True
        account.save(update_fields=['is_default'])
    return Response(PortfolioAccountSerializer(account).data)
```

Endpoint: `POST /api/stocks/accounts/{id}/set_default/` → returns the updated
account. The viewset's `get_object`/`get_queryset` already scope to the
authenticated user, so a non-owner gets 404 and the `filter(user=...)` only
touches the caller's accounts.

## Frontend

### Setting the default

In `AccountSettingsDialog`:
- When the dialog's `account.is_default` is false, show a **"Set as default
  account"** button. On click → `POST /api/stocks/accounts/{id}/set_default/`,
  then trigger the page's accounts refresh (via the dialog's existing saved/closed
  callback) and close or update in place.
- When `account.is_default` is true, show a non-interactive **"Default account"**
  indicator instead of the button.

### Showing the default

- A small **"Default"** badge next to the default account name in the account
  dropdown options and in the grouped-view account header.

### Pre-selection on load

- Derive `defaultAccountId` from the fetched `accounts`
  (`accounts.find(a => a.is_default)?.id.toString()`).
- On initial load only, when accounts arrive and the user has not yet changed the
  selection, set `selectedAccount` to `defaultAccountId` if present, else leave
  `'all'`. Implement with a "did initialise" guard so later refreshes or manual
  switches are never overridden.

### Pre-fill in buy/sell/transaction modals

- The modals already accept a `defaultAccount` prop fed by `defaultModalAccount`.
  When opening a buy/sell with no specific account in context (current code uses
  `selectedAccount !== 'all' ? selectedAccount : ''`), fall back to
  `defaultAccountId`: `selectedAccount !== 'all' ? selectedAccount : (defaultAccountId ?? '')`.

### TypeScript

- The `PortfolioAccount` type (`frontend/src/components/TransactionModal.tsx`,
  re-exported) gains `is_default?: boolean`.

## Error & empty states

- No default set → page starts on `'all'` (today's behaviour); modals pre-fill
  blank (today's behaviour).
- `set_default` failure → surface a console error and leave the prior default
  unchanged (no optimistic flip persisted); the dialog stays open.
- Exactly one default after any `set_default` call (others cleared in the same
  transaction).

## Testing (TDD)

**Backend** (`stocks/tests/`):
- New account defaults `is_default == False`.
- `set_default` sets the target's `is_default=True` and clears it on the user's
  other accounts (create two accounts, set default on each in turn, assert only one
  is default).
- `set_default` is user-scoped: it does not touch another user's accounts.
- Serializer output includes `is_default`.

**Frontend** (co-located `*.test.tsx`):
- Page initialises `selectedAccount` to the account whose `is_default` is true (and
  stays on `'all'` when none is default).
- `AccountSettingsDialog` renders "Set as default account" for a non-default account
  and fires the `set_default` POST on click; renders the "Default account"
  indicator for the default one.
- The default badge renders for the default account.

## Out of scope

- Auto-selecting the default in pages other than the portfolio page.
- Changing `default_risk_percentage` or other account-settings behaviour.
- Any multi-user/team sharing of accounts.

## Deploy

Backend migration (`migrate`) + frontend image rebuild. No seed changes.
