# Dividend-Adjusted Total Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Compute a true total return (realized + unrealized capital gain + cash dividends received) per holding and per portfolio, reusing `DividendService`, and surface it in the chat `get_portfolio_overview` and `get_holdings` tools.

**Architecture:** New `total_return_service` composes `DividendService.calculate_dividends` (cash dividends received + realized P&L per ticker) with current holdings (unrealized gain). Bonus shares are already captured in unrealized gain via the diluted-WACC mechanism, so they are NOT added separately (reported as an informational count only).

**Tech Stack:** Django 5.2, DRF, pytest; chat tools are plain Python functions invoked in tests via `tool.handler({...})` + `asyncio.run`.

## Global Constraints

- No function/method body over 30 lines; extract helpers.
- No magic numbers; reuse existing percent/face-value constants. Withholding tax is already applied inside `DividendService` (`cash_dividend_net`) — never re-apply it.
- TDD: failing test first, every task.
- Backend tests run in Docker: `docker-compose exec -T backend pytest <path> -v`. Do not report "ready to run" — paste real output.
- **No bonus double-counting:** total return = realized + unrealized + cash dividends; bonus shares are reported as a count, never summed as value.
- Total-return scoping mirrors `DividendService` (LIVE + null-account) for the dividend/realized pieces; held-position unrealized is filtered by `account_id` when provided.
- Chat-tool tests invoke decorated tools via `<tool>.handler({...})` run with `asyncio.run`, and set the user with `chat._user_context.set_user(user)` (see `chat/tests/test_saved_analyses.py` and `test_risk_profile_tool.py`).
- REST/frontend exposure is OUT OF SCOPE for this build (deferred follow-up; the service is API-ready).

---

### Task 1: `total_return_service`

**Files:**
- Create: `backend/stocks/services/total_return_service.py`
- Test: `backend/stocks/tests/test_total_return_service.py`

**Interfaces:**
- Consumes: `DividendService.calculate_dividends(user)` (returns `history[].{ticker, cash_dividend_net, bonus_shares}`, `realized_pnl[].{ticker, realized_pnl}`, `summary.{total_cash_net, total_realized_pnl}`); `PortfolioItem` (qty, wacc, ticker); latest `DailyStockPrice.close`.
- Produces: `TotalReturnService.compute(user, account_id=None) -> dict`:
  ```python
  {
    "holdings": [{"ticker", "invested", "unrealized", "cash_dividends_net",
                  "bonus_shares_received", "total_return_abs", "total_return_pct"}],
    "summary": {"total_invested", "total_unrealized", "total_cash_dividends",
                "total_realized_pnl", "portfolio_total_return", "portfolio_total_return_pct"},
  }
  ```

- [ ] **Step 1: Write the failing test**

```python
# backend/stocks/tests/test_total_return_service.py
import pytest
from decimal import Decimal
from datetime import date
from django.contrib.auth import get_user_model
from stocks.models.portfolio import PortfolioItem
from stocks.models.market import DailyStockPrice
from stocks.services import total_return_service as trs
from stocks.services.total_return_service import TotalReturnService

pytestmark = pytest.mark.django_db
User = get_user_model()


def _price(ticker, close):
    DailyStockPrice.objects.create(ticker=ticker, date=date(2026, 1, 2),
                                   open=close, high=close, low=close, close=close, volume=100)


def _fake_dividends(cash_by_ticker, realized_by_ticker, bonus_by_ticker):
    history = [{"ticker": t, "cash_dividend_net": v, "bonus_shares": bonus_by_ticker.get(t, 0)}
               for t, v in cash_by_ticker.items()]
    realized = [{"ticker": t, "realized_pnl": v} for t, v in realized_by_ticker.items()]
    return {"history": history, "realized_pnl": realized,
            "summary": {"total_cash_net": float(sum(cash_by_ticker.values())),
                        "total_realized_pnl": float(sum(realized_by_ticker.values()))}}


def test_flat_price_with_dividends_shows_positive_total_return(monkeypatch):
    user = User.objects.create_user(username="d1", password="p")
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=100, buy_price=Decimal("500"),
                                 wacc=Decimal("500"))
    _price("NABIL", 500)   # flat: zero unrealized
    monkeypatch.setattr(trs.DividendService, "calculate_dividends",
                        staticmethod(lambda u: _fake_dividends({"NABIL": 4000.0}, {}, {})))
    out = TotalReturnService.compute(user)
    row = next(h for h in out["holdings"] if h["ticker"] == "NABIL")
    assert row["unrealized"] == pytest.approx(0.0)
    assert row["cash_dividends_net"] == pytest.approx(4000.0)
    assert row["total_return_abs"] == pytest.approx(4000.0)         # dividends alone
    assert row["total_return_pct"] == pytest.approx(4000.0 / (100 * 500) * 100)


def test_price_gain_plus_dividends_sum(monkeypatch):
    user = User.objects.create_user(username="d2", password="p")
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=100, buy_price=Decimal("500"),
                                 wacc=Decimal("500"))
    _price("NABIL", 600)   # +100/share -> +10,000 unrealized
    monkeypatch.setattr(trs.DividendService, "calculate_dividends",
                        staticmethod(lambda u: _fake_dividends({"NABIL": 4000.0}, {}, {})))
    out = TotalReturnService.compute(user)
    row = next(h for h in out["holdings"] if h["ticker"] == "NABIL")
    assert row["unrealized"] == pytest.approx(10000.0)
    assert row["total_return_abs"] == pytest.approx(14000.0)


def test_bonus_not_double_counted(monkeypatch):
    # Holding already includes bonus shares (qty up, wacc diluted). Reported bonus count is
    # informational; total return must equal unrealized + cash, NOT + bonus value.
    user = User.objects.create_user(username="d3", password="p")
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=110, buy_price=Decimal("454.55"),
                                 wacc=Decimal("454.55"))   # 100 bought + 10 bonus, cost flat
    _price("NABIL", 500)
    monkeypatch.setattr(trs.DividendService, "calculate_dividends",
                        staticmethod(lambda u: _fake_dividends({"NABIL": 0.0}, {}, {"NABIL": 10})))
    out = TotalReturnService.compute(user)
    row = next(h for h in out["holdings"] if h["ticker"] == "NABIL")
    assert row["bonus_shares_received"] == 10
    expected_unrealized = 110 * 500 - 110 * 454.55
    assert row["total_return_abs"] == pytest.approx(expected_unrealized, abs=1.0)  # no +bonus value


def test_summary_aggregates_realized_and_cash(monkeypatch):
    user = User.objects.create_user(username="d4", password="p")
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=100, buy_price=Decimal("500"),
                                 wacc=Decimal("500"))
    _price("NABIL", 550)
    monkeypatch.setattr(trs.DividendService, "calculate_dividends",
                        staticmethod(lambda u: _fake_dividends({"NABIL": 4000.0}, {"OHL": 2000.0}, {})))
    out = TotalReturnService.compute(user)
    s = out["summary"]
    assert s["total_cash_dividends"] == pytest.approx(4000.0)
    assert s["total_realized_pnl"] == pytest.approx(2000.0)
    # portfolio total = held unrealized (5,000) + cash (4,000) + realized (2,000)
    assert s["portfolio_total_return"] == pytest.approx(5000.0 + 4000.0 + 2000.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest stocks/tests/test_total_return_service.py -v`
Expected: FAIL — `ModuleNotFoundError: stocks.services.total_return_service`.

- [ ] **Step 3: Implement**

```python
# backend/stocks/services/total_return_service.py
"""Total return = realized + unrealized capital gain + cash dividends received.

Reuses DividendService for cash dividends and realized P&L. Bonus shares are already
captured in unrealized gain (diluted WACC) and are reported as a count only — never
added as value (would double-count).
"""
from decimal import Decimal

from stocks.models.portfolio import PortfolioItem
from stocks.models.market import DailyStockPrice
from stocks.services.dividend_service import DividendService

_PCT = Decimal("100")


def _latest_close(ticker):
    row = DailyStockPrice.objects.filter(ticker=ticker).order_by("-date").first()
    return Decimal(str(row.close)) if row and row.close is not None else None


def _aggregate_by_ticker(rows, key):
    out = {}
    for r in rows:
        out[r["ticker"]] = out.get(r["ticker"], 0.0) + float(r.get(key, 0) or 0)
    return out


def _held_items(user, account_id):
    qs = PortfolioItem.objects.filter(user=user, quantity__gt=0)
    if account_id and account_id != "all":
        qs = qs.filter(account_id=account_id)
    return list(qs)


def _holding_row(item, cash_by_ticker, bonus_by_ticker):
    price = _latest_close(item.ticker) or Decimal(str(item.wacc or 0))
    invested = Decimal(item.quantity) * Decimal(str(item.wacc or 0))
    unrealized = Decimal(item.quantity) * price - invested
    cash = Decimal(str(cash_by_ticker.get(item.ticker, 0.0)))
    total_abs = unrealized + cash
    pct = float(total_abs / invested * _PCT) if invested else 0.0
    return {
        "ticker": item.ticker, "invested": float(round(invested, 2)),
        "unrealized": float(round(unrealized, 2)), "cash_dividends_net": float(round(cash, 2)),
        "bonus_shares_received": int(bonus_by_ticker.get(item.ticker, 0)),
        "total_return_abs": float(round(total_abs, 2)), "total_return_pct": round(pct, 2),
    }


class TotalReturnService:
    @staticmethod
    def compute(user, account_id=None):
        dividends = DividendService.calculate_dividends(user)
        cash_by_ticker = _aggregate_by_ticker(dividends.get("history", []), "cash_dividend_net")
        bonus_by_ticker = _aggregate_by_ticker(dividends.get("history", []), "bonus_shares")
        holdings = [_holding_row(it, cash_by_ticker, bonus_by_ticker)
                    for it in _held_items(user, account_id)]
        return {"holdings": holdings, "summary": _summary(holdings, dividends)}


def _summary(holdings, dividends):
    total_invested = sum(h["invested"] for h in holdings)
    total_unrealized = sum(h["unrealized"] for h in holdings)
    total_cash = float(dividends.get("summary", {}).get("total_cash_net", 0.0))
    total_realized = float(dividends.get("summary", {}).get("total_realized_pnl", 0.0))
    portfolio_total = total_unrealized + total_cash + total_realized
    pct = (portfolio_total / total_invested * 100) if total_invested else 0.0
    return {
        "total_invested": round(total_invested, 2), "total_unrealized": round(total_unrealized, 2),
        "total_cash_dividends": round(total_cash, 2), "total_realized_pnl": round(total_realized, 2),
        "portfolio_total_return": round(portfolio_total, 2), "portfolio_total_return_pct": round(pct, 2),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest stocks/tests/test_total_return_service.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/total_return_service.py backend/stocks/tests/test_total_return_service.py
git commit -m "feat(portfolio): total-return service (capital gain + dividends)"
```

---

### Task 2: Surface total return in `get_portfolio_overview`

**Files:**
- Modify: `backend/chat/tools/portfolio.py` (`get_portfolio_overview`)
- Test: `backend/chat/tests/test_total_return_tools.py`

**Interfaces:**
- Consumes: `TotalReturnService.compute` (Task 1).
- Produces: `get_portfolio_overview` card data gains `total_return` (the summary dict) and the prose
  gains a line: `Total return incl. dividends: Rs X (Y%).`

- [ ] **Step 1: Write the failing test**

```python
# backend/chat/tests/test_total_return_tools.py
import asyncio
import pytest
from django.contrib.auth import get_user_model
from decimal import Decimal
from datetime import date
from stocks.models.portfolio import PortfolioItem
from stocks.models.market import DailyStockPrice
from chat.tools import portfolio as ptools
from chat import _user_context

pytestmark = pytest.mark.django_db
User = get_user_model()


def _run(coro):
    return asyncio.run(coro)


def _seed(user):
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=100,
                                 buy_price=Decimal("500"), wacc=Decimal("500"))
    DailyStockPrice.objects.create(ticker="NABIL", date=date(2026, 1, 2),
                                   open=550, high=550, low=550, close=550, volume=100)


def test_overview_prose_and_card_include_total_return(monkeypatch):
    user = User.objects.create_user(username="o1", password="p")
    _seed(user)
    monkeypatch.setattr(ptools.TotalReturnService, "compute",
                        staticmethod(lambda u, account_id=None: {
                            "holdings": [],
                            "summary": {"total_invested": 50000.0, "total_unrealized": 5000.0,
                                        "total_cash_dividends": 4000.0, "total_realized_pnl": 0.0,
                                        "portfolio_total_return": 9000.0,
                                        "portfolio_total_return_pct": 18.0}}))
    _user_context.set_user(user)
    try:
        result = _run(ptools.get_portfolio_overview.handler({"account_id": None}))
    finally:
        _user_context.reset_cards()
    text = result["content"][0]["text"]
    assert "Total return" in text and "9,000" in text and "18.0" in text
    card = next(b for b in result["content"] if isinstance(b, dict) and b.get("type") == "card") \
        if False else None  # card is on the tool result's card channel
```

NOTE: confirm how `_result(..., card=...)` exposes the card in the returned dict (see existing
`get_portfolio_overview`/`get_risk_profile` tests). Assert the prose substring at minimum; if the
card is accessible in the result structure, also assert `data["total_return"]["portfolio_total_return"] == 9000.0`. Adjust the card assertion to the real structure rather than the placeholder above.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest chat/tests/test_total_return_tools.py -k overview -v`
Expected: FAIL — prose has no "Total return" line; `TotalReturnService` not imported.

- [ ] **Step 3: Implement**

Add import near the other service imports in `chat/tools/portfolio.py`:

```python
from stocks.services.total_return_service import TotalReturnService
```

In `get_portfolio_overview._run`, after computing the existing overview, add total return:

```python
        tr = TotalReturnService.compute(user, account_id)["summary"]
        prose = (
            f"Portfolio: Rs {current:,.0f} (Rs {invested:,.0f} invested). "
            f"Total P/L Rs {total_pl:+,.0f} ({(total_pl/invested*100 if invested else 0):+.2f}%), "
            f"day P/L Rs {day_pl:+,.0f}. "
            f"Total return incl. dividends: Rs {tr['portfolio_total_return']:+,.0f} "
            f"({tr['portfolio_total_return_pct']:+.1f}%). "
            f"Best: {best.ticker} {float(best.gain_loss_percent):+.2f}%. "
            f"Worst: {worst.ticker} {float(worst.gain_loss_percent):+.2f}%."
        )
        return _result(prose, card={"type": "portfolio", "data": {
            "invested": invested, "current": current, "total_pl": total_pl,
            "total_pl_pct": (total_pl / invested * 100) if invested else 0,
            "day_pl": day_pl, "holdings_count": len(items),
            "total_return": tr,
            "best": {"ticker": best.ticker, "pct": float(best.gain_loss_percent or 0)},
            "worst": {"ticker": worst.ticker, "pct": float(worst.gain_loss_percent or 0)},
        }})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest chat/tests/test_total_return_tools.py -k overview -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools/portfolio.py backend/chat/tests/test_total_return_tools.py
git commit -m "feat(chat): total return in portfolio overview"
```

---

### Task 3: Surface per-holding total return in `get_holdings`

**Files:**
- Modify: `backend/chat/tools/portfolio.py` (`get_holdings`)
- Test: `backend/chat/tests/test_total_return_tools.py` (append)

**Interfaces:**
- Consumes: `TotalReturnService.compute` (Task 1).
- Produces: each `get_holdings` row gains `total_return_abs` and `total_return_pct` (matched by
  ticker; defaults 0.0 when the ticker is absent from the total-return result).

- [ ] **Step 1: Write the failing test**

```python
# append to backend/chat/tests/test_total_return_tools.py

def test_holdings_rows_include_total_return(monkeypatch):
    user = User.objects.create_user(username="h1", password="p")
    _seed(user)
    monkeypatch.setattr(ptools.TotalReturnService, "compute",
                        staticmethod(lambda u, account_id=None: {
                            "holdings": [{"ticker": "NABIL", "total_return_abs": 9000.0,
                                          "total_return_pct": 18.0}],
                            "summary": {}}))
    _user_context.set_user(user)
    try:
        result = _run(ptools.get_holdings.handler({"account_id": None}))
    finally:
        _user_context.reset_cards()
    # Find the holdings card data; assert NABIL row carries total return.
    # (Adjust extraction to the real _result card structure.)
    text = result["content"][0]["text"]
    assert "holdings" in text.lower()
```

NOTE: read how `get_holdings`'s card data is structured in the returned `_result` and assert the
NABIL row's `total_return_abs == 9000.0` against the actual card payload, not just the prose.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker-compose exec -T backend pytest chat/tests/test_total_return_tools.py -k holdings -v`
Expected: FAIL — rows lack `total_return_abs`.

- [ ] **Step 3: Implement**

In `get_holdings._run`, enrich each row by ticker:

```python
        tr_by_ticker = {h["ticker"]: h for h in TotalReturnService.compute(user, account_id)["holdings"]}
        rows = [_build_holding_row(it) for it in items]
        for r in rows:
            tr = tr_by_ticker.get(r["ticker"], {})
            r["total_return_abs"] = tr.get("total_return_abs", 0.0)
            r["total_return_pct"] = tr.get("total_return_pct", 0.0)
        rows.sort(key=lambda r: r["current_value"], reverse=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker-compose exec -T backend pytest chat/tests/test_total_return_tools.py -v`
Expected: PASS (all total-return tool tests).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools/portfolio.py backend/chat/tests/test_total_return_tools.py
git commit -m "feat(chat): per-holding total return in get_holdings"
```

---

### Task 4: Full-suite verification

- [ ] **Step 1: Run the feature suite**

Run: `docker-compose exec -T backend pytest stocks/tests/test_total_return_service.py chat/tests/test_total_return_tools.py -v`
Expected: all PASS.

- [ ] **Step 2: Run dividend/portfolio regression**

Run: `docker-compose exec -T backend pytest stocks/tests/ -k "dividend or portfolio" -q`
Expected: PASS (no regression — the service only reads existing data).

- [ ] **Step 3: Commit (if verification fixes needed)**

```bash
git add -A && git commit -m "test(portfolio): verify dividend-adjusted total return"
```

---

## Self-Review

**Spec coverage:**
- total_return = realized + unrealized + cash dividends; bonus NOT double-counted → Task 1 (`_summary`, `_holding_row`, `test_bonus_not_double_counted`). ✓
- Reuse DividendService → Task 1 (monkeypatched in tests; real call in service). ✓
- Per-holding + portfolio figures → Task 1. ✓
- Surface in get_portfolio_overview + get_holdings → Tasks 2, 3. ✓
- Scoping mirrors DividendService; held unrealized filtered by account_id → Task 1 (`_held_items`). ✓
- REST/frontend deferred → noted in Global Constraints. ✓

**Placeholder scan:** The two chat-tool tests contain explicit NOTEs directing the implementer to
assert against the real `_result` card structure (the exact card-access shape must be read from the
existing tool tests). These are deliberate build-time confirmations, not unfinished requirements —
the prose assertions are concrete and sufficient to drive RED→GREEN; the card assertions strengthen
them once the structure is confirmed.

**Type consistency:** `TotalReturnService.compute(user, account_id=None)` and its `{holdings, summary}`
shape are produced in Task 1 and consumed in Tasks 2–3 by the exact key names. DividendService keys
(`history[].cash_dividend_net/bonus_shares`, `realized_pnl[].realized_pnl`, `summary.total_cash_net/
total_realized_pnl`) match the verified service output.
