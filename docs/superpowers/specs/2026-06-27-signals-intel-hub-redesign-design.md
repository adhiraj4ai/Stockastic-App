# Signals / Intel Hub Redesign — Design

**Date:** 2026-06-27
**Status:** Approved (brainstorm) — pending spec review
**Branch:** `feat/signals-redesign` (off `main`)

## Problem

The `/signals` page is fragmented and dated. Two competing UIs ship at the same
route — a legacy `SignalsPageClient` ("Market Signals") and a newer
`IntelHubClient` (Command Center / Smart Money / Whale Watch / Strategies tabs) —
with all-caps headers, monospace prices, and inconsistent type. Signals come from
**ten heterogeneous engines** plus a separate **user-strategy** family, but the UI
doesn't make the strategy families legible or surface when multiple independent
strategies agree. We want one coherent page that compiles all strategies together,
teaches the user what each signal means, and shows exactly why each fired.

## Premise correction (drives the design)

The signals are **not** all accumulation-based. Of the 10 registered engines:
- **Pure accumulation (5):** smart-money, distribution-alert, below-cost-reversal,
  concentration-shift, accumulation-momentum.
- **Hybrid (3):** broker-accumulation, smart-crossover, ichimoku (accumulation + technicals).
- **Pure technical/volume (2):** volume-breakout, institutional-alerts (price-action,
  mean-reversal, RSI/MACD divergence, Dow).

Plus a separate family: **`USER_STRATEGY`** backtested signals from the strategy
framework (no TP/SL; close-on-flip). "Compile all strategies together" therefore
means *unifying heterogeneous sources* — and the strongest version of that is
**multi-lens confirmation**: highlighting when independent families agree.

## Goals

- Replace **both** current UIs with one unified `/signals` page.
- Organize all strategies into **three family lanes**: Accumulation · Technical · Your strategies.
- Surface **cross-family consensus** (a symbol firing in ≥2 lanes) as the page's signature.
- On click, a **"why this fired"** drawer listing the actual triggering conditions per engine.
- On hover, an **inline glossary** explaining every engine, tier, and term.
- Let the user **act** (watchlist, paper trade) and see **track record**.
- Keep the app's identity (warm sans, sentence-case, no all-caps/monospace, dark mode,
  `lib/numbers`, shadcn), adding exactly one new accent for the conviction signature.

## Non-Goals

- Changing how signals are *generated* (the 10 engines + user strategies stay as-is).
- New signal engines or new accumulation logic.
- Real-money trading (paper trade reuses the existing transactions flow).
- Reworking the strategy framework / backtester.

## Architecture

```
                ┌────────────────────────────────────────────┐
                │ Backend (thin additions over existing data) │
                │                                              │
  SignalEpisode │  source→family map  (accumulation/technical/ │
  (existing)  → │                      your_strategies)        │
                │  GET /signals/board/  → latest active        │
                │     episodes tagged with `family` +          │
                │     cross-family consensus precomputed       │
                │  GET /signal-glossary/ → source/tier/term →  │
                │     {label, description}                     │
                │  conditions formatter: metadata → labeled    │
                │     plain-language trigger lines             │
                └───────────────────┬──────────────────────────┘
                                    ▼
                ┌────────────────────────────────────────────┐
                │ Frontend /signals (one page, replaces both)  │
                │  market-posture strip · global filter bar    │
                │  ┌Accumulation┐ ┌Technical┐ ┌Your strategies┐│
                │  │ ranked     │ │ ranked  │ │ ranked        ││
                │  │ cards +    │ │ cards   │ │ cards         ││
                │  │ consensus  │ │         │ │               ││
                │  └────────────┘ └─────────┘ └───────────────┘│
                │  detail drawer ("why this fired") · actions  │
                └────────────────────────────────────────────┘
```

### Lane taxonomy (source → family map)

| Lane | Engines (source keys) |
|------|------------------------|
| **Accumulation** | SMART_MONEY, DISTRIBUTION_ALERT, BELOW_COST_REVERSAL, CONCENTRATION_SHIFT, ACC_MOMENTUM, BROKER_ACCUMULATION (hybrid → here) |
| **Technical** | VOLUME_BREAKOUT, INSTITUTIONAL_ALERTS, ICHIMOKU (hybrid), SMART_CROSSOVER (hybrid) |
| **Your strategies** | USER_STRATEGY (FK to Strategy) |

The map is the single backbone shared by the board endpoint and the lanes. Any
unmapped/new source falls back to the Technical lane with a logged warning (so a
new engine never silently disappears).

### Consensus

A symbol is "confirmed by N families" when it has active signals **in the same
direction** across N distinct lanes. The board endpoint precomputes, per symbol,
the set of families and a consensus count. Cards in different lanes for a consensus
symbol render a connecting indigo marker + a "confirmed by N families" chip.

## Components

### Backend

1. **`signal_families.py`** — `SOURCE_FAMILY: dict[str,str]`, `family_for(source) -> str`,
   `FAMILIES` ordering. One responsibility: classify a source.
2. **`signal_glossary.py`** — `GLOSSARY` mapping for sources, tiers, and shared terms →
   `{label, description}`; `describe(kind, key) -> {label, description} | None`.
   Authored beside the engines; the single source of glossary truth.
3. **`signal_conditions.py`** — `format_conditions(source, metadata) -> list[str]`:
   per-source mapping of known `metadata` keys → labeled plain-language lines
   (e.g. SMART_MONEY: cluster_count → "N smart-money brokers clustered near WAC").
   Falls back to a generic key→"label: value" rendering for unknown keys.
4. **Board endpoint** — `GET /api/stocks/signals/board/` (action on the existing
   signals viewset). Returns latest active episodes, each serialized with `family`,
   `conditions` (from the formatter), glossary-ready `source`/`tier`, and a top-level
   `consensus: {symbol: {families: [...], count: N}}`. Honors filters: direction,
   symbol, sector, min_families, include_historical.
5. **Glossary endpoint** — `GET /api/stocks/signal-glossary/` returns the full map.

### Frontend (`frontend/src/app/(authenticated)/signals/`)

Replaces `SignalsPageClient.tsx` and `IntelHubClient.tsx` with a focused set:
- `SignalsBoard.tsx` — page shell: posture strip + filter bar + three `SignalLane`s.
- `SignalLane.tsx` — one family column: header (name, count, buy⇄sell skew), ranked cards.
- `SignalCard.tsx` — card anatomy (below); consensus chip; quick action.
- `ConvictionMeter.tsx` — the strength bar (neutral `--foreground` fill, theme-bound).
- `SignalDetailDrawer.tsx` — "why this fired": per-engine condition blocks + existing `AnalysisTabs`.
- `GlossaryTooltip.tsx` — hover wrapper that looks up `{label, description}` from the glossary.
- `lib/signals.ts` — types + the `accumulationApi`-style client (`board`, `glossary`).
- Track record: keep `/signals/track-record`, restyle to match.

### Card anatomy

```
┌──────────────────────────────────────────┐
│ NABIL               buy           ▸ detail │  symbol · direction badge
│ smart money · below cost                   │  engine(s) in this lane (hover = glossary)
│ ▰▰▰▰▰▰▰▰▱▱  88   platinum                  │  ConvictionMeter + tier (hover = glossary)
│ entry 520 · stop 500 · target 560          │  levels (tabular figures)
│ ◆ confirmed by 2 families        2d ago    │  consensus chip · freshness
└──────────────────────────────────────────┘
```
`USER_STRATEGY` cards omit stop/target and show the strategy name in place of engines.

### Detail drawer ("why this fired")

For the clicked symbol+direction, aggregate **every** active episode (all lanes) and
render, per engine: the tier + strength, the engine's `rationale`, and the
`conditions` list (formatted from metadata). The existing `AnalysisTabs`
(technical/fundamental) renders below as supplementary. Actions: add to watchlist,
place paper trade (existing transactions flow, propose-and-confirm).

### Glossary tooltips

`GlossaryTooltip` wraps any engine name, tier badge, family header, or shared term
and shows `{label, description}` on hover/focus (keyboard-accessible). Content comes
from the backend glossary so it stays authored with the engines.

## Visual system — current app theme, zero deviation

**Hard constraint (user):** the page must match the existing app theme and layout
with no new palette, no bespoke ground, and no new layout shell. Everything binds to
the app's existing tokens; rendered inside the standard `DashboardLayout` (sidebar,
full-width), light **and** the app's warm-dark mode via the existing theme.

- **Tokens only:** surfaces `--background` / `--card`, text `--foreground` /
  `--muted-foreground`, edges `--border`, focus `--ring`. The app's neutrals are warm
  (hue ~85); the primary accent is **green** (`oklch(0.596 0.145 163)`).
- **Type:** inherit the app's warm sans + sentence-case (no all-caps, no monospace).
  Personality comes from the type *scale* (heavier large lane headers, bold symbols,
  small meta) and **tabular figures** (`tabular-nums`) on every metric.
- **Direction stays semantic:** emerald = buy, rose = sell, amber = watch (existing).
- **No new accent.** The `ConvictionMeter` fills with a **neutral `--foreground`** tone
  (reads as magnitude, never as direction) over a `--muted` track — deliberately NOT
  the app's green `--primary`, because that green *is* the buy color and would collide.
- **Consensus chip is direction-agnostic and neutral** (a `--border` outline + a small
  `--ring` dot), since families can agree on a sell as readily as a buy. The signature
  is therefore the **consensus structure** (the cross-lane connector + the stacked
  "why it fired" drawer), not a color.
- **Lane identity:** a thin top tick per lane in muted/neutral tints derived from the
  theme (not new hues); header only, everything else quiet.
- **Reuse existing components:** `Card`, `Badge`, `Tabs`, `Dialog`/drawer, `Tooltip`,
  `StockLoader`, `lib/numbers` — so it is indistinguishable in chrome from the rest of
  the app.
- Desktop: three columns; mobile: stacked sections. Quality floor: visible keyboard
  focus (`--ring`), reduced-motion respected, responsive to mobile.

> The published mockup used a dark-slate ground + indigo accent to make the *structure*
> legible in isolation; that styling is explicitly **not** carried into the build — only
> the layout, card anatomy, consensus thread, drawer, and glossary behavior are.

## Page chrome

- **Market-posture strip:** net skew across all families ("18 bullish · 5 bearish"),
  as-of date, primary "Generate signals" action with last-run time.
- **Global filter bar:** direction (all/buy/sell), symbol search, sector,
  min families (≥1/2/3), show-historical toggle — filters all lanes together.
- **Empty states** in the interface's voice, per lane: "No accumulation signals today —
  last scan Jun 17." **Loading:** `StockLoader`.

## Error handling

- Board/glossary fetch failure → inline error with a retry action, not a blank page.
- Unknown source → Technical lane + logged warning (never dropped).
- Missing metadata keys → conditions formatter falls back to generic rendering; never throws.
- `USER_STRATEGY` with null stop/target → card renders without those rows (no "—" noise beyond the qty case).

## Testing

**Backend:**
- `family_for` maps every known source; unknown → technical (+ warning).
- Glossary covers every source key and every tier emitted by the engines (a test
  enumerates engine tiers and asserts a glossary entry exists).
- `format_conditions` per source: known metadata → expected labeled lines; unknown keys → generic fallback, no throw.
- Board endpoint: family tagging, consensus grouping (≥2 same-direction families), filter honoring (direction/sector/min_families/historical), auth.

**Frontend:**
- Lane renders ranked cards; buy⇄sell skew correct.
- Consensus chip + indigo marker appear only at ≥2 families, same direction.
- `GlossaryTooltip` shows the description for an engine/tier on hover and focus.
- Detail drawer lists each contributing engine's conditions for a multi-source symbol.
- Empty state per lane; error state with retry.
- Quick action posts the paper trade with the correct payload.

## Cleanup

Delete `SignalsPageClient.tsx` and `IntelHubClient.tsx` (and dead helpers they own)
once the new board is wired. Keep `track-record` (restyled). Reuse `AnalysisTabs`,
shadcn primitives, `StockLoader`, `lib/numbers`.

## Future work

- Per-user signal preferences (mute a family/engine).
- Alerting when a symbol reaches N-family consensus.
- Backtested precision per engine surfaced in the glossary tooltip.
