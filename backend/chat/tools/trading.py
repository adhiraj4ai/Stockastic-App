"""Portfolio Manager tools — propose trades, exits, rebalance, position sizing."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from asgiref.sync import sync_to_async
from claude_agent_sdk import tool
from django.db.utils import OperationalError, ProgrammingError

from stocks.models.market import DailyStockPrice
from stocks.models.portfolio import (
    PortfolioActionDraft,
    PortfolioItem,
    PortfolioTransaction,
    TransactionType,
)
from stocks.optimization import perform_portfolio_optimization
from stocks.services.portfolio_drafts import create_draft
from stocks.services.position_sizing import PositionSizingService
from stocks.utils import (
    calculate_broker_commission,
    calculate_cgt,
    calculate_dp_charge,
    calculate_sebon_fee,
)

from chat.tools import rebalance_economics as econ
from .base import _result, _resolve_account


# ─── Module-level constants ───────────────────────────────────────────────────
_ERR_EMPTY_WEIGHTS = "optimizer returned no target weights"


# ─── Position sizing ──────────────────────────────────────────────────────────


def _run_position_sizing(user, account_id, risk_pct, entry, stop, target, ticker):
    account = _resolve_account(user, account_id)
    balance = float(account.balance) if account and account.balance else 100000.0
    try:
        sizing = PositionSizingService.calculate_position_size(
            account_balance=balance, risk_percentage=risk_pct,
            entry_price=float(entry), stop_loss_price=float(stop),
            target_price=float(target) if target is not None else None,
        )
    except ValueError as e:
        return _result(str(e), is_error=True)
    prose = (
        f"{ticker or 'Position'}: {sizing['max_shares']} shares @ Rs {sizing['entry_price']:.2f} "
        f"(Rs {sizing['total_investment']:,.0f}, risking Rs {sizing['risk_amount']:,.0f}/{sizing['risk_percentage']:.1f}%)."
    )
    return _result(prose, card={"type": "position_sizing", "data": {**sizing, "symbol": ticker or None}})


@tool(
    "calc_position_size",
    "Compute max shares, total cost, and warnings for a trade given account balance, entry, stop-loss, target.",
    {"ticker": str, "entry_price": float, "stop_loss": float, "target_price": float, "risk_percent": float, "account_id": str},
)
async def calc_position_size(args: dict) -> dict:
    from chat._user_context import get_user
    ticker = (args.get("ticker") or "").upper().strip()
    entry = args.get("entry_price")
    stop = args.get("stop_loss")
    target = args.get("target_price")
    risk_pct = float(args.get("risk_percent") or 2.0)
    account_id = args.get("account_id")
    if entry is None or stop is None:
        return _result("entry_price and stop_loss are required.", is_error=True)
    user = get_user()
    return await sync_to_async(_run_position_sizing)(user, account_id, risk_pct, entry, stop, target, ticker)


# ─── Trade preview helpers ────────────────────────────────────────────────────


def _compute_buy_preview(amount, account):
    commission = calculate_broker_commission(amount)
    sebon_fee = calculate_sebon_fee(amount)
    dp_charge = calculate_dp_charge()
    warnings = []
    net = amount + commission + sebon_fee + dp_charge
    if account and getattr(account, "account_type", None) == "PAPER" and account.balance < net:
        warnings.append(
            f"Insufficient paper balance (need Rs {float(net):,.0f}, have Rs {float(account.balance):,.0f})."
        )
    return commission, sebon_fee, dp_charge, Decimal("0.00"), net, warnings


def _compute_cgt_on_sell(user, account, ticker, quantity, rate):
    from stocks.services.finance import weighted_acquisition_date, is_long_term_holding
    item = PortfolioItem.objects.filter(user=user, ticker=ticker, account=account).first()
    wacc = Decimal(str(item.wacc)) if item and item.wacc else None
    if wacc is None or item is None:
        return Decimal("0.00")
    profit = (rate - wacc) * Decimal(quantity)
    if profit <= 0:
        return Decimal("0.00")
    _prior = PortfolioTransaction.objects.filter(
        user=user, ticker=ticker,
        transaction_type__in=[TransactionType.BUY, TransactionType.BONUS],
    )
    if account:
        _prior = _prior.filter(account=account)
    _lots = [(t.quantity, t.transaction_date.date()) for t in _prior if t.quantity]
    _long_term = is_long_term_holding(weighted_acquisition_date(_lots), date.today())
    return calculate_cgt(profit, is_long_term=_long_term)


def _compute_sell_preview(user, account, ticker, quantity, rate, amount):
    commission = calculate_broker_commission(amount)
    sebon_fee = calculate_sebon_fee(amount)
    dp_charge = calculate_dp_charge()
    warnings = []
    item = PortfolioItem.objects.filter(user=user, ticker=ticker, account=account).first()
    if item is None:
        warnings.append(f"No {ticker} holding found in this account.")
    elif item.quantity < quantity:
        warnings.append(f"Only {item.quantity} {ticker} held; cannot sell {quantity}.")
    cgt = _compute_cgt_on_sell(user, account, ticker, quantity, rate)
    net = amount - commission - sebon_fee - dp_charge - cgt
    return commission, sebon_fee, dp_charge, cgt, net, warnings


def _trade_preview(user, account, ticker, txn_type, quantity, rate):
    """Estimate fees/CGT/net for a single trade WITHOUT mutating anything."""
    quantity = int(quantity)
    rate = Decimal(str(rate))
    amount = Decimal(quantity) * rate
    if txn_type == "SELL":
        commission, sebon_fee, dp_charge, cgt, net, warnings = _compute_sell_preview(
            user, account, ticker, quantity, rate, amount
        )
    else:
        commission, sebon_fee, dp_charge, cgt, net, warnings = _compute_buy_preview(amount, account)
    return {
        "amount": float(amount), "commission": float(commission),
        "sebon_fee": float(sebon_fee), "dp_charge": float(dp_charge),
        "cgt": float(cgt), "net": float(net), "warnings": warnings,
    }


# ─── Propose trade ────────────────────────────────────────────────────────────


def _build_trade_draft_card(ticker, action, quantity, rate, preview):
    title = f"{action} {quantity} {ticker} @ Rs {float(rate):,.2f}"
    return title, {
        "title": title,
        "lines": [{
            "ticker": ticker, "action": action, "quantity": quantity, "rate": float(rate),
            "fees": {"commission": preview["commission"], "sebon_fee": preview["sebon_fee"],
                     "dp_charge": preview["dp_charge"], "cgt": preview["cgt"]},
            "net": preview["net"],
        }],
        "warnings": preview["warnings"],
    }


def _run_propose_trade(user, account_id, ticker, action, quantity, rate):
    account = _resolve_account(user, account_id)
    preview = _trade_preview(user, account, ticker, action, quantity, float(rate))
    title, card_preview = _build_trade_draft_card(ticker, action, quantity, rate, preview)
    payload = {
        "account_id": account.id if account else None,
        "trades": [{"ticker": ticker, "txn_type": action, "quantity": quantity, "rate": float(rate)}],
    }
    draft = create_draft(
        user=user, account=account, kind=PortfolioActionDraft.Kind.TRADE,
        title=title, payload=payload, preview=card_preview,
    )
    money_label = "Total cost" if action == "BUY" else "Net proceeds"
    warn = f" ⚠️ {'; '.join(preview['warnings'])}" if preview["warnings"] else ""
    fees = preview["commission"] + preview["sebon_fee"] + preview["dp_charge"]
    prose = (
        f"Drafted: {title}. {money_label} Rs {preview['net']:,.0f} "
        f"(fees Rs {fees:,.0f}, CGT Rs {preview['cgt']:,.0f}). Awaiting your confirmation.{warn}"
    )
    return _result(prose, card={
        "type": "proposal",
        "data": {"draft_id": draft.id, "kind": "TRADE", "title": title,
                 "status": "PENDING", "preview": card_preview},
    }, _tool_name="propose_trade")


@tool(
    "propose_trade",
    "Draft a BUY or SELL of a NEPSE ticker for the user to CONFIRM before it is recorded. "
    "Computes fees + CGT and creates a pending proposal card. Does NOT execute — the user "
    "confirms it. action='BUY'|'SELL'. Pass account_id to scope to one account.",
    {"ticker": str, "action": str, "quantity": int, "rate": float, "account_id": str},
)
async def propose_trade(args: dict) -> dict:
    from chat._user_context import get_user
    ticker = (args.get("ticker") or "").upper().strip()
    action = (args.get("action") or "").upper().strip()
    quantity = int(args.get("quantity") or 0)
    rate = args.get("rate")
    account_id = args.get("account_id")
    if not ticker or action not in ("BUY", "SELL") or quantity <= 0 or rate is None:
        return _result("Provide ticker, action (BUY/SELL), positive quantity, and rate.", is_error=True)
    user = get_user()
    return await sync_to_async(_run_propose_trade)(user, account_id, ticker, action, quantity, rate)


# ─── Propose exits ────────────────────────────────────────────────────────────


def _build_exits_title_and_line(ticker, stop, target):
    title = f"Set exits on {ticker}"
    if stop is not None:
        title += f" — stop Rs {float(stop):,.2f}"
    if target is not None:
        title += f", target Rs {float(target):,.2f}"
    line = {"label": ticker, "ticker": ticker}
    if stop is not None:
        line["stop_loss_price"] = float(stop)
    if target is not None:
        line["target_price"] = float(target)
    return title, line


def _run_propose_exits(user, account_id, ticker, stop, target):
    account = _resolve_account(user, account_id)
    qs = PortfolioItem.objects.filter(user=user, ticker=ticker)
    if account:
        qs = qs.filter(account=account)
    item = qs.first()
    if not item:
        return _result(f"You don't hold {ticker}{' in that account' if account else ''}.", is_error=True)
    title, line = _build_exits_title_and_line(ticker, stop, target)
    payload = {"items": [{
        "item_id": item.id, "ticker": ticker,
        "stop_loss_price": float(stop) if stop is not None else None,
        "target_price": float(target) if target is not None else None,
    }]}
    card_preview = {"title": title, "lines": [line], "warnings": []}
    draft = create_draft(
        user=user, account=account, kind=PortfolioActionDraft.Kind.EXITS,
        title=title, payload=payload, preview=card_preview,
    )
    return _result(f"Drafted: {title}. Awaiting your confirmation.", card={
        "type": "proposal",
        "data": {"draft_id": draft.id, "kind": "EXITS", "title": title,
                 "status": "PENDING", "preview": card_preview},
    }, _tool_name="propose_exits")


@tool(
    "propose_exits",
    "Draft a stop-loss and/or target price for one of the user's holdings, for them to "
    "CONFIRM. Pass ticker and at least one of stop_loss_price / target_price. Optional "
    "account_id to disambiguate which account's holding. Does NOT execute.",
    {"ticker": str, "stop_loss_price": float, "target_price": float, "account_id": str},
)
async def propose_exits(args: dict) -> dict:
    from chat._user_context import get_user
    ticker = (args.get("ticker") or "").upper().strip()
    stop = args.get("stop_loss_price")
    target = args.get("target_price")
    account_id = args.get("account_id")
    if not ticker or (stop is None and target is None):
        return _result("Provide ticker and at least one of stop_loss_price / target_price.", is_error=True)
    user = get_user()
    return await sync_to_async(_run_propose_exits)(user, account_id, ticker, stop, target)


# ─── Propose rebalance ────────────────────────────────────────────────────────


def _build_holdings_map(items):
    holdings = {}
    for it in items:
        fallback_price = float(it.wacc or 0)
        try:
            px = DailyStockPrice.objects.filter(ticker=it.ticker).order_by("-date").first()
            price = float(px.close) if px and px.close else fallback_price
        except (OperationalError, ProgrammingError):
            price = fallback_price
        h = holdings.setdefault(it.ticker, {"quantity": 0, "price": price})
        h["quantity"] += int(it.quantity)
    return holdings


def _run_optimizer(holdings, method):
    tickers = list(holdings.keys())
    opt = perform_portfolio_optimization(tickers, current_holdings=holdings, method=method)
    if not opt.get("success"):
        return None, None, None, None, opt.get("error", "unknown")
    weights = opt.get("weights") or {}
    if not weights:
        return None, None, None, None, _ERR_EMPTY_WEIGHTS
    expected_returns = opt.get("expected_returns") or {}
    prices = {t: holdings[t]["price"] for t in tickers}
    total_value = sum(holdings[t]["quantity"] * float(prices[t]) for t in tickers)
    return weights, prices, total_value, expected_returns, None


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


def _run_propose_rebalance(user, account_id, method):
    account = _resolve_account(user, account_id)
    qs = PortfolioItem.objects.filter(user=user)
    if account:
        qs = qs.filter(account=account)
    items = list(qs)
    if not items:
        return _result("Your portfolio is empty — nothing to rebalance.", is_error=True)
    holdings = _build_holdings_map(items)
    weights, prices, total_value, expected_returns, err = _run_optimizer(holdings, method)
    if err is not None:
        return _result(f"Optimizer could not produce a result: {err}.", is_error=True)
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


@tool(
    "propose_rebalance",
    "Draft a rebalance toward an optimized allocation for the user to CONFIRM. Runs the "
    "portfolio optimizer (method='max_sharpe'|'min_volatility'|'max_return', default "
    "max_sharpe), compares to current holdings, and drafts the BUY/SELL legs to move "
    "toward the optimal weights. Pass account_id to scope. Does NOT execute.",
    {"account_id": str, "method": str},
)
async def propose_rebalance(args: dict) -> dict:
    from chat._user_context import get_user
    account_id = args.get("account_id")
    method = (args.get("method") or "max_sharpe").strip()
    user = get_user()
    return await sync_to_async(_run_propose_rebalance)(user, account_id, method)


# ─── Propose trade plan ───────────────────────────────────────────────────────


def _validate_trade_plan_legs(legs):
    total_alloc = 0.0
    for leg in legs:
        for key in ("leg_number", "price_target", "allocation_pct", "stop_loss_price"):
            if leg.get(key) is None:
                return None, (
                    f"Each leg needs leg_number, price_target, allocation_pct, and stop_loss_price. "
                    f"Leg {leg.get('leg_number', '?')} is missing {key}."
                )
        if float(leg["stop_loss_price"]) >= float(leg["price_target"]):
            return None, f"Leg {leg['leg_number']}: stop_loss_price must be below price_target."
        total_alloc += round(float(leg["allocation_pct"]), 2)
    if round(total_alloc, 2) != 100.0:
        return None, f"Leg allocation_pct must sum to 100 (got {total_alloc:.2f})."
    return total_alloc, None


def _build_trade_plan_payload(ticker, account, thesis, risk_budget_pct, target_price, legs):
    return {
        "ticker": ticker,
        "account": account.id if account else None,
        "thesis": thesis,
        "risk_budget_pct": f"{float(risk_budget_pct):.2f}",
        "target_price": f"{float(target_price):.2f}" if target_price is not None else None,
        "legs": [{
            "leg_number": int(l["leg_number"]),
            "price_target": f"{float(l['price_target']):.2f}",
            "allocation_pct": f"{float(l['allocation_pct']):.2f}",
            "stop_loss_price": f"{float(l['stop_loss_price']):.2f}",
        } for l in legs],
    }


def _run_propose_trade_plan(user, account_id, ticker, legs, risk_budget_pct, target_price, thesis):
    account = _resolve_account(user, account_id)
    payload = _build_trade_plan_payload(ticker, account, thesis, risk_budget_pct, target_price, legs)
    title = f"Trade plan: {ticker} — {len(legs)} legs"
    lines = [
        {"label": f"Leg {l['leg_number']}: {float(l['allocation_pct']):.0f}% @ Rs {float(l['price_target']):,.2f}",
         "ticker": ticker}
        for l in legs
    ]
    card_preview = {"title": title, "lines": lines, "warnings": []}
    draft = create_draft(
        user=user, account=account, kind=PortfolioActionDraft.Kind.TRADE_PLAN,
        title=title, payload=payload, preview=card_preview,
    )
    return _result(
        f"Drafted a {len(legs)}-leg trade plan for {ticker} (risk budget {float(risk_budget_pct):.1f}%). "
        f"Awaiting your confirmation.",
        card={"type": "proposal",
              "data": {"draft_id": draft.id, "kind": "TRADE_PLAN", "title": title,
                       "status": "PENDING", "preview": card_preview}},
        _tool_name="propose_trade_plan",
    )


@tool(
    "propose_trade_plan",
    "Draft a staged multi-leg trade plan (up to 5 legs) for the user to CONFIRM. legs is a "
    "list of {leg_number, price_target, allocation_pct, stop_loss_price}; allocation_pct must "
    "sum to 100 and each stop_loss_price must be below its price_target. Pass ticker, "
    "risk_budget_pct, optional account_id, thesis, target_price. Does NOT execute — on confirm "
    "it creates a TradePlan the user works through over time.",
    {"ticker": str, "legs": list, "risk_budget_pct": float, "target_price": float,
     "thesis": str, "account_id": str},
)
async def propose_trade_plan(args: dict) -> dict:
    from chat._user_context import get_user
    ticker = (args.get("ticker") or "").upper().strip()
    legs = args.get("legs") or []
    risk_budget_pct = args.get("risk_budget_pct")
    if not ticker or not legs or risk_budget_pct is None:
        return _result("Provide ticker, risk_budget_pct, and at least one leg.", is_error=True)
    _, err = _validate_trade_plan_legs(legs)
    if err:
        return _result(err, is_error=True)
    user = get_user()
    return await sync_to_async(_run_propose_trade_plan)(
        user, args.get("account_id"), ticker, legs, risk_budget_pct,
        args.get("target_price"), args.get("thesis") or ""
    )
