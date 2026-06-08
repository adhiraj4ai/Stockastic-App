# Chat: Optimal Strategy Selection for a Symbol

**Date:** 2026-06-09
**Branch:** claude-agent-sdk
**Status:** Approved

---

## Problem

When a user asks the chat "what's the signal for NABIL?", the `buy-sell-strategist` subagent calls `get_signals_for_ticker` and receives signals from all strategies with equal weight. It has no way to know which strategy has historically performed best for that symbol — so it treats a 30% win-rate strategy the same as a 70% win-rate strategy.

The result: the verdict is driven by raw signal count rather than signal quality, and the user has no visibility into which strategy is most applicable to their symbol.

---

## Goal

The chat should intelligently surface the **single best strategy signal** for a given symbol — ranked by the strategy that has proven to perform best (by win rate, Sharpe ratio, and optimization scope) — and lead the verdict with it.

No new tools. No new computation. Pure data enrichment + prompt intelligence.

---

## Scope

- **In scope:** `chat/tools.py` (`get_signals_for_ticker`), `chat/prompts/strategist.yaml`
- **Out of scope:** New tools, new models, running new backtests or optimizations, frontend changes

---

## Design

### Part 1: Enrich `get_signals_for_ticker` (chat/tools.py)

`StrategySignal.objects.filter(symbol=ticker).select_related("strategy")` already loads the full Strategy object. We add strategy performance fields and optimization scope (from signal metadata) to each strategy signal entry in the response — zero extra DB queries.

**Current shape per strategy signal:**
```python
{"strategy": name, "signal": ..., "date": ..., "last_close": ...}
```

**New shape:**
```python
{
  "strategy": name,
  "strategy_id": id,
  "signal": ...,
  "date": ...,
  "last_close": ...,
  "pnl_pct": float,          # strategy's overall backtest return %
  "win_rate": float,          # % of winning trades
  "sharpe": float,            # Sharpe ratio
  "max_drawdown": float,      # max drawdown %
  "best_objective": str,      # "win_rate" | "profit" | "balanced" | ""
  "optimization_scope": str,  # "SYMBOL" | "SECTOR" | "ALL" | "DEFAULT" — from signal.metadata
}
```

The tool itself computes the best strategy using the same ranking order (scope → win_rate → sharpe) and prepends a one-liner anchor to the prose summary:
> `"best strategy: GoldenCrossADX (WR 62.0%, Sharpe 1.40, scope: SYMBOL) · NABIL: 2 buy / 1 sell signals · verdict BUY."`

This gives the model an immediate, unambiguous pointer before it parses the full signal list. The LLM does not re-rank from scratch; it trusts the tool's anchor and uses the enriched per-signal data only to apply the weighted tally and check `best_objective`.

### Part 2: Update `strategist.yaml` — Step 1 ranking workflow

The existing 6-step decision framework is preserved. Step 1 is extended with an explicit ranking sub-workflow **before** the BUY/SELL tally.

**Ranking order:**
1. `optimization_scope`: SYMBOL > SECTOR > ALL > DEFAULT
   *(A strategy tuned specifically for this symbol outranks a generic one)*
2. `win_rate` descending — strategies > 55% are high-reliability
3. `sharpe` descending — higher risk-adjusted return preferred

**Weighted tally rules (applied to confluence score):**
| Source | Condition | Weight |
|--------|-----------|--------|
| Strategy signal | win_rate > 55% | 2× |
| Strategy signal | win_rate 40–55% | 1× |
| Strategy signal | win_rate < 40% | 0.5× |
| Smart-money signal | any | 1.5× |

**`best_objective` interpretation:**
- `"win_rate"` → conservative, high-reliability entries; note this in verdict
- `"profit"` → aggressive; flag higher variance
- `"balanced"` or `""` → general-purpose, no special note needed

**Verdict format addition:**
```
Primary strategy: [name] (WR X%, Sharpe Y, scope: Z)
```
This line is added between the conviction line and the justification bullets. The first bullet must lead with the primary strategy's signal and rationale.

---

## Data Flow

```
User: "Should I buy NABIL?"
  │
  ▼
Orchestrator → buy-sell-strategist
  │
  ▼
get_signals_for_ticker("NABIL")
  │
  Returns: strategy signals [enriched with pnl_pct, win_rate, sharpe,
           best_objective, optimization_scope] + smart-money signals
  │
  ▼
Strategist ranks strategy signals:
  1. optimization_scope (SYMBOL first)
  2. win_rate descending
  3. sharpe descending
  → Identifies primary strategy (e.g. GoldenCrossADX, WR 62%, scope SYMBOL)
  │
  ▼
Weighted tally → confluence score → R/R → position sizing → verdict
  │
  ▼
Verdict leads with: "Primary strategy: GoldenCrossADX (WR 62%, Sharpe 1.4, scope: SYMBOL)"
```

---

## Error Handling

- If no strategy signals exist for the ticker: existing behavior unchanged — falls through to smart-money signals only
- If `strategy.win_rate` is 0 or null (no backtest yet): treat as weight 1× (neutral), don't discard
- If `signal.metadata` is missing or has no `optimization_scope`: default to `"DEFAULT"` (lowest rank)
- If all strategies have identical scope + win_rate + sharpe: rank by pnl_pct as tiebreaker; if still tied, order by signal date descending

---

## Testing

- Existing `get_signals_for_ticker` tests: verify new fields appear in response and don't break existing shape
- Strategist integration: verify that a symbol with a SYMBOL-scoped high-win-rate strategy leads the verdict with that strategy
- Edge case: symbol with no optimized experiments (all DEFAULT scope) — verdict should still produce a valid output
- Edge case: all strategies return HOLD — confluence score correctly reflects no actionable signal

---

## What This Does NOT Do

- Does not run new backtests or optimizations on demand
- Does not select different strategies per symbol at the model level (strategy selection is done at signal-generation time by `generate_signals_for_symbol`)
- Does not change signal generation, scheduling, or the existing optimization pipeline
- Does not add any new API endpoints or frontend changes
