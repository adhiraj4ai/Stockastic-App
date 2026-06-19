# Portfolio holding classification: investment vs trading

**Date:** 2026-06-19
**Status:** Approved design, pending implementation

## Goal

Let users mark each portfolio holding as either an **investment** (long-term) or
a **trade** (short-term). The classification is shown in the UI with a symbol and
is used to break out portfolio totals into the two groups.

## Decisions (from brainstorming)

- **Granularity:** one classification per holding. Each `PortfolioItem` row
  (one ticker per account) is wholly investment or trading. No share-level split.
- **Stored values:** the database stores the literal lowercase keywords
  `investment` and `trading`. The symbol is a UI-only presentation detail.
- **Default:** `trading`. Existing holdings backfill to `trading`; new holdings
  default to `trading`.
- **UI scope:** symbol + inline edit (baseline) **and** separate totals split by
  classification. No filtering or section grouping in this iteration.
- **Symbols (lucide):** investment → `Landmark`, trading → `Repeat`.
- **Totals placement:** inline, near the existing KPI cards at the top of the
  portfolio page.

## Data model

Add to `backend/stocks/models/portfolio.py`, on `PortfolioItem`:

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

`Classification` is defined at module level (alongside `AccountType`,
`TransactionType`) so it can be imported by the viewset for validation.

### Migration

A single Django migration adds the field with `default='trading'`. Because the
default is set at the schema level, existing rows are backfilled to `trading`
automatically — no data migration needed.

## API

- Add `'classification'` to `PortfolioItemSerializer.Meta.fields`
  (`backend/stocks/serializers/portfolio.py`). It is a normal writable field.
- New detail action on `PortfolioViewSet`
  (`backend/stocks/views/portfolio_views/portfolio_viewset.py`), mirroring the
  existing `update_tags` action:

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

Endpoint: `PATCH /api/stocks/portfolio/{id}/update_classification/`
Body: `{ "classification": "investment" | "trading" }`

## Frontend

### Inline classification toggle

A small component (e.g. `ClassificationToggle.tsx`) modeled on `TagPopover`:

- Receives `itemId` and `classification`.
- Renders the symbol for the current value — `Landmark` for `investment`,
  `Repeat` for `trading` — with a tooltip naming the classification.
- On click, toggles to the other value, optimistically updates local state, and
  PATCHes `/api/stocks/portfolio/{id}/update_classification/`.
- On request failure, reverts the optimistic change.
- Placed in each holdings row next to the ticker (near the existing tag UI).

Sentence-case labels, warm sans, no all-caps — consistent with app conventions.

### Split totals

The page already derives totals by reducing the items list
(`page.tsx` ~line 318). Add a parallel breakdown:

- Partition the displayed items by `item.classification`.
- For each group compute invested value, current value, and gain/loss using the
  same per-item fields already used for the aggregate totals.
- Render a compact two-group breakdown inline beside the existing KPI cards.
  Money is formatted via `lib/numbers` (`formatRupees`), never ad hoc.

The `PortfolioItem` TypeScript type gains a `classification: 'investment' |
'trading'` field.

## Testing (TDD — red first)

**Backend** (`stocks/tests/`):

- New `PortfolioItem` defaults to `classification == 'trading'`.
- `update_classification` sets the value for valid keywords and returns it.
- `update_classification` returns 400 for an invalid value and leaves the item
  unchanged.
- (Optional) migration leaves a pre-existing holding at `trading`.

**Frontend** (co-located `*.test.tsx`):

- Toggle renders the `Landmark` symbol for `investment` and `Repeat` for
  `trading`.
- Clicking the toggle fires a PATCH to `update_classification` with the flipped
  value.
- Split-total helper partitions items and sums each group correctly.

## Out of scope

- Filtering or visually sectioning holdings by classification.
- Share-level / lot-level classification of a single ticker.
- Surfacing classification in chat subagents, exports, or snapshots.

## Deploy notes

- Backend: run migration (`migrate`). No seed or beat changes.
- Frontend: Docker image rebuild + hard refresh (localhost:3000 is Docker-built).
