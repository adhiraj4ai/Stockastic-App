"""Recalculates every derived StockFundamental metric from FinancialReports.

Single source of truth for fundamental math — used by the refresh_fundamentals
API action, the FinancialReport post_save signal, the daily celery task and the
recalculate_fundamentals management command.

Conventions (NEPSE):
- Face value is Rs 100, so share count = share capital / 100 and a cash
  dividend of X% equals Rs X per share.
- Quarterly `eps` as published is annualized, so QoQ growth compares
  consecutive quarters' annualized EPS rather than cumulative net profit.
"""
import logging
import math
from decimal import Decimal, ROUND_HALF_UP

from ..constants import ANNUAL_REPORTS_FETCH_COUNT, GRAHAM_NUMBER_MULTIPLIER
from ..models.fundamentals import Dividend, FinancialReport, StockFundamental
from ..models.market import Company, DailyIndexValue, DailyStockPrice
from ..utils import normalize_fiscal_year

logger = logging.getLogger(__name__)

__all__ = ['normalize_fiscal_year', 'recalculate_fundamentals']

NEPSE_INDEX_NAME = 'NEPSE Index'
# Beta windows in trading sessions; computed only with at least half the window
BETA_WINDOWS = {'beta_3m': 63, 'beta_1y': 252, 'beta_3y': 756}


def _round2(value):
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _flatten(report_json):
    """Flatten {'SECTION': {'Particular Name': value}} into
    {'particular_name': value} so both snake_case seeds and display-name
    seeds resolve to the same keys."""
    flat = {}
    for parts in (report_json or {}).values():
        if not isinstance(parts, dict):
            continue
        for label, value in parts.items():
            if isinstance(value, (int, float)) or isinstance(value, Decimal):
                flat[str(label).strip().lower().replace(' ', '_')] = float(value)
    return flat


def _growth(current, previous):
    if current is None or not previous:
        return None
    return _round2((float(current) - float(previous)) / abs(float(previous)) * 100)


def _num(report, field, flat, *keys):
    """Read a value preferring the model field, falling back to flattened JSON keys."""
    model_val = getattr(report, field, None)
    if model_val is not None:
        return float(model_val)
    for key in keys:
        if flat.get(key) is not None:
            return flat[key]
    return None


def _report_eps(report):
    """Effective EPS of one report: company-reported if present, else derived."""
    if report.eps is not None:
        return float(report.eps)
    pl = _flatten(report.profit_loss)
    bs = _flatten(report.balance_sheet)
    net_profit = _num(report, 'net_profit', pl, 'net_profit', 'profit/_loss_for_the_period', 'profit_for_the_period')
    capital = _num(report, 'paid_up_capital', bs, 'share_capital', 'paid_up_capital')
    if net_profit is None or not capital:
        return None
    return net_profit / (capital / 100)


def _trend(current, previous):
    if current is None or previous is None:
        return None
    if float(current) > float(previous):
        return 'Positive'
    if float(current) < float(previous):
        return 'Negative'
    return 'Flat'


def _compute_betas(ticker):
    """Beta of the stock's daily returns vs the NEPSE index over each window.

    Returns {'beta_3m': Decimal|None, ...}. Series are aligned on common
    trading dates; a window is computed only when at least half its sessions
    of aligned returns exist.
    """
    betas = {key: None for key in BETA_WINDOWS}
    max_window = max(BETA_WINDOWS.values())

    index_rows = list(
        DailyIndexValue.objects.filter(index_name=NEPSE_INDEX_NAME)
        .order_by('-date')
        .values_list('date', 'value')[:max_window + 1]
    )
    if not index_rows:
        return betas
    stock_rows = list(
        DailyStockPrice.objects.filter(ticker=ticker, close__isnull=False)
        .order_by('-date')
        .values_list('date', 'close')[:max_window + 1]
    )

    index_by_date = {d: float(v) for d, v in index_rows}
    stock_by_date = {d: float(v) for d, v in stock_rows}
    common_dates = sorted(set(index_by_date) & set(stock_by_date))
    if len(common_dates) < 2:
        return betas

    stock_returns, index_returns = [], []
    for prev_d, cur_d in zip(common_dates, common_dates[1:]):
        if stock_by_date[prev_d] and index_by_date[prev_d]:
            stock_returns.append(stock_by_date[cur_d] / stock_by_date[prev_d] - 1)
            index_returns.append(index_by_date[cur_d] / index_by_date[prev_d] - 1)

    for key, window in BETA_WINDOWS.items():
        if len(stock_returns) < window // 2:
            continue
        rs = stock_returns[-window:]
        ri = index_returns[-window:]
        mean_s = sum(rs) / len(rs)
        mean_i = sum(ri) / len(ri)
        var_i = sum((r - mean_i) ** 2 for r in ri) / len(ri)
        if var_i == 0:
            continue
        cov = sum((a - mean_s) * (b - mean_i) for a, b in zip(rs, ri)) / len(rs)
        betas[key] = _round2(cov / var_i)
    return betas


def recalculate_fundamentals(ticker):
    """Recompute all derived metrics for one ticker. Returns the saved
    StockFundamental, or None when the ticker has no annual reports."""
    annuals = list(
        FinancialReport.objects.filter(ticker=ticker, report_type=FinancialReport.ReportType.ANNUAL)
        .order_by('-fiscal_year')[:ANNUAL_REPORTS_FETCH_COUNT]
    )
    if not annuals:
        return None
    latest, previous = annuals[0], annuals[1] if len(annuals) > 1 else None

    latest_price = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
    price = float(latest_price.close) if latest_price and latest_price.close else None

    fundamental = StockFundamental.objects.filter(ticker=ticker).first()
    if fundamental is None:
        company = Company.objects.filter(symbol=ticker).first()
        fundamental = StockFundamental.objects.create(
            ticker=ticker,
            company_name=company.name if company else ticker,
            sector=(company.sector if company else None) or 'Unknown',
        )

    bs = _flatten(latest.balance_sheet)
    pl = _flatten(latest.profit_loss)

    share_capital = _num(latest, 'paid_up_capital', bs, 'share_capital', 'paid_up_capital')
    reserves = _num(latest, 'reserves_and_surplus', bs, 'reserves', 'reserves_and_surplus', 'reserve_and_surplus')
    total_equity = bs.get('total_equity')
    if total_equity is None and share_capital and reserves:
        total_equity = share_capital + reserves
    total_assets = bs.get('total_assets')
    total_liabilities = bs.get('total_liabilities')
    net_profit = _num(latest, 'net_profit', pl, 'net_profit', 'profit/_loss_for_the_period', 'profit_for_the_period')
    revenue = _num(latest, 'revenue', pl, 'total_operating_income', 'revenue', 'net_interest_income')

    num_shares = share_capital / 100 if share_capital else None

    # Audited per-share metrics: prefer company-reported values, derive otherwise
    eps = float(latest.eps) if latest.eps is not None else (
        net_profit / num_shares if net_profit is not None and num_shares else None
    )
    book_value = float(latest.book_value) if latest.book_value is not None else (
        total_equity / num_shares if total_equity and num_shares else None
    )

    fundamental.eps = _round2(eps) if eps is not None else None
    fundamental.book_value = _round2(book_value) if book_value is not None else None

    if latest.return_on_equity is not None:
        fundamental.ro_equity = _round2(latest.return_on_equity)
    elif net_profit is not None and total_equity:
        fundamental.ro_equity = _round2(net_profit / total_equity * 100)
    else:
        fundamental.ro_equity = None

    fundamental.ro_assets = _round2(net_profit / total_assets * 100) if net_profit is not None and total_assets else None
    fundamental.pe_ratio = _round2(price / eps) if price and eps and eps > 0 else None
    fundamental.price_to_book = _round2(price / book_value) if price and book_value and book_value > 0 else None
    fundamental.debt_to_equity = _round2(total_liabilities / total_equity) if total_liabilities and total_equity else None

    if num_shares:
        fundamental.shares_outstanding = _round2(num_shares)
        fundamental.paid_up_capital = _round2(share_capital)
    if price and num_shares:
        market_cap = price * num_shares
        fundamental.market_cap = _round2(market_cap)
        fundamental.price_to_sales = _round2(market_cap / revenue) if revenue else None

    # Unaudited metrics from the latest quarterly (published EPS is annualized)
    quarterlies = list(
        FinancialReport.objects.filter(ticker=ticker, report_type=FinancialReport.ReportType.QUARTERLY)
        .order_by('-fiscal_year', '-quarter')[:2]
    )
    if quarterlies:
        latest_q = quarterlies[0]
        fundamental.eps_unaudited = latest_q.eps
        fundamental.book_value_unaudited = latest_q.book_value
        fundamental.pe_ratio_unaudited = (
            _round2(price / float(latest_q.eps)) if price and latest_q.eps and latest_q.eps > 0 else None
        )
    else:
        fundamental.eps_unaudited = fundamental.eps
        fundamental.book_value_unaudited = fundamental.book_value
        fundamental.pe_ratio_unaudited = fundamental.pe_ratio

    # Growth
    prev_eps, prev_roe = None, None
    if previous is not None:
        prev_eps = _report_eps(previous)
        prev_bs = _flatten(previous.balance_sheet)
        prev_pl = _flatten(previous.profit_loss)
        prev_net_profit = _num(previous, 'net_profit', prev_pl, 'net_profit', 'profit/_loss_for_the_period', 'profit_for_the_period')
        prev_capital = _num(previous, 'paid_up_capital', prev_bs, 'share_capital', 'paid_up_capital')
        prev_reserves = _num(previous, 'reserves_and_surplus', prev_bs, 'reserves', 'reserves_and_surplus', 'reserve_and_surplus')
        prev_equity = prev_bs.get('total_equity')
        if prev_equity is None and prev_capital and prev_reserves:
            prev_equity = prev_capital + prev_reserves
        if previous.return_on_equity is not None:
            prev_roe = float(previous.return_on_equity)
        elif prev_net_profit is not None and prev_equity:
            prev_roe = prev_net_profit / prev_equity * 100
    fundamental.yoy_earnings_growth = _growth(eps, prev_eps)
    fundamental.qoq_earnings_growth = (
        _growth(quarterlies[0].eps, quarterlies[1].eps)
        if len(quarterlies) > 1 and quarterlies[0].eps is not None and quarterlies[1].eps
        else None
    )

    yoy = fundamental.yoy_earnings_growth
    fundamental.peg_ratio = (
        _round2(float(fundamental.pe_ratio) / float(yoy)) if fundamental.pe_ratio and yoy and yoy > 0 else None
    )

    # Dividends: cash X% of face value 100 = Rs X per share. Newer seeds put
    # dividends on FinancialReport; legacy tickers only have Dividend rows.
    cash = bonus = None
    latest_div_report = (
        FinancialReport.objects.filter(ticker=ticker, cash_dividend__isnull=False)
        .order_by('-fiscal_year', '-quarter')
        .first()
    )
    if latest_div_report:
        cash = float(latest_div_report.cash_dividend or 0)
        bonus = float(latest_div_report.bonus_share or 0)
    else:
        div_rows = list(Dividend.objects.filter(ticker=ticker))
        if div_rows:
            # fiscal_year formats are mixed in this table; normalize for ordering
            latest_div = max(div_rows, key=lambda d: normalize_fiscal_year(d.fiscal_year) or '')
            cash = float(latest_div.cash_percent or 0)
            bonus = float(latest_div.bonus_percent or 0)

    if cash is not None and price:
        fundamental.dividend_yield = _round2(cash / price * 100)
        total_dps = cash + bonus
        fundamental.dividend_payout_ratio = _round2(total_dps / eps * 100) if eps and eps > 0 else None
    else:
        fundamental.dividend_yield = None
        fundamental.dividend_payout_ratio = None

    # Graham number: price premium/discount vs sqrt(22.5 * EPS * BV), in %
    if price and eps and eps > 0 and book_value and book_value > 0:
        graham = math.sqrt(GRAHAM_NUMBER_MULTIPLIER * eps * book_value)
        fundamental.graham_number_diff = _round2((price - graham) / graham * 100)
    else:
        fundamental.graham_number_diff = None

    # Earning yield (E/P) and normalized 5-year P/E (price over avg EPS of
    # the last up-to-5 annual reports, Graham-style)
    fundamental.earning_yield = _round2(eps / price * 100) if price and eps is not None else None
    eps_history = [e for e in (_report_eps(r) for r in annuals) if e is not None]
    avg_eps = sum(eps_history) / len(eps_history) if eps_history else None
    fundamental.pe_ratio_5yr = _round2(price / avg_eps) if price and avg_eps and avg_eps > 0 else None

    # Margins and efficiency (annual)
    operating_profit = _num(latest, 'operating_profit', pl, 'operating_profit')
    fundamental.operating_margin = (
        _round2(operating_profit / revenue * 100) if operating_profit is not None and revenue else None
    )
    fundamental.net_margin = _round2(net_profit / revenue * 100) if net_profit is not None and revenue else None
    fundamental.asset_turnover = _round2(revenue / total_assets * 100) if revenue and total_assets else None

    if quarterlies:
        q = quarterlies[0]
        q_pl = _flatten(q.profit_loss)
        q_net_profit = _num(q, 'net_profit', q_pl, 'net_profit')
        q_revenue = _num(q, 'revenue', q_pl, 'total_operating_income', 'revenue')
        fundamental.net_margin_quarterly = (
            _round2(q_net_profit / q_revenue * 100) if q_net_profit is not None and q_revenue else None
        )
    else:
        fundamental.net_margin_quarterly = None

    # Trends vs previous annual
    fundamental.eps_trend = _trend(eps, prev_eps)
    current_roe = float(fundamental.ro_equity) if fundamental.ro_equity is not None else None
    fundamental.roe_trend = _trend(current_roe, prev_roe)

    # Betas vs NEPSE index
    betas = _compute_betas(ticker)
    fundamental.beta_3m = betas['beta_3m']
    fundamental.beta_1y = betas['beta_1y']
    fundamental.beta_3y = betas['beta_3y']

    fundamental.save()
    return fundamental


def recalculate_all_fundamentals():
    """Recalculate every ticker that has at least one annual report."""
    tickers = (
        FinancialReport.objects.filter(report_type=FinancialReport.ReportType.ANNUAL)
        .values_list('ticker', flat=True)
        .distinct()
    )
    updated = 0
    for ticker in tickers:
        try:
            if recalculate_fundamentals(ticker):
                updated += 1
        except Exception:
            logger.exception("Failed to recalculate fundamentals for %s", ticker)
    return updated
