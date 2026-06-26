"""Orchestrate return-series + pure metrics into a market-risk block with alerts."""
import math

import numpy as np

from stocks.services.risk import returns_metrics as rm
from stocks.services.risk.return_series import build, INDEX_COLUMN, confidence_for

_BETA_ALERT_MEDIUM = 1.3
_BETA_ALERT_HIGH = 1.6
_CORRELATION_ALERT = 0.8
_DRAWDOWN_ALERT = -0.30
_WEEK_SCALE = math.sqrt(5)
_CONFIDENCE_RANK = {"full": 0, "low": 1, "none": 2}    # higher rank = worse confidence


class MarketRiskService:
    @staticmethod
    def compute(holdings, window=180):
        series = build([h["ticker"] for h in holdings], window=window)
        per_holding = _per_holding_betas(holdings, series)
        portfolio_beta, beta_conf = _portfolio_beta(per_holding, holdings)
        port_returns = _portfolio_returns(holdings, series)
        var = _value_at_risk(port_returns, series)
        drawdown = rm.max_drawdown(port_returns) if port_returns.size else None
        correlation = _correlation(holdings, series)
        block = {
            "window": window, "portfolio_beta": portfolio_beta, "beta_confidence": beta_conf,
            "value_at_risk": var, "max_drawdown": drawdown, "correlation": correlation,
            "per_holding": per_holding,
        }
        alerts = _build_alerts(portfolio_beta, correlation, drawdown)
        return {"market_risk": block, "alerts": alerts}


def _per_holding_betas(holdings, series):
    out = []
    for h in holdings:
        ticker = h["ticker"]
        beta, conf = _single_beta(ticker, series)
        out.append({"ticker": ticker, "beta": beta, "confidence": conf})
    return out


def _single_beta(ticker, series):
    if ticker not in series.returns or INDEX_COLUMN not in series.returns:
        return None, "none"
    pair = series.returns[[ticker, INDEX_COLUMN]].dropna()
    conf = confidence_for(series.sample_counts.get(ticker, 0))
    if conf == "none":
        return None, conf
    return rm.beta(pair[ticker].to_numpy(), pair[INDEX_COLUMN].to_numpy()), conf


def _portfolio_beta(per_holding, holdings):
    weights = {h["ticker"]: h.get("weight", 0) / 100 for h in holdings}
    usable = [p for p in per_holding if p["beta"] is not None]
    if not usable:
        return None, "none"
    total = sum(p["beta"] * weights.get(p["ticker"], 0) for p in usable)
    worst = max(usable, key=lambda p: _CONFIDENCE_RANK.get(p["confidence"], 2))["confidence"]
    return round(total, 3), worst


def _portfolio_returns(holdings, series):
    if series.returns.empty:
        return np.array([])
    weighted = np.zeros(len(series.returns))
    for h in holdings:
        if h["ticker"] in series.returns:
            col = series.returns[h["ticker"]].fillna(0).to_numpy()
            weighted = weighted + col * (h.get("weight", 0) / 100)
    return weighted


def _value_at_risk(port_returns, series):
    if port_returns.size < 2:
        return {"var_95_1d": None, "var_99_1d": None, "var_95_1w": None}
    full = min(series.sample_counts.values(), default=0) >= 60
    estimator = rm.historical_var if full else rm.parametric_var
    var95 = estimator(port_returns, 0.95)
    var99 = estimator(port_returns, 0.99)
    week = round(var95 * _WEEK_SCALE, 4) if var95 is not None else None
    return {"var_95_1d": _r(var95), "var_99_1d": _r(var99), "var_95_1w": week}


def _correlation(holdings, series):
    tickers = [h["ticker"] for h in holdings if h["ticker"] in series.returns]
    if len(tickers) < 2:
        return rm.correlation_matrix(
            {t: series.returns[t].dropna().to_numpy() for t in tickers}
        )
    aligned = series.returns[tickers].dropna()        # rows where ALL holdings traded — date-aligned
    return rm.correlation_matrix({t: aligned[t].to_numpy() for t in tickers})


def _build_alerts(portfolio_beta, correlation, drawdown):
    alerts = []
    _append_beta_alert(alerts, portfolio_beta)
    _append_correlation_alert(alerts, correlation)
    _append_drawdown_alert(alerts, drawdown)
    return alerts


def _append_beta_alert(alerts, beta):
    if beta is None or beta <= _BETA_ALERT_MEDIUM:
        return
    level = "HIGH" if beta > _BETA_ALERT_HIGH else "MEDIUM"
    alerts.append({"type": "MARKET_BETA", "level": level,
                   "message": f"High market sensitivity: portfolio beta is {beta}."})


def _append_correlation_alert(alerts, correlation):
    tickers, matrix = correlation["tickers"], correlation["matrix"]
    for i in range(len(tickers)):
        for j in range(i + 1, len(tickers)):
            if matrix[i][j] > _CORRELATION_ALERT:
                alerts.append({"type": "CORRELATION", "level": "MEDIUM",
                               "message": f"Hidden concentration: {tickers[i]} and {tickers[j]} "
                                          f"move together (correlation {matrix[i][j]})."})


def _append_drawdown_alert(alerts, drawdown):
    if drawdown is not None and drawdown < _DRAWDOWN_ALERT:
        pct = round(abs(drawdown) * 100, 1)
        alerts.append({"type": "DRAWDOWN", "level": "MEDIUM",
                       "message": f"Portfolio fell {pct}% peak-to-trough in this window."})


def _r(value):
    return round(value, 4) if value is not None else None
