# Unified Strategy Workspace + legacy auto-convert

## Context

Strategy capabilities are now powerful but scattered across separate routes (/editor,
/builder, /backtest, /optimize, /compare, detail) and legacy raw-code strategies sit
awkwardly beside the new spec-driven builder. Goal: one cohesive workspace per strategy,
a clear Composed-vs-Custom identity, and (decided) proactively convert the strategies
that map cleanly to compositions so they're builder-editable. Chat tools come in a later
phase (decided: read + run + draft-with-confirm); this doc is the Workspace + convert.

## Goal

A single Strategy Workspace that folds authoring (Build ⇄ Code), Backtest, Optimize, and
Overview/Track-record into one tabbed shell with a persistent header (name, kind badge,
plain-English summary, published state) and shared run-context. Plus a one-time
auto-convert that sets `spec` on the strategies whose composition we already validated,
so they open as first-class Composed strategies.

## Approach

Low-risk shell over the existing pages (don't rewrite working features):

### Workspace shell (frontend)
- New `app/(authenticated)/strategies/[id]/layout.tsx`: renders a **persistent header**
  (strategy name, `Composed`/`Custom` badge, plain-English summary, published pill) and a
  **tab bar** — Overview · Build · Code · Backtest · Optimize — that routes to the existing
  sub-routes (`/`, `/builder`, `/editor`, `/backtest`, `/optimize`). The sub-pages render
  inside the shell, so navigation feels like one workspace, not six pages. Compare stays the
  cross-strategy page, linked from the header.
- **Default tab by kind:** Composed → Build; Custom → Code (Build tab offered as "Convert to
  builder"). Derived from the serializer `kind`.
- **Shared run-context:** symbol + period persisted (localStorage key per session) so picking
  them in Backtest carries into Optimize/quick-runs instead of re-entering everywhere.
- The header summary + tabs use only data already on the strategy payload (new `kind`,
  `summary` fields) — no extra fetches.

### Backend
- `strategy_framework/summary.py` `spec_to_sentence(spec)` → plain-English description
  (e.g. "Buys when Supertrend flips up while price is above the 200-period EMA; trails a
  3×ATR stop; exits on a trend break."). Built from the registry labels.
- Serializer adds read-only `kind` ("composed" if `spec` else "custom") and `summary`
  (spec_to_sentence for composed; a short fallback for custom).
- **Auto-convert** (`management/commands/convert_strategies_to_specs.py`): a name→spec map for
  the strategies we validated as compositions (the ~20 adopted ports + the builder-native
  ones). For each, set `strategy.spec` and re-render `strategy.code = spec_to_code(spec)`.
  Idempotent; only touches listed names; leaves the rest Custom. The spec map is the
  source of truth and is also added to seed_strategies.py so reseeding preserves it.

## Files
- **New:** `strategy_framework/summary.py`; `management/commands/convert_strategies_to_specs.py`;
  `frontend/.../strategies/[id]/layout.tsx`.
- **Modified:** `serializers/strategy.py` (+kind, +summary); the existing `[id]` sub-pages lose
  their own duplicated page headers where the shell now provides them (light touch);
  `seed_strategies.py` (carry the spec map).
- **Tests:** extend `test_strategy_spec.py` with `spec_to_sentence` + a convert round-trip
  (spec set → code re-rendered → still runs on the basket harness).

## Verification
1. `spec_to_sentence` returns a readable sentence for a representative spec (unit test).
2. Serializer returns `kind` and `summary` for a composed and a custom strategy.
3. `python manage.py convert_strategies_to_specs` sets specs on the mapped strategies;
   each converted strategy still runs via `backtest_basket --strategy "<name>"`; the basket
   pass count does not regress.
4. Frontend: the workspace shell renders the header + tabs; Composed opens on Build, Custom
   on Code; type-clean; route compiles after rebuild.

## Out of scope (this phase)
- Chat strategy tools (next phase) — though `spec_to_sentence` and the endpoints are the
  groundwork.
- The `CustomCode` composition node (Layer-2 prerequisite).
- Rewriting the individual feature pages — the shell wraps them as-is.
