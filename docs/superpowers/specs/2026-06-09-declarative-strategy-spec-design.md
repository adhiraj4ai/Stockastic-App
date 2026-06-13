# Declarative Strategy Spec — Layer 1 of the composition platform

## Context

We rebuilt strategies as a composable framework (`Alpha × Regime × Stop × Exit`,
`backend/stocks/services/strategy_framework/`) and ported ~22 of 41 to it. The next goal
is a far more powerful authoring + evaluation experience: a visual strategy builder,
richer backtesting/optimization modes, and eventually a continuous-alpha ensemble engine.

The agreed architecture (most-powerful, sequenced) is:
1. **Declarative spec + component registry + spec→strategy compiler (THIS DOC).**
2. Continuous-alpha scores + weighted composition (blendable factor library).
3. Visual node builder (bidirectional spec ↔ code) + backtest/optimizer modes wired to the spec.
4. Regime routing → portfolio/risk layer → walk-forward cost-aware eval → learned alphas.

Layer 1 is the linchpin: it turns strategies from opaque Python blobs into introspectable
**data**, which is what makes the builder, validation, code-gen, and per-component optimizer
ranges all possible. This doc specs Layer 1 only.

## Goal

A strategy can be expressed as a typed JSON spec. The backend can (a) list all available
components and their parameter schemas, (b) compile a spec into a runnable strategy, and
(c) render a spec to the equivalent `build_strategy(...)` Python so every existing run path
keeps working unchanged. No UI in this layer (that's Layer 3); this is the backend foundation
plus the registry endpoint the builder will consume.

## The format (spec schema)

```json
{
  "version": 1,
  "alpha":  {"type": "SupertrendFlip", "params": {"period": 10, "multiplier": 3.0}},
  "regime": {"type": "AboveEMA",       "params": {"period": 200}},
  "stop":   {"type": "AtrTrail",       "params": {"multiplier": 3.0}},
  "exit":   {"type": "TrendBreak",     "params": {"period": 200}},
  "rr":     null
}
```
- `alpha` required; `regime`, `stop`, `exit`, `rr` optional/nullable.
- `exit: null` → use the alpha's own reverse-signal exit (current `build_strategy` default).
- **Forward-compatible:** a node `{"type","params"}` can later be a composite
  (`{"type":"WeightedSum","inputs":[<node>,…],"weights":[…]}`) for Layer 2 — same envelope,
  no schema break.

## Components

- New module `strategy_framework/registry.py`.
- Each component class declares a class attribute `PARAMS`: an ordered list of
  `{"name","type"("int"|"float"|"choice"),"default","min","max","step"}` (min/max/step drive
  both the builder inputs and the optimizer ranges; `choice` carries `options`). Also
  `KIND` ("alpha"|"regime"|"stop"|"exit"), `LABEL`, `CATEGORY`, and a one-line `DESC`.
- A registry decorator `@register` indexes each component by a stable `type` name (its class
  name). `registry_schema()` returns the full catalog as JSON for the API/UI.
- **Continuous-alpha readiness:** add `Alpha.score(strat) -> float` to the base with a default
  derived from `entry()/exit()` (in-position-or-entry → +1, exit → -1, else hold). Layer 1
  compilation still uses `entry()/exit()`; Layer 2 will consume `score()`. No component rewrite.

## Compiler & codegen (registry.py)

- `build_node(node, symbol)` → instantiate a component from `{type, params}`, validating the
  type exists and params match `PARAMS` (unknown key / wrong type / out-of-range → `SpecError`
  with a clear message). Inject `symbol` for components that need it (accumulation alphas).
- `compile_spec(spec, symbol) -> Strategy` → build each node, call `build_strategy(alpha,
  regime, stop, exit, rr, name)`. Returns the backtesting.py Strategy subclass.
- `spec_to_code(spec) -> str` → render the canonical
  `from stocks.services.strategy_framework import build_strategy, alphas, regimes, stops, exits`
  + `Strategy = build_strategy(...)` snippet (what the Monaco escape-hatch shows and what gets
  stored in `Strategy.code`).
- `parse_spec(dict) -> Spec` / `validate_spec(dict)` → schema validation reused by the API.

## Data model & integration (zero-break)

- Add nullable `Strategy.spec = JSONField(null=True, blank=True)` (+ migration).
- On strategy create/update (serializer/`save`): if `spec` is present and non-null, set
  `code = spec_to_code(spec)`. So the backtest view, harness, live signal generation, and the
  optimizer all run the generated code with **no changes**. If a user edits raw `code` directly
  (Monaco escape hatch), `spec` is cleared (the two are kept consistent: spec is the source of
  truth when present, else raw code is).
- New endpoint `GET /api/stocks/strategy-components/` → `registry_schema()` (the builder palette).
- Strategy serializer exposes `spec` (read) and accepts it (write).

## Files
- **New:** `backend/stocks/services/strategy_framework/registry.py`
- **Modified:** `strategy_framework/base.py` (add `Alpha.score`), `library.py` (add `PARAMS`/
  `@register`/`KIND`/`LABEL` to each component), `backend/stocks/models/strategy.py` (+`spec`),
  a migration, the Strategy serializer + view (component-registry action, spec→code on save).
- **New tests:** `backend/stocks/tests/test_strategy_spec.py`.

## Verification (end-to-end)
1. **Unit (pytest):**
   - every registered component has a non-empty `PARAMS` and a resolvable `type`;
   - `compile_spec` of a representative spec builds a Strategy that trades on synthetic data;
   - `spec_to_code(spec)` execs in the harness scope to a Strategy equivalent to `compile_spec`
     (same trade count on a fixed series);
   - `validate_spec` rejects unknown type, missing required `alpha`, and out-of-range params.
2. **Integration (real data, container):** create a Strategy with a spec via the API; confirm
   `code` is auto-rendered and `manage.py backtest_basket --strategy "<name>"` runs it.
3. **Registry endpoint:** `GET /api/stocks/strategy-components/` returns alphas/regimes/stops/
   exits with param schemas; `manage.py check` clean; existing harness/framework tests still pass.

## Out of scope (Layer 1)
- The visual builder UI (Layer 3) — this layer only ships the format, registry, compiler, and
  the registry endpoint it will consume.
- Continuous-alpha blending/ensemble (Layer 2) — only the `score()` seam is added.
- Optimizer changes — it keeps tuning via the rendered `code`; per-component ranges from `PARAMS`
  are wired in Layer 3.

## Notes
- `spec` is the source of truth when present; `code` is a generated, runnable projection of it.
  This is what keeps every existing execution path working while making strategies into data.
