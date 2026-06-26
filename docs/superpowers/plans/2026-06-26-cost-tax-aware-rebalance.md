# Cost & Tax-Aware Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix `propose_rebalance`'s broken optimizer-result wiring, then make it cost & tax aware — aggregate per-leg NEPSE friction (fees + CGT), estimate each leg's expected annual benefit, and suppress net-negative legs.

**Architecture:** Add an additive `expected_returns` key to the optimizer result; add a pure `rebalance_economics` module (friction/benefit/net-negative); fix `_run_optimizer` to read the real `weights`; wire suppression + reporting into `_compute_rebalance_trades` / `_run_propose_rebalance`.

**Tech Stack:** Django 5.2, DRF, pandas, pytest; chat tools are plain Python functions.

## Global Constraints

- No function/method body over 30 lines; extract helpers.
- No magic numbers — named constants (`TRADING_DAYS_PER_YEAR = 252`).
- TDD: failing test first, every task.
- Backend tests run in Docker: `docker-compose exec -T backend pytest <path> -v`. (Pure tests with no DB also run via `cd backend && source venv/bin/activate && pytest`.)
- `perform_portfolio_optimization`'s new key MUST be additive — existing callers and the `stocks/tests/test_optimization_*` suite stay green.
- The expected-benefit estimate is a labeled 1-year, historical-mean heuristic — prose/cards must frame it as an estimate, never a guarantee.
- `_trade_preview` returns floats keyed `amount, commission, sebon_fee, dp_charge, cgt, net, warnings`. Friction = `commission + sebon_fee + dp_charge + cgt`.

---

### Task 1: Expose per-asset expected returns from the optimizer

**Files:**
- Modify: `backend/stocks/services/optimization/__init__.py`
- Modify: `backend/stocks/services/optimization/single_stock.py`
- Test: `backend/stocks/tests/test_optimization_expected_returns.py`

**Interfaces:**
- Produces: `perform_portfolio_optimization(...)` result dict gains
  `expected_returns: dict[str, float]` — annualized mean daily return per ticker
  (`returns.mean() * TRADING_DAYS_PER_YEAR`). Single-stock path returns `expected_returns: {}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_optimization_expected_returns.py
import pytest
import pandas as pd
from unittest.mock import patch
from stocks.services.optimization import perform_portfolio_optimization

pytestmark = pytest.mark.django_db


def test_result_includes_annualized_expected_returns():
    # Two tickers, deterministic upward drift so the mean is positive and checkable.
    idx = pd.date_range("2024-01-01", periods=120, freq="D")
    df = pd.DataFrame({"AAA": [100 * (1.001 ** i) for i in range(120)],
                       "BBB": [50 * (1.002 ** i) for i in range(120)]}, index=idx)
    with patch("stocks.services.optimization.fetch_price_data", return_value=df):
        out = perform_portfolio_optimization(["AAA", "BBB"],
                                             current_holdings={"AAA": {"quantity": 10, "price": 100},
                                                               "BBB": {"quantity": 10, "price": 50}})
    assert out["success"] is True
    er = out["expected_returns"]
    expected = df.pct_change().dropna().mean() * 252
    assert er["AAA"] == pytest.approx(expected["AAA"], rel=1e-6)
    assert er["BBB"] == pytest.approx(expected["BBB"], rel=1e-6)


def test_single_stock_result_has_empty_expected_returns():
    out = perform_portfolio_optimization(["AAA"], current_holdings={"AAA": {"quantity": 5, "price": 100}})
    assert out["expected_returns"] == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_optimization_expected_returns.py -v`
Expected: FAIL — `KeyError: 'expected_returns'`.

- [ ] **Step 3: Implement**

In `backend/stocks/services/optimization/__init__.py`, add near the top after imports:

```python
TRADING_DAYS_PER_YEAR = 252
```

In the multi-ticker return dict (the `return {...}` after `calculate_trades`), add the key:

```python
    return {
        "success": True,
        "weights": {t: float(w) for t, w in result.weight_map.items()},
        "metrics": result.metrics,
        "trades": trades,
        "expected_returns": {t: float(r) for t, r in (returns.mean() * TRADING_DAYS_PER_YEAR).items()},
        "note": result.note,
    }
```

In `backend/stocks/services/optimization/single_stock.py`, add `"expected_returns": {}` to the
dict returned by `single_stock_result`:

```python
    return {
        "success": True,
        "weights": {ticker: 1.0},
        "metrics": _ZERO_METRICS,
        "trades": trades,
        "expected_returns": {},
        "note": "Single stock portfolio.",
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_optimization_expected_returns.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Confirm existing optimizer tests still pass**

Run: `docker-compose exec -T backend pytest stocks/tests/test_optimization_integration.py stocks/tests/test_optimization_service_refactor.py -q`
Expected: PASS (additive key, no regression).

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/services/optimization/__init__.py backend/stocks/services/optimization/single_stock.py backend/stocks/tests/test_optimization_expected_returns.py
git commit -m "feat(optimization): expose per-asset annualized expected returns"
```

---

### Task 2: Pure rebalance-economics module

**Files:**
- Create: `backend/chat/tools/rebalance_economics.py`
- Test: `backend/chat/tests/test_rebalance_economics.py`

**Interfaces:**
- Produces:
  - `leg_friction(fees: dict) -> float` — sum of `commission + sebon_fee + dp_charge + cgt`.
  - `expected_annual_benefit(delta_weight_value: float, asset_annual_return: float) -> float` —
    `abs(delta_weight_value) * abs(asset_annual_return)`.
  - `is_net_negative(friction: float, benefit: float) -> bool` — `friction >= benefit`.

- [ ] **Step 1: Write the failing test**

```python
# backend/chat/tests/test_rebalance_economics.py
from chat.tools import rebalance_economics as econ


def test_leg_friction_sums_all_cost_components():
    fees = {"commission": 36.0, "sebon_fee": 1.5, "dp_charge": 25.0, "cgt": 7.5}
    assert econ.leg_friction(fees) == 70.0


def test_leg_friction_missing_keys_default_to_zero():
    assert econ.leg_friction({"commission": 10.0}) == 10.0


def test_expected_annual_benefit_is_magnitude_of_move():
    # Rs 100,000 shifted into an asset with +12% expected annual return.
    assert econ.expected_annual_benefit(100_000.0, 0.12) == 12_000.0


def test_expected_annual_benefit_uses_absolute_values():
    # Selling (negative delta value) out of a negative-return asset is still a positive benefit.
    assert econ.expected_annual_benefit(-100_000.0, -0.05) == 5_000.0


def test_is_net_negative_true_when_friction_meets_or_exceeds_benefit():
    assert econ.is_net_negative(70.0, 50.0) is True
    assert econ.is_net_negative(50.0, 50.0) is True


def test_is_net_negative_false_when_benefit_exceeds_friction():
    assert econ.is_net_negative(50.0, 70.0) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_rebalance_economics.py -v`
Expected: FAIL — `ModuleNotFoundError: chat.tools.rebalance_economics`.

- [ ] **Step 3: Implement**

```python
# backend/chat/tools/rebalance_economics.py
"""Pure economics for cost/tax-aware rebalancing. No DB, no Django."""

_FEE_KEYS = ("commission", "sebon_fee", "dp_charge", "cgt")


def leg_friction(fees):
    """Total NEPSE friction for one leg: fees + CGT."""
    return float(sum(fees.get(k, 0.0) for k in _FEE_KEYS))


def expected_annual_benefit(delta_weight_value, asset_annual_return):
    """Estimated 1-year benefit of shifting `delta_weight_value` of capital.

    Magnitude of the asset's expected annual move on the reallocated capital.
    Heuristic estimate, not a forecast.
    """
    return abs(float(delta_weight_value)) * abs(float(asset_annual_return))


def is_net_negative(friction, benefit):
    """A leg is net-negative when its friction meets or exceeds its expected benefit."""
    return float(friction) >= float(benefit)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest chat/tests/test_rebalance_economics.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools/rebalance_economics.py backend/chat/tests/test_rebalance_economics.py
git commit -m "feat(rebalance): add pure leg-economics module"
```

---

### Task 3: Fix optimizer-result wiring in the rebalance tool

**Files:**
- Modify: `backend/chat/tools/trading.py` (`_run_optimizer`)
- Test: `backend/chat/tests/test_rebalance_tool.py`

**Interfaces:**
- Consumes: `perform_portfolio_optimization` result (`weights`, `expected_returns`).
- Produces: `_run_optimizer(holdings, method)` now returns
  `(weights, prices, total_value, expected_returns, err)` — reading `opt["weights"]` (not the
  nonexistent `optimal_weights`), resolving prices from `holdings`, and returning an error when
  `weights` is empty rather than implying a full liquidation.

- [ ] **Step 1: Write the failing test**

```python
# backend/chat/tests/test_rebalance_tool.py
from unittest.mock import patch
from chat.tools import trading


def _holdings():
    return {"AAA": {"quantity": 10, "price": 100.0}, "BBB": {"quantity": 20, "price": 50.0}}


def test_run_optimizer_reads_weights_key_not_optimal_weights():
    opt = {"success": True, "weights": {"AAA": 0.6, "BBB": 0.4},
           "expected_returns": {"AAA": 0.10, "BBB": 0.05}, "metrics": {}, "trades": [], "note": ""}
    with patch("chat.tools.trading.perform_portfolio_optimization", return_value=opt):
        weights, prices, total_value, expected_returns, err = trading._run_optimizer(_holdings(), "max_sharpe")
    assert err is None
    assert weights == {"AAA": 0.6, "BBB": 0.4}          # real weights, not {}
    assert expected_returns == {"AAA": 0.10, "BBB": 0.05}
    assert total_value == pytest.approx(10 * 100.0 + 20 * 50.0)


def test_run_optimizer_errors_on_empty_weights_instead_of_liquidating():
    opt = {"success": True, "weights": {}, "expected_returns": {}, "metrics": {}, "trades": [], "note": ""}
    with patch("chat.tools.trading.perform_portfolio_optimization", return_value=opt):
        weights, prices, total_value, expected_returns, err = trading._run_optimizer(_holdings(), "max_sharpe")
    assert err is not None
```

Add `import pytest` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_rebalance_tool.py -v`
Expected: FAIL — current `_run_optimizer` reads `optimal_weights` → `weights == {}`, and returns a 4-tuple (unpacking 5 values fails / weights wrong).

- [ ] **Step 3: Implement**

Replace `_run_optimizer` in `backend/chat/tools/trading.py`:

```python
def _run_optimizer(holdings, method):
    tickers = list(holdings.keys())
    opt = perform_portfolio_optimization(tickers, current_holdings=holdings, method=method)
    if not opt.get("success"):
        return None, None, None, None, opt.get("error", "unknown")
    weights = opt.get("weights") or {}
    if not weights:
        return None, None, None, None, "optimizer returned no target weights"
    expected_returns = opt.get("expected_returns") or {}
    prices = {t: holdings[t]["price"] for t in tickers}
    total_value = sum(holdings[t]["quantity"] * float(prices[t]) for t in tickers)
    return weights, prices, total_value, expected_returns, None
```

Update the caller `_run_propose_rebalance` to unpack 5 values and pass `expected_returns` through
(the `_compute_rebalance_trades` signature change lands in Task 4 — for THIS task, unpack the new
tuple and pass `expected_returns` into the existing call positionally only after Task 4; for now
update the unpack and keep the existing call working):

```python
    weights, prices, total_value, expected_returns, err = _run_optimizer(holdings, method)
    if err is not None:
        return _result(f"Optimizer could not produce a result: {err}.", is_error=True)
```

(Leave the `_compute_rebalance_trades(...)` call as-is in this task; Task 4 changes its signature.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest chat/tests/test_rebalance_tool.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools/trading.py backend/chat/tests/test_rebalance_tool.py
git commit -m "fix(rebalance): read real optimizer weights, guard empty-weights liquidation"
```

---

### Task 4: Suppress net-negative legs + report friction

**Files:**
- Modify: `backend/chat/tools/trading.py` (`_compute_rebalance_trades`, `_run_propose_rebalance`)
- Test: `backend/chat/tests/test_rebalance_tool.py` (append)

**Interfaces:**
- Consumes: `rebalance_economics` (Task 2), `expected_returns` (Task 3).
- Produces: `_compute_rebalance_trades(holdings, weights, prices, total_value, user, account, expected_returns)`
  returns `(trades, lines, warnings, suppressed, total_friction)` where `suppressed` is a list of
  `{ticker, action, quantity, friction, benefit, reason}` and `total_friction` is the float sum
  over kept legs. `_run_propose_rebalance` reports total friction + suppressed legs; all-suppressed
  yields a "within rebalancing costs" message (not an error).

- [ ] **Step 1: Write the failing test**

```python
# append to backend/chat/tests/test_rebalance_tool.py

def test_micro_leg_with_friction_over_benefit_is_suppressed(monkeypatch):
    # A tiny BUY whose fees dwarf its expected annual benefit must be suppressed.
    holdings = {"AAA": {"quantity": 100, "price": 100.0}, "BBB": {"quantity": 0, "price": 100.0}}
    weights = {"AAA": 0.99, "BBB": 0.01}
    prices = {"AAA": 100.0, "BBB": 100.0}
    total_value = 100 * 100.0
    expected_returns = {"AAA": 0.10, "BBB": 0.0001}     # BBB barely moves
    # Stub fee preview: heavy friction, so BBB's tiny benefit can't cover it.
    monkeypatch.setattr(trading, "_trade_preview", lambda *a, **k: {
        "amount": 100.0, "commission": 36.0, "sebon_fee": 1.5, "dp_charge": 25.0,
        "cgt": 0.0, "net": 100.0, "warnings": []})
    trades, lines, warnings, suppressed, total_friction = trading._compute_rebalance_trades(
        holdings, weights, prices, total_value, user=None, account=None, expected_returns=expected_returns)
    suppressed_tickers = {s["ticker"] for s in suppressed}
    assert "BBB" in suppressed_tickers
    assert all(t["ticker"] != "BBB" for t in trades)


def test_beneficial_leg_is_kept_and_friction_totalled(monkeypatch):
    holdings = {"AAA": {"quantity": 100, "price": 100.0}, "BBB": {"quantity": 0, "price": 100.0}}
    weights = {"AAA": 0.5, "BBB": 0.5}
    prices = {"AAA": 100.0, "BBB": 100.0}
    total_value = 100 * 100.0
    expected_returns = {"AAA": 0.10, "BBB": 0.20}       # big move justifies the cost
    monkeypatch.setattr(trading, "_trade_preview", lambda *a, **k: {
        "amount": 5000.0, "commission": 16.5, "sebon_fee": 0.75, "dp_charge": 25.0,
        "cgt": 0.0, "net": 5000.0, "warnings": []})
    trades, lines, warnings, suppressed, total_friction = trading._compute_rebalance_trades(
        holdings, weights, prices, total_value, user=None, account=None, expected_returns=expected_returns)
    assert any(t["ticker"] == "BBB" for t in trades)
    assert total_friction == pytest.approx(sum(
        ln["fees"]["commission"] + ln["fees"]["sebon_fee"] + ln["fees"]["dp_charge"] + ln["fees"]["cgt"]
        for ln in lines))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_rebalance_tool.py -k "suppressed or friction_totalled" -v`
Expected: FAIL — `_compute_rebalance_trades` returns 3 values, not 5, and has no `expected_returns` param.

- [ ] **Step 3: Implement**

Add the import near the top of `backend/chat/tools/trading.py`:

```python
from chat.tools import rebalance_economics as econ
```

Replace `_compute_rebalance_trades`:

```python
def _compute_rebalance_trades(holdings, weights, prices, total_value, user, account, expected_returns):
    trades, lines, all_warnings, suppressed = [], [], [], []
    total_friction = 0.0
    for t in list(holdings.keys()):
        price = float(prices.get(t, holdings[t]["price"]) or 0)
        if price <= 0:
            continue
        delta = int((total_value * float(weights.get(t, 0))) // price) - holdings[t]["quantity"]
        if delta == 0:
            continue
        leg = _evaluate_rebalance_leg(t, delta, price, total_value, expected_returns, user, account)
        if leg["suppressed"]:
            suppressed.append(leg["suppressed"])
            continue
        trades.append(leg["trade"])
        lines.append(leg["line"])
        all_warnings.extend(leg["warnings"])
        total_friction += leg["friction"]
    return trades, lines, all_warnings, suppressed, round(total_friction, 2)


def _evaluate_rebalance_leg(ticker, delta, price, total_value, expected_returns, user, account):
    txn_type = "BUY" if delta > 0 else "SELL"
    qty = abs(delta)
    pv = _trade_preview(user, account, ticker, txn_type, qty, price)
    friction = econ.leg_friction(pv)
    benefit = econ.expected_annual_benefit(qty * price, expected_returns.get(ticker, 0.0))
    if econ.is_net_negative(friction, benefit):
        reason = (f"fees + CGT (Rs {friction:,.0f}) exceed estimated 1-year benefit "
                  f"(Rs {benefit:,.0f})")
        return {"suppressed": {"ticker": ticker, "action": txn_type, "quantity": qty,
                               "friction": round(friction, 2), "benefit": round(benefit, 2),
                               "reason": reason}, "trade": None, "line": None,
                "warnings": [], "friction": 0.0}
    return {
        "suppressed": None,
        "trade": {"ticker": ticker, "txn_type": txn_type, "quantity": qty, "rate": price},
        "line": {"label": f"{txn_type} {qty} {ticker}", "ticker": ticker, "action": txn_type,
                 "quantity": qty, "rate": price,
                 "fees": {"commission": pv["commission"], "sebon_fee": pv["sebon_fee"],
                          "dp_charge": pv["dp_charge"], "cgt": pv["cgt"]},
                 "net": pv["net"], "net_benefit": round(benefit - friction, 2)},
        "warnings": pv["warnings"], "friction": friction,
    }
```

Update `_run_propose_rebalance` to consume the new return shape and report:

```python
    trades, lines, all_warnings, suppressed, total_friction = _compute_rebalance_trades(
        holdings, weights, prices, total_value, user, account, expected_returns)
    if not trades and suppressed:
        return _result("Optimal allocation is within rebalancing costs — no cost-justified "
                       "trades.", is_error=True)
    if not trades:
        return _result("Your portfolio is already at the optimal allocation — no trades needed.",
                       is_error=True)
    title = f"Rebalance ({method}) — {len(trades)} trade(s)"
    payload = {"account_id": account.id if account else None, "method": method,
               "targets": [], "trades": trades}
    card_preview = {"title": title, "lines": lines, "warnings": all_warnings,
                    "total_friction": total_friction, "suppressed": suppressed}
    draft = create_draft(
        user=user, account=account, kind=PortfolioActionDraft.Kind.REBALANCE,
        title=title, payload=payload, preview=card_preview,
    )
    suppressed_note = f" Skipped {len(suppressed)} net-negative leg(s)." if suppressed else ""
    return _result(
        f"Drafted a {method} rebalance: {len(trades)} trade(s), estimated friction "
        f"Rs {total_friction:,.0f} (fees + CGT).{suppressed_note} Awaiting your confirmation.",
        card={"type": "proposal",
              "data": {"draft_id": draft.id, "kind": "REBALANCE", "title": title,
                       "status": "PENDING", "preview": card_preview}},
        _tool_name="propose_rebalance",
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest chat/tests/test_rebalance_tool.py -v`
Expected: PASS (all rebalance-tool tests).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools/trading.py backend/chat/tests/test_rebalance_tool.py
git commit -m "feat(rebalance): suppress net-negative legs and report NEPSE friction"
```

---

### Task 5: Full-suite verification

- [ ] **Step 1: Run the feature suite**

Run: `docker-compose exec -T backend pytest stocks/tests/test_optimization_expected_returns.py chat/tests/test_rebalance_economics.py chat/tests/test_rebalance_tool.py -v`
Expected: all PASS.

- [ ] **Step 2: Run optimization + tools regression**

Run: `docker-compose exec -T backend pytest stocks/tests/test_optimization_integration.py stocks/tests/test_optimization_service_refactor.py chat/tests/test_tools_package.py -q`
Expected: all PASS (no regression from the additive `expected_returns` key).

- [ ] **Step 3: Commit (if any verification fixes were needed)**

```bash
git add -A && git commit -m "test(rebalance): verify cost & tax-aware rebalance end to end"
```

---

## Self-Review

**Spec coverage:**
- Fix optimizer-result wiring (read `weights`, resolve prices, empty guard) → Task 3. ✓
- `expected_returns` key (additive, single-stock too) → Task 1. ✓
- Pure leg-economics (friction, benefit, net-negative) → Task 2. ✓
- Suppress net-negative legs + collect `suppressed` → Task 4. ✓
- Report total friction + suppressed + all-suppressed message → Task 4. ✓
- Heuristic framing in prose → Task 4 (reason string + "estimated 1-year benefit"). ✓
- Existing optimizer tests stay green → Tasks 1, 5. ✓

**Placeholder scan:** No TBD/TODO; every step has complete code.

**Type consistency:** `_run_optimizer` returns a 5-tuple consumed in Tasks 3 & 4; `expected_returns`
is `dict[str,float]` produced in Task 1, threaded in Task 3, consumed in Tasks 2/4; `_trade_preview`
fee keys match `econ.leg_friction`'s `_FEE_KEYS`. Consistent.
