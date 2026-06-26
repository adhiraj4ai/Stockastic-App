from django.db import transaction
from django.db.models import Sum, Max
from ..models.portfolio import PortfolioItem, PortfolioTransaction, TransactionType, PortfolioAccount, AccountType
from ..models.market import DailyStockPrice, Company
from ..models.fundamentals import StockFundamental
from ..models.signal import SignalEpisode
from .fundamental_service import FundamentalService
from .settlement_service import SettlementService
from ..utils import (
    calculate_broker_commission, calculate_sebon_fee,
    calculate_dp_charge, calculate_cgt
)
from decimal import Decimal
import pandas as pd
from django.utils import timezone
from datetime import timedelta

SHORT_SELL_WARNING = "Short selling is simulation-only and not permitted on NEPSE."
_SHORT_TYPES = (TransactionType.SHORT_SELL, TransactionType.BUY_TO_COVER)
_SETTLEMENT_GATED_SELL = (TransactionType.SELL,)
_SETTLEMENT_GATED_BUY = (TransactionType.BUY, TransactionType.RIGHTS)


# ---------------------------------------------------------------------------
# Settlement helpers
# ---------------------------------------------------------------------------

def _is_paper(account):
    return account is not None and account.account_type == AccountType.PAPER


def _settlement_for(account, today):
    return SettlementService.next_settlement_date(today) if _is_paper(account) else None


def _enforce_settlement(user, ticker, txn_type, quantity, amount, account, today):
    """Raise ValueError if a PAPER trade would use unsettled shares or cash."""
    if not _is_paper(account):
        return
    if txn_type in _SETTLEMENT_GATED_SELL:
        settled = SettlementService.settled_quantity(user, account, ticker, today)
        if quantity > settled:
            settle_on = SettlementService.next_settlement_date(today)
            raise ValueError(
                f"Cannot sell unsettled shares — only {settled} settled; "
                f"recent buys settle ~{settle_on} (T+2).")
    elif txn_type in _SETTLEMENT_GATED_BUY:
        unsettled = SettlementService.unsettled_sale_proceeds(user, account, today)
        available = Decimal(account.balance) - unsettled
        if Decimal(amount) > available:
            raise ValueError(
                f"Insufficient settled balance — Rs {unsettled:,.2f} of proceeds is "
                f"unsettled until T+2.")


# ---------------------------------------------------------------------------
# recalculate_item helpers
# ---------------------------------------------------------------------------

def _apply_txn_to_position(qty, wacc, txn):
    """Apply one transaction to (qty, wacc) and return the updated pair."""
    if txn.transaction_type in [TransactionType.BUY, TransactionType.RIGHTS]:
        cost = Decimal(txn.quantity * txn.rate) + Decimal(
            txn.commission + txn.sebon_fee + txn.dp_charge
        )
        old_val = Decimal(qty) * wacc
        qty += txn.quantity
        if qty > 0:
            wacc = (old_val + cost) / Decimal(qty)
    elif txn.transaction_type == TransactionType.BONUS:
        old_val = Decimal(qty) * wacc
        qty += txn.quantity
        if qty > 0:
            wacc = old_val / Decimal(qty)
    elif txn.transaction_type == TransactionType.SELL:
        qty -= txn.quantity
    elif txn.transaction_type == TransactionType.SHORT_SELL:
        old_short_qty = abs(qty) if qty < 0 else 0
        old_total = Decimal(old_short_qty) * wacc
        qty -= txn.quantity
        new_short_qty = abs(qty) if qty < 0 else 0
        if new_short_qty > 0:
            wacc = (old_total + Decimal(txn.quantity * txn.rate)) / Decimal(new_short_qty)
    elif txn.transaction_type == TransactionType.BUY_TO_COVER:
        qty += txn.quantity
    return qty, wacc


def _compute_wacc_from_transactions(txns):
    """Walk all transactions and return final (qty, wacc)."""
    qty = 0
    wacc = Decimal('0.00')
    for txn in txns:
        qty, wacc = _apply_txn_to_position(qty, wacc, txn)
    return qty, wacc


def _upsert_portfolio_item(user, account, ticker, qty, wacc):
    """Persist the computed position; creates or updates the PortfolioItem row."""
    item, created = PortfolioItem.objects.get_or_create(
        user=user, account=account, ticker=ticker,
        defaults={'quantity': qty, 'wacc': wacc, 'buy_price': wacc}
    )
    if not created:
        item.quantity = qty
        item.wacc = wacc
        item.buy_price = wacc
        item.save()
    return item


# ---------------------------------------------------------------------------
# process_transaction helpers
# ---------------------------------------------------------------------------

def _resolve_fees(quantity, rate, commission, sebon_fee, dp_charge):
    """Return (amount, commission, sebon_fee, dp_charge) with defaults filled in."""
    amount = Decimal(quantity) * Decimal(rate)
    commission = Decimal(commission) if commission else calculate_broker_commission(amount)
    sebon_fee = Decimal(sebon_fee) if sebon_fee else calculate_sebon_fee(amount)
    dp_charge = Decimal(dp_charge) if dp_charge else calculate_dp_charge()
    return amount, commission, sebon_fee, dp_charge


def _process_buy(quantity, amount, commission, sebon_fee, dp_charge, account, portfolio_item):
    """Handle BUY; returns total_cost_addition as receivable_amount."""
    total_cost_addition = amount + commission + sebon_fee + dp_charge
    if account and account.account_type == AccountType.PAPER:
        if account.balance < total_cost_addition:
            raise ValueError(
                f"Insufficient paper balance. Needed: Rs {total_cost_addition:,.2f}, "
                f"Available: Rs {account.balance:,.2f}"
            )
        account.balance -= total_cost_addition
        account.save()
    old_total_cost = Decimal(portfolio_item.quantity) * Decimal(portfolio_item.wacc)
    new_quantity = portfolio_item.quantity + quantity
    new_wacc = (old_total_cost + total_cost_addition) / Decimal(new_quantity)
    portfolio_item.quantity = new_quantity
    portfolio_item.wacc = new_wacc
    portfolio_item.buy_price = new_wacc
    portfolio_item.save()
    return total_cost_addition


def _compute_sell_cgt(user, ticker, account, quantity, rate, wacc):
    """Return (total_profit, cgt) for a SELL, accounting for holding period."""
    from stocks.services.finance import weighted_acquisition_date, is_long_term_holding
    total_profit = (Decimal(rate) - Decimal(wacc)) * Decimal(quantity)
    prior_qs = PortfolioTransaction.objects.filter(
        user=user, ticker=ticker,
        transaction_type__in=[TransactionType.BUY, TransactionType.BONUS, TransactionType.RIGHTS],
    )
    if account:
        prior_qs = prior_qs.filter(account=account)
    lots = [(t.quantity, t.transaction_date.date()) for t in prior_qs if t.quantity]
    long_term = is_long_term_holding(weighted_acquisition_date(lots), timezone.now().date())
    cgt = calculate_cgt(total_profit, is_long_term=long_term) if total_profit > 0 else Decimal('0.00')
    return total_profit, cgt


def _process_sell(user, ticker, quantity, rate, amount, commission, sebon_fee, dp_charge,
                  account, portfolio_item):
    """Handle SELL; returns (receivable_amount, cgt)."""
    if portfolio_item.quantity < quantity:
        raise ValueError("Insufficient quantity to sell.")
    _total_profit, cgt = _compute_sell_cgt(user, ticker, account, quantity, rate, portfolio_item.wacc)
    receivable_amount = amount - commission - sebon_fee - dp_charge - cgt
    if account and account.account_type == AccountType.PAPER:
        account.balance += receivable_amount
        account.save()
    portfolio_item.quantity -= quantity
    if portfolio_item.quantity == 0:
        portfolio_item.delete()
    else:
        portfolio_item.save()
    return receivable_amount, cgt


def _process_short_sell(quantity, amount, commission, sebon_fee, dp_charge, account, portfolio_item):
    """Handle SHORT_SELL; returns receivable_amount."""
    if account and account.account_type != AccountType.PAPER:
        raise ValueError("Short selling is only allowed in paper trading accounts.")
    receivable_amount = amount - commission - sebon_fee - dp_charge
    if account:
        account.balance += receivable_amount
        account.save()
    old_qty = abs(portfolio_item.quantity) if portfolio_item.quantity < 0 else 0
    old_total = Decimal(old_qty) * Decimal(portfolio_item.wacc)
    new_quantity = portfolio_item.quantity - quantity
    if portfolio_item.quantity <= 0:
        new_wacc = (old_total + amount) / Decimal(old_qty + quantity)
        portfolio_item.wacc = new_wacc
        portfolio_item.buy_price = new_wacc
    portfolio_item.quantity = new_quantity
    portfolio_item.save()
    return receivable_amount


def _process_buy_to_cover(quantity, amount, commission, sebon_fee, dp_charge, account, portfolio_item):
    """Handle BUY_TO_COVER; returns total_cost as receivable_amount."""
    if account and account.account_type != AccountType.PAPER:
        raise ValueError("Buy to cover is only allowed in paper trading accounts.")
    if portfolio_item.quantity >= 0:
        raise ValueError("No short position to cover.")
    if abs(portfolio_item.quantity) < quantity:
        raise ValueError("Cannot cover more than the short position size.")
    total_cost = amount + commission + sebon_fee + dp_charge
    if account:
        if account.balance < total_cost:
            raise ValueError(f"Insufficient paper balance to cover. Needed: Rs {total_cost:,.2f}")
        account.balance -= total_cost
        account.save()
    portfolio_item.quantity += quantity
    if portfolio_item.quantity == 0:
        portfolio_item.delete()
    else:
        portfolio_item.save()
    return total_cost


def _process_bonus(quantity, portfolio_item):
    """Handle BONUS; returns Decimal('0.00') as receivable_amount."""
    old_total_cost = Decimal(portfolio_item.quantity) * Decimal(portfolio_item.wacc)
    new_quantity = portfolio_item.quantity + quantity
    new_wacc = old_total_cost / Decimal(new_quantity)
    portfolio_item.quantity = new_quantity
    portfolio_item.wacc = new_wacc
    portfolio_item.buy_price = new_wacc
    portfolio_item.save()
    return Decimal('0.00')


def _process_rights(quantity, amount, commission, sebon_fee, dp_charge, account, portfolio_item):
    """Handle RIGHTS subscription; returns total_cost_addition as receivable_amount."""
    total_cost_addition = amount + commission + sebon_fee + dp_charge
    if account and account.account_type == AccountType.PAPER:
        if account.balance < total_cost_addition:
            raise ValueError(
                f"Insufficient paper balance for rights subscription. "
                f"Needed: Rs {total_cost_addition:,.2f}, Available: Rs {account.balance:,.2f}"
            )
        account.balance -= total_cost_addition
        account.save()
    old_total_cost = Decimal(portfolio_item.quantity) * Decimal(portfolio_item.wacc)
    new_quantity = portfolio_item.quantity + quantity
    new_wacc = (old_total_cost + total_cost_addition) / Decimal(new_quantity)
    portfolio_item.quantity = new_quantity
    portfolio_item.wacc = new_wacc
    portfolio_item.buy_price = new_wacc
    portfolio_item.save()
    return total_cost_addition


def _dispatch_txn_type(txn_type, user, ticker, quantity, rate, amount,
                       commission, sebon_fee, dp_charge, account, portfolio_item):
    """Route to the correct transaction handler; returns (receivable_amount, cgt)."""
    cgt = Decimal('0.00')
    if txn_type == TransactionType.BUY:
        receivable_amount = _process_buy(
            quantity, amount, commission, sebon_fee, dp_charge, account, portfolio_item
        )
    elif txn_type == TransactionType.SELL:
        receivable_amount, cgt = _process_sell(
            user, ticker, quantity, rate, amount, commission, sebon_fee, dp_charge,
            account, portfolio_item
        )
    elif txn_type == TransactionType.SHORT_SELL:
        receivable_amount = _process_short_sell(
            quantity, amount, commission, sebon_fee, dp_charge, account, portfolio_item
        )
    elif txn_type == TransactionType.BUY_TO_COVER:
        receivable_amount = _process_buy_to_cover(
            quantity, amount, commission, sebon_fee, dp_charge, account, portfolio_item
        )
    elif txn_type == TransactionType.BONUS:
        receivable_amount = _process_bonus(quantity, portfolio_item)
    elif txn_type == TransactionType.RIGHTS:
        receivable_amount = _process_rights(
            quantity, amount, commission, sebon_fee, dp_charge, account, portfolio_item
        )
    else:
        receivable_amount = amount
    return receivable_amount, cgt


# ---------------------------------------------------------------------------
# get_portfolio_metrics helpers
# ---------------------------------------------------------------------------

def _fetch_price_data(tickers):
    """Return (latest_prices, prev_closes, dates) dicts for the given tickers."""
    latest_prices = {}
    prev_closes = {}
    dates = DailyStockPrice.objects.order_by('-date').values_list('date', flat=True).distinct()[:2]
    if len(dates) >= 1:
        latest_date = dates[0]
        latest_prices = {p.ticker: p.close for p in
                         DailyStockPrice.objects.filter(date=latest_date, ticker__in=tickers)}
        if len(dates) >= 2:
            prev_closes = {p.ticker: p.close for p in
                           DailyStockPrice.objects.filter(date=dates[1], ticker__in=tickers)}
    return latest_prices, prev_closes, dates


def _compute_volatilities(tickers, dates):
    """Return annualised volatility (%) per ticker over the last 60 trading days."""
    volatilities = {}
    try:
        cutoff_date = (dates[0] if dates else timezone.now()) - timedelta(days=60)
        hist_qs = DailyStockPrice.objects.filter(
            ticker__in=tickers, date__gte=cutoff_date
        ).values('ticker', 'date', 'close').order_by('date')
        df_hist = pd.DataFrame.from_records(hist_qs)
        if not df_hist.empty:
            df_hist['close'] = df_hist['close'].astype(float)
            for ticker in tickers:
                df_t = df_hist[df_hist['ticker'] == ticker]
                if len(df_t) > 10:
                    returns = df_t['close'].pct_change().dropna()
                    if not returns.empty:
                        volatilities[ticker] = returns.std() * (252 ** 0.5) * 100
    except Exception as e:
        print(f"Volatility Calc Error: {e}")
    return volatilities


def _annotate_item_metrics(item, current_price, prev_close, sector, volatility,
                           signals, health_score, fund_metrics):
    """Attach computed metrics to a PortfolioItem instance in-place."""
    item.current_price = current_price
    is_short = item.quantity < 0
    abs_qty = abs(item.quantity)
    if is_short:
        item.investment_value = Decimal(abs_qty) * Decimal(item.buy_price)
        item.current_value = Decimal(abs_qty) * current_price
        item.gain_loss = item.investment_value - item.current_value
    else:
        item.investment_value = Decimal(item.quantity) * Decimal(item.buy_price)
        item.current_value = Decimal(item.quantity) * current_price
        item.gain_loss = item.current_value - item.investment_value
    item.gain_loss_percent = (item.gain_loss / item.investment_value * 100) if item.investment_value else 0
    item.day_gain_loss = (current_price - prev_close) * Decimal(item.quantity)
    item.sector = sector
    item.volatility = volatility
    item.signals = signals
    item.health_score = health_score
    item.fundamental_metrics = fund_metrics


# ---------------------------------------------------------------------------
# _get_signals_map helpers
# ---------------------------------------------------------------------------

def _fetch_latest_signal_dates(tickers):
    """Return {symbol: max_start_date} for the given tickers."""
    rows = SignalEpisode.objects.filter(
        symbol__in=tickers
    ).values('symbol').annotate(max_date=Max('start_date'))
    return {row['symbol']: row['max_date'] for row in rows}


def _build_signal_entry(ticker, latest_date):
    """Fetch episodes on latest_date for ticker and return a signals_map entry dict."""
    episodes = SignalEpisode.objects.filter(
        symbol=ticker, start_date=latest_date
    ).select_related('strategy')
    signal_list = [
        {
            'signal': ep.direction,
            'strategy_name': ep.strategy.name if ep.strategy else ep.source,
            'strategy_description': ep.strategy.description if ep.strategy else '',
        }
        for ep in episodes
    ]
    buy_count = sum(1 for s in signal_list if 'BUY' in s['signal'])
    sell_count = sum(1 for s in signal_list if 'SELL' in s['signal'])
    summary = 'NEUTRAL'
    if buy_count > sell_count:
        summary = 'BUY'
    elif sell_count > buy_count:
        summary = 'SELL'
    elif buy_count > 0 and buy_count == sell_count:
        summary = 'MIXED'
    return {'latest_date': latest_date, 'summary': summary, 'details': signal_list}


# ---------------------------------------------------------------------------
# Public service class
# ---------------------------------------------------------------------------

class PortfolioService:
    @staticmethod
    def recalculate_item(user, account, ticker):
        """Recalculates a single PortfolioItem based on its transaction history."""
        txns = PortfolioTransaction.objects.filter(
            user=user, account=account, ticker=ticker
        ).order_by('transaction_date', 'created_at')

        if not txns.exists():
            PortfolioItem.objects.filter(user=user, account=account, ticker=ticker).delete()
            return None

        qty, wacc = _compute_wacc_from_transactions(txns)

        if qty == 0:
            PortfolioItem.objects.filter(user=user, account=account, ticker=ticker).delete()
            return None

        return _upsert_portfolio_item(user, account, ticker, qty, wacc)

    @staticmethod
    @transaction.atomic
    def process_transaction(user, ticker, txn_type, quantity, rate, account=None,
                            commission=None, sebon_fee=None, dp_charge=None):
        """Processes a new transaction and updates the PortfolioItem."""
        amount, commission, sebon_fee, dp_charge = _resolve_fees(
            quantity, rate, commission, sebon_fee, dp_charge
        )
        today = timezone.now().date()
        _enforce_settlement(user, ticker, txn_type, quantity, amount, account, today)
        portfolio_item, _created = PortfolioItem.objects.get_or_create(
            user=user, ticker=ticker, account=account,
            defaults={'quantity': 0, 'buy_price': 0, 'wacc': 0}
        )
        receivable_amount, cgt = _dispatch_txn_type(
            txn_type, user, ticker, quantity, rate, amount,
            commission, sebon_fee, dp_charge, account, portfolio_item
        )
        warnings = [SHORT_SELL_WARNING] if txn_type in _SHORT_TYPES else []
        return {
            'amount': amount,
            'commission': commission,
            'sebon_fee': sebon_fee,
            'dp_charge': dp_charge,
            'cgt': cgt,
            'receivable_amount': receivable_amount,
            'settlement_date': _settlement_for(account, today),
            'warnings': warnings,
        }

    @staticmethod
    def get_portfolio_metrics(queryset):
        """Calculates dynamic metrics for a list of PortfolioItems."""
        tickers = [item.ticker for item in queryset]
        if not tickers:
            return []

        latest_prices, prev_closes, dates = _fetch_price_data(tickers)
        company_sectors = {
            c['symbol']: c['sector']
            for c in Company.objects.filter(symbol__in=tickers).values('symbol', 'sector')
        }
        volatilities = _compute_volatilities(tickers, dates)
        signals_map = PortfolioService._get_signals_map(tickers)
        fundamental_map = {f.ticker: f for f in StockFundamental.objects.filter(ticker__in=tickers)}

        results = []
        for item in queryset:
            current_price = Decimal(latest_prices.get(item.ticker, item.buy_price))
            prev_close = Decimal(prev_closes.get(item.ticker, current_price))
            fund_obj = fundamental_map.get(item.ticker)
            health_score, fund_metrics = FundamentalService.calculate_health_score(fund_obj)
            _annotate_item_metrics(
                item, current_price, prev_close,
                company_sectors.get(item.ticker, 'Unknown'),
                volatilities.get(item.ticker, 0.0),
                signals_map.get(item.ticker),
                health_score, fund_metrics,
            )
            results.append(item)
        return results

    @staticmethod
    def _get_signals_map(tickers):
        """Helper to get latest strategy signals for tickers."""
        if not tickers:
            return {}
        latest_date_map = _fetch_latest_signal_dates(tickers)
        signals_map = {}
        for ticker, latest_date in latest_date_map.items():
            if not latest_date:
                continue
            signals_map[ticker] = _build_signal_entry(ticker, latest_date)
        return signals_map
