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
_PCT_FLOAT = 100.0


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


def _summary(holdings, dividends):
    total_invested = sum(h["invested"] for h in holdings)
    total_unrealized = sum(h["unrealized"] for h in holdings)
    total_cash = float(dividends.get("summary", {}).get("total_cash_net", 0.0))
    total_realized = float(dividends.get("summary", {}).get("total_realized_pnl", 0.0))
    portfolio_total = total_unrealized + total_cash + total_realized
    pct = (portfolio_total / total_invested * _PCT_FLOAT) if total_invested else 0.0
    return {
        "total_invested": round(total_invested, 2), "total_unrealized": round(total_unrealized, 2),
        "total_cash_dividends": round(total_cash, 2), "total_realized_pnl": round(total_realized, 2),
        "portfolio_total_return": round(portfolio_total, 2), "portfolio_total_return_pct": round(pct, 2),
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
