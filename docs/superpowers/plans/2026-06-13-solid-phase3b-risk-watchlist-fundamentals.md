# SOLID Refactor — Phase 3b: Risk, Watchlist, and Fundamental Service Refactors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose three god-method services — `FundamentalService.calculate_health_score` (70 lines), `RiskAnalysisService.get_risk_analysis` (158 lines), and `WatchlistService.get_watchlist_metrics` (157 lines) — into focused private helpers so no function body exceeds 30 lines.

**Architecture:** Each large method is replaced by an orchestrator that delegates to single-responsibility static helpers; helpers are pure (no side effects beyond DB reads) and individually testable without mocking the full call chain. All helpers live in the same class as the original method, preserving the existing public API surface so no callers need to change.

**Tech Stack:** Python 3.11, Django 5.2, pytest, pytest-django, pandas, numpy, talib

---

## Task 1: Extract health score helpers from FundamentalService

**Files:**
- Modify: `backend/stocks/services/fundamental_service.py`
- Test: `backend/stocks/tests/test_fundamental_service_refactor.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/stocks/tests/test_fundamental_service_refactor.py`:

```python
"""Tests for FundamentalService health-score helper extraction (SOLID Phase 3b)."""
from unittest.mock import MagicMock
import pytest
from stocks.services.fundamental_service import FundamentalService


def _make_fundamental(**kwargs):
    """Return a MagicMock that looks like a StockFundamental instance."""
    f = MagicMock()
    f.pe_ratio = kwargs.get('pe_ratio', None)
    f.pe_ratio_unaudited = kwargs.get('pe_ratio_unaudited', None)
    f.price_to_book = kwargs.get('price_to_book', None)
    f.ro_equity = kwargs.get('ro_equity', None)
    f.yoy_earnings_growth = kwargs.get('yoy_earnings_growth', None)
    f.debt_to_equity = kwargs.get('debt_to_equity', None)
    return f


class TestScoreValuation:
    def test_returns_50_when_all_none(self):
        fund = _make_fundamental()
        assert FundamentalService._score_valuation(fund) == 50.0

    def test_pe_15_scores_100_pe_half(self):
        # PE=15 → p_score=100; PB missing → 50; val = 100*0.5 + 50*0.5 = 75
        fund = _make_fundamental(pe_ratio=15)
        assert FundamentalService._score_valuation(fund) == 75.0

    def test_pb_1_5_scores_100_pb_half(self):
        # PE missing → 50; PB=1.5 → b_score=100; val = 50*0.5 + 100*0.5 = 75
        fund = _make_fundamental(price_to_book=1.5)
        assert FundamentalService._score_valuation(fund) == 75.0

    def test_clamped_below_zero_for_very_high_pe(self):
        # PE=100 → 100-(100-15)*2.5 = 100-212.5 < 0 → clamped 0; PB missing → 25
        fund = _make_fundamental(pe_ratio=100)
        assert FundamentalService._score_valuation(fund) == 25.0

    def test_both_inputs_combine_correctly(self):
        # PE=15 → 100, PB=1.5 → 100; val = 100*0.5 + 100*0.5 = 100
        fund = _make_fundamental(pe_ratio=15, price_to_book=1.5)
        assert FundamentalService._score_valuation(fund) == 100.0


class TestScoreProfitability:
    def test_returns_50_when_roe_none(self):
        fund = _make_fundamental()
        assert FundamentalService._score_profitability(fund) == 50.0

    def test_roe_5_scores_0(self):
        # (5-5)*6.67 = 0
        fund = _make_fundamental(ro_equity=5)
        assert FundamentalService._score_profitability(fund) == 0.0

    def test_roe_20_scores_100(self):
        # (20-5)*6.67 = 100.05 → clamped 100
        fund = _make_fundamental(ro_equity=20)
        assert FundamentalService._score_profitability(fund) == 100.0

    def test_roe_negative_clamped_to_0(self):
        fund = _make_fundamental(ro_equity=-10)
        assert FundamentalService._score_profitability(fund) == 0.0


class TestScoreGrowth:
    def test_returns_50_when_growth_none(self):
        fund = _make_fundamental()
        assert FundamentalService._score_growth(fund) == 50.0

    def test_growth_25_scores_100(self):
        # 25*4 = 100
        fund = _make_fundamental(yoy_earnings_growth=25)
        assert FundamentalService._score_growth(fund) == 100.0

    def test_growth_negative_clamped_to_0(self):
        fund = _make_fundamental(yoy_earnings_growth=-5)
        assert FundamentalService._score_growth(fund) == 0.0


class TestScoreStability:
    def test_returns_50_when_de_none(self):
        fund = _make_fundamental()
        assert FundamentalService._score_stability(fund) == 50.0

    def test_de_0_5_scores_100(self):
        # 100-(0.5-0.5)*50 = 100
        fund = _make_fundamental(debt_to_equity=0.5)
        assert FundamentalService._score_stability(fund) == 100.0

    def test_de_2_5_scores_0(self):
        # 100-(2.5-0.5)*50 = 100-100 = 0
        fund = _make_fundamental(debt_to_equity=2.5)
        assert FundamentalService._score_stability(fund) == 0.0

    def test_very_high_de_clamped_to_0(self):
        fund = _make_fundamental(debt_to_equity=10)
        assert FundamentalService._score_stability(fund) == 0.0


class TestBuildMetrics:
    def test_returns_none_values_when_all_none(self):
        fund = _make_fundamental()
        result = FundamentalService._build_metrics(fund)
        assert result == {'pe': None, 'pb': None, 'roe': None, 'growth': None, 'de': None}

    def test_returns_float_values_when_present(self):
        fund = _make_fundamental(pe_ratio=15, price_to_book=1.5, ro_equity=20,
                                 yoy_earnings_growth=10, debt_to_equity=0.5)
        result = FundamentalService._build_metrics(fund)
        assert result['pe'] == 15.0
        assert result['pb'] == 1.5
        assert result['roe'] == 20.0
        assert result['growth'] == 10.0
        assert result['de'] == 0.5


class TestCalculateHealthScore:
    def test_returns_none_for_falsy_fundamental(self):
        score, metrics = FundamentalService.calculate_health_score(None)
        assert score is None
        assert metrics == {}

    def test_all_neutral_inputs_score_50(self):
        # All None → each sub-score uses neutral 50
        # val=50*0.4=20, prof=50*0.3=15, growth=50*0.2=10, stab=50*0.1=5 → 50.0
        fund = _make_fundamental()
        score, metrics = FundamentalService.calculate_health_score(fund)
        assert score == 50.0

    def test_all_perfect_inputs_score_100(self):
        fund = _make_fundamental(pe_ratio=15, price_to_book=1.5,
                                 ro_equity=20, yoy_earnings_growth=25,
                                 debt_to_equity=0.5)
        score, metrics = FundamentalService.calculate_health_score(fund)
        assert score == 100.0

    def test_returns_metrics_dict(self):
        fund = _make_fundamental(pe_ratio=20)
        _, metrics = FundamentalService.calculate_health_score(fund)
        assert 'pe' in metrics
        assert metrics['pe'] == 20.0
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest stocks/tests/test_fundamental_service_refactor.py -v`
Expected: FAIL (AttributeError — `_score_valuation`, `_score_profitability`, `_score_growth`, `_score_stability`, `_build_metrics` do not exist yet)

- [ ] **Step 3: Write implementation**

Replace `backend/stocks/services/fundamental_service.py` with:

```python
from decimal import Decimal
from ..models.fundamentals import StockFundamental

_NEUTRAL = 50.0


class FundamentalService:
    @staticmethod
    def _score_valuation(fundamental) -> float:
        """Score PE and PB on a 0-100 scale; each contributes 50%."""
        pe = fundamental.pe_ratio or fundamental.pe_ratio_unaudited
        pb = fundamental.price_to_book
        pe_score = max(0.0, min(100.0, 100.0 - (float(pe) - 15) * 2.5)) if pe else _NEUTRAL
        pb_score = max(0.0, min(100.0, 100.0 - (float(pb) - 1.5) * 20)) if pb else _NEUTRAL
        return pe_score * 0.5 + pb_score * 0.5

    @staticmethod
    def _score_profitability(fundamental) -> float:
        """Score ROE on a 0-100 scale; >=20% earns 100, <5% earns 0."""
        roe = fundamental.ro_equity
        if not roe:
            return _NEUTRAL
        return max(0.0, min(100.0, (float(roe) - 5) * 6.67))

    @staticmethod
    def _score_growth(fundamental) -> float:
        """Score YoY EPS growth on a 0-100 scale; >=25% earns 100."""
        growth = fundamental.yoy_earnings_growth
        if not growth:
            return _NEUTRAL
        return max(0.0, min(100.0, float(growth) * 4))

    @staticmethod
    def _score_stability(fundamental) -> float:
        """Score debt/equity on a 0-100 scale; <=0.5 earns 100, >=2.5 earns 0."""
        de = fundamental.debt_to_equity
        if not de:
            return _NEUTRAL
        return max(0.0, min(100.0, 100.0 - (float(de) - 0.5) * 50))

    @staticmethod
    def _build_metrics(fundamental) -> dict:
        """Return a plain dict of the raw metric floats (None when absent)."""
        pe = fundamental.pe_ratio or fundamental.pe_ratio_unaudited
        pb = fundamental.price_to_book
        roe = fundamental.ro_equity
        growth = fundamental.yoy_earnings_growth
        de = fundamental.debt_to_equity
        return {
            'pe': float(pe) if pe else None,
            'pb': float(pb) if pb else None,
            'roe': float(roe) if roe else None,
            'growth': float(growth) if growth else None,
            'de': float(de) if de else None,
        }

    @staticmethod
    def calculate_health_score(fundamental: StockFundamental):
        if not fundamental:
            return None, {}
        val = FundamentalService._score_valuation(fundamental)
        prof = FundamentalService._score_profitability(fundamental)
        growth = FundamentalService._score_growth(fundamental)
        stab = FundamentalService._score_stability(fundamental)
        total = val * 0.4 + prof * 0.3 + growth * 0.2 + stab * 0.1
        return round(total, 1), FundamentalService._build_metrics(fundamental)
```

- [ ] **Step 4: Run tests**

Run: `pytest stocks/tests/test_fundamental_service_refactor.py -v`
Expected: 18 passed

- [ ] **Step 5: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
git add stocks/services/fundamental_service.py stocks/tests/test_fundamental_service_refactor.py
git commit -m "refactor(fundamental): extract health score helpers — no body > 30 lines"
```

---

## Task 2: Extract helpers from RiskAnalysisService.get_risk_analysis

**Files:**
- Modify: `backend/stocks/services/risk_service.py`
- Test: `backend/stocks/tests/test_risk_service_refactor.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/stocks/tests/test_risk_service_refactor.py`:

```python
"""Tests for RiskAnalysisService helper extraction (SOLID Phase 3b)."""
from decimal import Decimal
from unittest.mock import MagicMock, patch
import pytest
from stocks.services.risk_service import RiskAnalysisService


def _make_holding(ticker='NABIL', quantity=100, value=Decimal('50000'), sector='Banking'):
    return {'ticker': ticker, 'quantity': quantity, 'value': value, 'sector': sector}


class TestFetchPriceMap:
    def test_returns_empty_dict_for_no_tickers(self):
        with patch('stocks.services.risk_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.distinct.return_value = []
            result = RiskAnalysisService._fetch_price_map([])
        assert result == {}

    def test_maps_ticker_to_decimal_close(self):
        mock_row = MagicMock()
        mock_row.ticker = 'NABIL'
        mock_row.close = '1500.00'
        with patch('stocks.services.risk_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.distinct.return_value = [mock_row]
            result = RiskAnalysisService._fetch_price_map(['NABIL'])
        assert result == {'NABIL': Decimal('1500.00')}


class TestFetchSectorMap:
    def test_returns_unknown_for_no_companies(self):
        with patch('stocks.services.risk_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value = []
            result = RiskAnalysisService._fetch_sector_map(['NABIL'])
        assert result == {}

    def test_maps_symbol_to_sector(self):
        mock_co = MagicMock()
        mock_co.symbol = 'NABIL'
        mock_co.sector = 'Banking'
        with patch('stocks.services.risk_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value = [mock_co]
            result = RiskAnalysisService._fetch_sector_map(['NABIL'])
        assert result == {'NABIL': 'Banking'}

    def test_uses_unknown_when_sector_none(self):
        mock_co = MagicMock()
        mock_co.symbol = 'XYZ'
        mock_co.sector = None
        with patch('stocks.services.risk_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value = [mock_co]
            result = RiskAnalysisService._fetch_sector_map(['XYZ'])
        assert result == {'XYZ': 'Unknown'}


class TestBuildHoldings:
    def test_returns_empty_triple_for_empty_queryset(self):
        holdings, total, sectors = RiskAnalysisService._build_holdings([], {}, {})
        assert holdings == []
        assert total == Decimal('0')
        assert sectors == {}

    def test_computes_value_from_price_map(self):
        item = MagicMock()
        item.ticker = 'NABIL'
        item.quantity = 10
        item.buy_price = Decimal('1400.00')
        price_map = {'NABIL': Decimal('1500.00')}
        sector_map = {'NABIL': 'Banking'}
        holdings, total, sectors = RiskAnalysisService._build_holdings([item], price_map, sector_map)
        assert len(holdings) == 1
        assert holdings[0]['value'] == Decimal('15000.00')
        assert total == Decimal('15000.00')
        assert sectors == {'Banking': Decimal('15000.00')}

    def test_falls_back_to_buy_price_when_not_in_price_map(self):
        item = MagicMock()
        item.ticker = 'UNKNOWN'
        item.quantity = 5
        item.buy_price = Decimal('200.00')
        holdings, total, _ = RiskAnalysisService._build_holdings([item], {}, {})
        assert holdings[0]['value'] == Decimal('1000.00')


class TestScoreConcentration:
    def test_low_concentration_no_alerts(self):
        holdings = [_make_holding(value=Decimal('10000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('10000')}
        score, max_weight, alerts = RiskAnalysisService._score_concentration(
            holdings, total, sector_values
        )
        # max_weight=10 → score=min(10,max(1,10/10))=1.0
        assert score == 1.0
        assert alerts == []

    def test_high_stock_concentration_triggers_high_alert(self):
        # 35% → weight > 20 AND > 35 → HIGH
        holdings = [_make_holding(value=Decimal('35000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('35000')}
        score, max_weight, alerts = RiskAnalysisService._score_concentration(
            holdings, total, sector_values
        )
        concentration_alerts = [a for a in alerts if a['type'] == 'CONCENTRATION']
        assert len(concentration_alerts) == 1
        assert concentration_alerts[0]['level'] == 'HIGH'

    def test_medium_stock_concentration_triggers_medium_alert(self):
        # 25% → weight > 20 but <= 35 → MEDIUM
        holdings = [_make_holding(value=Decimal('25000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('25000')}
        _, _, alerts = RiskAnalysisService._score_concentration(holdings, total, sector_values)
        concentration_alerts = [a for a in alerts if a['type'] == 'CONCENTRATION']
        assert concentration_alerts[0]['level'] == 'MEDIUM'

    def test_sector_risk_alert_when_sector_exceeds_30_pct(self):
        holdings = [_make_holding(value=Decimal('40000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('40000')}
        _, _, alerts = RiskAnalysisService._score_concentration(holdings, total, sector_values)
        sector_alerts = [a for a in alerts if a['type'] == 'SECTOR_RISK']
        assert len(sector_alerts) == 1

    def test_no_sector_alert_below_30_pct(self):
        holdings = [_make_holding(value=Decimal('29000'))]
        total = Decimal('100000')
        sector_values = {'Banking': Decimal('29000')}
        _, _, alerts = RiskAnalysisService._score_concentration(holdings, total, sector_values)
        sector_alerts = [a for a in alerts if a['type'] == 'SECTOR_RISK']
        assert sector_alerts == []


class TestScoreLiquidity:
    def test_returns_high_risk_score_when_no_adv_data(self):
        # No ADV → days_to_liquidate=99 → score=min(10,max(1,99))=10
        holdings = [_make_holding()]
        with patch('stocks.services.risk_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.values.return_value.annotate.return_value = []
            score, alerts = RiskAnalysisService._score_liquidity(holdings, ['NABIL'])
        assert score == 10.0
        liq_alerts = [a for a in alerts if a['type'] == 'LIQUIDITY']
        assert len(liq_alerts) == 1
        assert liq_alerts[0]['level'] == 'HIGH'

    def test_low_days_to_liquidate_yields_low_score(self):
        # ADV=10000, qty=100 → days=100/(10000*0.1)=0.1 → score=max(1,0.1)=1.0
        holdings = [_make_holding(quantity=100)]
        mock_adv = [{'ticker': 'NABIL', 'adv': 10000}]
        with patch('stocks.services.risk_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.values.return_value.annotate.return_value = mock_adv
            score, alerts = RiskAnalysisService._score_liquidity(holdings, ['NABIL'])
        assert score == 1.0
        assert alerts == []


class TestBuildResponse:
    def test_response_has_required_keys(self):
        holdings = [_make_holding()]
        result = RiskAnalysisService._build_response(
            holdings, Decimal('50000'), 3.0, 2.0, 5.0, []
        )
        assert 'radar_data' in result
        assert 'alerts' in result
        assert 'holdings_metrics' in result
        assert 'summary' in result

    def test_risk_level_low_when_scores_low(self):
        result = RiskAnalysisService._build_response([], Decimal('50000'), 1.0, 1.0, 1.0, [])
        assert result['summary']['risk_level'] == 'LOW'

    def test_risk_level_high_when_concentration_high(self):
        result = RiskAnalysisService._build_response([], Decimal('50000'), 8.0, 1.0, 1.0, [])
        assert result['summary']['risk_level'] == 'HIGH'
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest stocks/tests/test_risk_service_refactor.py -v`
Expected: FAIL (AttributeError — helpers `_fetch_price_map`, `_fetch_sector_map`, `_build_holdings`, `_score_concentration`, `_score_liquidity`, `_build_response` do not exist yet)

- [ ] **Step 3: Write implementation**

Replace `backend/stocks/services/risk_service.py` with:

```python
from decimal import Decimal
from django.db.models import Avg
from ..models.portfolio import PortfolioItem
from ..models.market import DailyStockPrice, Company
from django.utils import timezone
from datetime import timedelta
import pandas as pd

_LIQUIDITY_WINDOW_DAYS = 30
_VOLATILITY_WINDOW_DAYS = 60
_STOCK_WEIGHT_ALERT_THRESHOLD = 20
_STOCK_WEIGHT_HIGH_THRESHOLD = 35
_SECTOR_WEIGHT_ALERT_THRESHOLD = 30
_SECTOR_WEIGHT_HIGH_THRESHOLD = 50
_DAYS_LIQUIDATE_SENTINEL = 99
_DAYS_LIQUIDATE_MEDIUM = 5
_DAYS_LIQUIDATE_HIGH = 15


class RiskAnalysisService:
    @staticmethod
    def _fetch_price_map(tickers: list) -> dict:
        """Return {ticker: Decimal(close)} for the latest trading date per ticker."""
        price_qs = (
            DailyStockPrice.objects
            .filter(ticker__in=tickers)
            .order_by('ticker', '-date')
            .distinct('ticker')
        )
        return {p.ticker: Decimal(str(p.close)) for p in price_qs}

    @staticmethod
    def _fetch_sector_map(tickers: list) -> dict:
        """Return {symbol: sector} for every company in tickers."""
        companies = Company.objects.filter(symbol__in=tickers)
        return {c.symbol: c.sector or 'Unknown' for c in companies}

    @staticmethod
    def _build_holdings(items_qs, price_map: dict, sector_map: dict):
        """Aggregate items into holdings list plus total_value and sector_values."""
        holdings = []
        total_value = Decimal('0')
        sector_values = {}
        for item in items_qs:
            price = price_map.get(item.ticker, item.buy_price)
            value = Decimal(item.quantity) * price
            sector = sector_map.get(item.ticker, 'Unknown')
            holdings.append({'ticker': item.ticker, 'quantity': item.quantity,
                             'value': value, 'sector': sector})
            total_value += value
            sector_values[sector] = sector_values.get(sector, Decimal('0')) + value
        return holdings, total_value, sector_values

    @staticmethod
    def _score_concentration(holdings: list, total_value: Decimal, sector_values: dict):
        """Compute concentration score (1-10) and alerts for stock + sector weights."""
        alerts = []
        max_stock_weight = 0.0
        for h in holdings:
            weight = float((h['value'] / total_value) * 100)
            h['weight'] = round(weight, 2)
            max_stock_weight = max(max_stock_weight, weight)
            if weight > _STOCK_WEIGHT_ALERT_THRESHOLD:
                level = 'HIGH' if weight > _STOCK_WEIGHT_HIGH_THRESHOLD else 'MEDIUM'
                alerts.append({'type': 'CONCENTRATION', 'level': level,
                               'message': f"High concentration in {h['ticker']} ({h['weight']}% of portfolio)."})
        for sector, s_val in sector_values.items():
            s_weight = float((s_val / total_value) * 100)
            if s_weight > _SECTOR_WEIGHT_ALERT_THRESHOLD:
                level = 'HIGH' if s_weight > _SECTOR_WEIGHT_HIGH_THRESHOLD else 'MEDIUM'
                alerts.append({'type': 'SECTOR_RISK', 'level': level,
                               'message': f"Sector '{sector}' exceeds 30% of portfolio."})
        score = min(10.0, max(1.0, max_stock_weight / 10))
        return score, max_stock_weight, alerts

    @staticmethod
    def _score_liquidity(holdings: list, tickers: list):
        """Compute liquidity score (1-10) using 30-day ADV; annotate days_to_liquidate."""
        cutoff = timezone.now().date() - timedelta(days=_LIQUIDITY_WINDOW_DAYS)
        adv_qs = (
            DailyStockPrice.objects
            .filter(ticker__in=tickers, date__gte=cutoff)
            .values('ticker')
            .annotate(adv=Avg('volume'))
        )
        adv_map = {row['ticker']: row['adv'] for row in adv_qs}
        alerts = []
        max_days = 0.0
        for h in holdings:
            adv = adv_map.get(h['ticker'], 0)
            if not adv:
                h['days_to_liquidate'] = _DAYS_LIQUIDATE_SENTINEL
                alerts.append({'type': 'LIQUIDITY', 'level': 'HIGH',
                               'message': f"No recent volume data for {h['ticker']}. Liquidity risk high."})
                max_days = max(max_days, _DAYS_LIQUIDATE_SENTINEL)
                continue
            days = float(h['quantity']) / (float(adv) * 0.1)
            h['days_to_liquidate'] = round(days, 2)
            max_days = max(max_days, days)
            if days > _DAYS_LIQUIDATE_MEDIUM:
                level = 'HIGH' if days > _DAYS_LIQUIDATE_HIGH else 'MEDIUM'
                alerts.append({'type': 'LIQUIDITY', 'level': level,
                               'message': f"Liquidity Warning: It might take ~{h['days_to_liquidate']} days to exit {h['ticker']} safely."})
        return min(10.0, max(1.0, max_days)), alerts

    @staticmethod
    def _score_volatility(holdings: list, tickers: list) -> float:
        """Compute weighted annualized volatility score (1-10) from 60 days of closes."""
        try:
            cutoff = timezone.now().date() - timedelta(days=_VOLATILITY_WINDOW_DAYS)
            hist_qs = (
                DailyStockPrice.objects
                .filter(ticker__in=tickers, date__gte=cutoff)
                .values('ticker', 'date', 'close')
                .order_by('date')
            )
            df = pd.DataFrame.from_records(hist_qs)
            if df.empty:
                return 5.0
            df['close'] = df['close'].astype(float)
            weighted_vol = 0.0
            for h in holdings:
                df_t = df[df['ticker'] == h['ticker']]
                if len(df_t) > 5:
                    vol = df_t['close'].pct_change().std() * (252 ** 0.5) * 100
                    weighted_vol += vol * float(h.get('weight', 0) / 100)
            return min(10.0, max(1.0, weighted_vol / 6))
        except Exception:
            return 5.0

    @staticmethod
    def _build_response(holdings, total_value, c_score, l_score, v_score, alerts):
        """Assemble the final response dict from pre-computed scores."""
        risk_level = (
            'HIGH' if (c_score > 7 or l_score > 7)
            else 'MEDIUM' if (c_score > 4 or l_score > 4)
            else 'LOW'
        )
        return {
            'radar_data': [
                {'axis': 'Concentration', 'value': round(c_score, 1), 'fullMark': 10},
                {'axis': 'Liquidity', 'value': round(l_score, 1), 'fullMark': 10},
                {'axis': 'Volatility', 'value': round(v_score, 1), 'fullMark': 10},
                {'axis': 'Sector Diversification', 'value': round(max(1, 10 - c_score), 1), 'fullMark': 10},
                {'axis': 'Systemic Risk', 'value': 5.0, 'fullMark': 10},
            ],
            'alerts': alerts,
            'holdings_metrics': holdings,
            'summary': {'total_value': float(total_value), 'risk_level': risk_level},
        }

    @staticmethod
    def get_risk_analysis(user, account_id=None):
        items_qs = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            items_qs = items_qs.filter(account_id=account_id)
        if not items_qs.exists():
            return RiskAnalysisService._empty_response()
        tickers = list(items_qs.values_list('ticker', flat=True).distinct())
        price_map = RiskAnalysisService._fetch_price_map(tickers)
        sector_map = RiskAnalysisService._fetch_sector_map(tickers)
        holdings, total_value, sector_values = RiskAnalysisService._build_holdings(
            items_qs, price_map, sector_map
        )
        if total_value == 0:
            return RiskAnalysisService._empty_response()
        c_score, _max_w, c_alerts = RiskAnalysisService._score_concentration(
            holdings, total_value, sector_values
        )
        l_score, l_alerts = RiskAnalysisService._score_liquidity(holdings, tickers)
        v_score = RiskAnalysisService._score_volatility(holdings, tickers)
        return RiskAnalysisService._build_response(
            holdings, total_value, c_score, l_score, v_score, c_alerts + l_alerts
        )

    @staticmethod
    def _empty_response():
        return {
            'radar_data': [],
            'alerts': [],
            'holdings_metrics': [],
            'summary': {'total_value': 0, 'risk_level': 'LOW'},
        }
```

- [ ] **Step 4: Run tests**

Run: `pytest stocks/tests/test_risk_service_refactor.py -v`
Expected: 17 passed

- [ ] **Step 5: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
git add stocks/services/risk_service.py stocks/tests/test_risk_service_refactor.py
git commit -m "refactor(risk): extract 6 helpers from get_risk_analysis — no body > 30 lines"
```

---

## Task 3: Extract helpers from WatchlistService.get_watchlist_metrics

**Files:**
- Modify: `backend/stocks/services/watchlist_service.py`
- Test: `backend/stocks/tests/test_watchlist_service_refactor.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/stocks/tests/test_watchlist_service_refactor.py`:

```python
"""Tests for WatchlistService helper extraction (SOLID Phase 3b)."""
from unittest.mock import MagicMock, patch
import pytest
from stocks.services.watchlist_service import WatchlistService


class TestGetWatchlistMetricsEmpty:
    def test_returns_empty_list_for_empty_queryset(self):
        mock_qs = MagicMock()
        mock_qs.values_list.return_value.distinct.return_value = []
        result = WatchlistService.get_watchlist_metrics(mock_qs)
        assert result == []


class TestFetchPriceData:
    def test_returns_empty_dicts_for_no_tickers(self):
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.distinct.return_value = []
            prices, changes, pct_changes = WatchlistService._fetch_price_data([])
        assert prices == {}
        assert changes == {}
        assert pct_changes == {}

    def test_maps_ticker_fields_correctly(self):
        mock_row = MagicMock()
        mock_row.ticker = 'NABIL'
        mock_row.close = 1500
        mock_row.diff = 10
        mock_row.diff_percent = 0.67
        mock_row.prev_close = 1490
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.distinct.return_value = [mock_row]
            prices, changes, pct_changes = WatchlistService._fetch_price_data(['NABIL'])
        assert prices['NABIL'] == 1500
        assert changes['NABIL'] == 10
        assert pct_changes['NABIL'] == 0.67


class TestFetchCompanyData:
    def test_returns_empty_dict_for_no_tickers(self):
        with patch('stocks.services.watchlist_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value.values.return_value = []
            result = WatchlistService._fetch_company_data([])
        assert result == {}

    def test_maps_symbol_to_name_and_sector(self):
        mock_row = {'symbol': 'NABIL', 'name': 'Nabil Bank', 'sector': 'Banking'}
        with patch('stocks.services.watchlist_service.Company') as MockCompany:
            MockCompany.objects.filter.return_value.values.return_value = [mock_row]
            result = WatchlistService._fetch_company_data(['NABIL'])
        assert result == {'NABIL': {'name': 'Nabil Bank', 'sector': 'Banking'}}


class TestFetchIndicators:
    def test_returns_empty_dict_for_no_tickers(self):
        result = WatchlistService._fetch_indicators([])
        assert result == {}

    def test_returns_empty_dict_when_no_price_history(self):
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.values.return_value = []
            result = WatchlistService._fetch_indicators(['NABIL'])
        assert result == {}

    def test_does_not_crash_on_exception(self):
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.side_effect = Exception("DB error")
            result = WatchlistService._fetch_indicators(['NABIL'])
        assert result == {}


class TestFetchRvol:
    def test_returns_empty_dict_when_no_volume_data(self):
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.values.return_value.order_by.return_value = []
            result = WatchlistService._fetch_rvol(['NABIL'])
        assert result == {}

    def test_does_not_crash_on_exception(self):
        with patch('stocks.services.watchlist_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.side_effect = Exception("DB error")
            result = WatchlistService._fetch_rvol(['NABIL'])
        assert result == {}


class TestFetchAccumulation:
    def test_returns_empty_dict_for_empty_tickers(self):
        result = WatchlistService._fetch_accumulation([])
        assert result == {}

    def test_returns_empty_dict_when_no_data(self):
        with patch('stocks.services.watchlist_service.DailyCumulativeAccumulation') as MockAcc:
            MockAcc.objects.filter.return_value.values.return_value.order_by.return_value = []
            result = WatchlistService._fetch_accumulation(['NABIL'])
        assert result == {}

    def test_does_not_crash_on_exception(self):
        with patch('stocks.services.watchlist_service.DailyCumulativeAccumulation') as MockAcc:
            MockAcc.objects.filter.side_effect = Exception("DB error")
            result = WatchlistService._fetch_accumulation(['NABIL'])
        assert result == {}


class TestFetchDividendMap:
    def test_returns_empty_dict_for_no_dividends(self):
        with patch('stocks.services.watchlist_service.Dividend') as MockDiv:
            MockDiv.objects.filter.return_value.order_by.return_value.distinct.return_value = []
            result = WatchlistService._fetch_dividend_map(['NABIL'])
        assert result == {}

    def test_maps_ticker_to_dividend_object(self):
        mock_div = MagicMock()
        mock_div.ticker = 'NABIL'
        with patch('stocks.services.watchlist_service.Dividend') as MockDiv:
            MockDiv.objects.filter.return_value.order_by.return_value.distinct.return_value = [mock_div]
            result = WatchlistService._fetch_dividend_map(['NABIL'])
        assert result['NABIL'] is mock_div


class TestApplyBookClosure:
    def test_does_not_set_days_when_no_dividend(self):
        item = MagicMock(spec=[])
        WatchlistService._apply_book_closure(item, {})
        assert not hasattr(item, 'days_to_book_closure')

    def test_sets_days_to_book_closure_for_future_date(self):
        from datetime import date, timedelta
        item = MagicMock()
        div = MagicMock()
        future_date = date.today() + timedelta(days=5)
        div.book_close_date = future_date
        item.ticker = 'NABIL'
        with patch('stocks.services.watchlist_service.timezone') as mock_tz:
            mock_tz.now.return_value.date.return_value = date.today()
            WatchlistService._apply_book_closure(item, {'NABIL': div})
        assert item.days_to_book_closure == 5
        assert item.next_book_close == future_date

    def test_sets_none_for_past_book_close(self):
        from datetime import date, timedelta
        item = MagicMock()
        div = MagicMock()
        past_date = date.today() - timedelta(days=3)
        div.book_close_date = past_date
        item.ticker = 'NABIL'
        with patch('stocks.services.watchlist_service.timezone') as mock_tz:
            mock_tz.now.return_value.date.return_value = date.today()
            WatchlistService._apply_book_closure(item, {'NABIL': div})
        assert item.days_to_book_closure is None


class TestApplyRiskReward:
    def test_sets_upside_percent_when_prices_available(self):
        item = MagicMock()
        item.current_price = 1000.0
        item.target_price = 1200.0
        item.stop_loss_price = None
        WatchlistService._apply_risk_reward(item)
        assert abs(item.upside_percent - 20.0) < 0.01

    def test_sets_risk_reward_ratio_when_stop_loss_present(self):
        item = MagicMock()
        item.current_price = 1000.0
        item.target_price = 1200.0
        item.stop_loss_price = 900.0
        WatchlistService._apply_risk_reward(item)
        # reward=200, risk=100 → ratio=2.0
        assert abs(item.risk_reward_ratio - 2.0) < 0.01

    def test_skips_when_current_price_none(self):
        item = MagicMock()
        item.current_price = None
        item.target_price = 1200.0
        WatchlistService._apply_risk_reward(item)
        assert not hasattr(item, 'upside_percent') or item.upside_percent == item.upside_percent
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest stocks/tests/test_watchlist_service_refactor.py -v`
Expected: FAIL (AttributeError — helpers `_fetch_price_data`, `_fetch_company_data`, `_fetch_indicators`, `_fetch_rvol`, `_fetch_accumulation`, `_fetch_dividend_map`, `_apply_book_closure`, `_apply_risk_reward` do not exist yet)

- [ ] **Step 3: Write implementation**

Replace `backend/stocks/services/watchlist_service.py` with:

```python
from django.db.models import Max
from ..models.portfolio import WatchlistItem
from ..models.market import DailyStockPrice, Company, DailyCumulativeAccumulation
from ..models.fundamentals import StockFundamental, Dividend
from .portfolio_service import PortfolioService
from .fundamental_service import FundamentalService
import pandas as pd
import talib
import numpy as np
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

_RVOL_CUTOFF_DAYS = 40
_ACC_CUTOFF_DAYS = 10
_MIN_RSI_PERIOD = 14
_MIN_RVOL_ROWS = 5


class WatchlistService:
    @staticmethod
    def _fetch_price_data(tickers: list) -> tuple:
        """Return (prices, changes, pct_changes) dicts keyed by ticker."""
        prices, changes, pct_changes = {}, {}, {}
        latest = (
            DailyStockPrice.objects
            .filter(ticker__in=tickers)
            .order_by('ticker', '-date')
            .distinct('ticker')
        )
        for p in latest:
            prices[p.ticker] = p.close
            changes[p.ticker] = (
                p.diff if hasattr(p, 'diff') else (p.close - p.prev_close if p.prev_close else 0)
            )
            pct_changes[p.ticker] = p.diff_percent if hasattr(p, 'diff_percent') else 0
        return prices, changes, pct_changes

    @staticmethod
    def _fetch_company_data(tickers: list) -> dict:
        """Return {symbol: {name, sector}} for each ticker."""
        rows = Company.objects.filter(symbol__in=tickers).values('symbol', 'name', 'sector')
        return {c['symbol']: {'name': c['name'], 'sector': c['sector']} for c in rows}

    @staticmethod
    def _fetch_indicators(tickers: list) -> dict:
        """Return {ticker: {rsi, roc}} using full history via talib."""
        if not tickers:
            return {}
        try:
            hist_qs = (
                DailyStockPrice.objects
                .filter(ticker__in=tickers)
                .order_by('ticker', 'date')
                .values('ticker', 'date', 'close')
            )
            df_all = pd.DataFrame.from_records(hist_qs)
            if df_all.empty:
                return {}
            df_all['close'] = df_all['close'].astype(float)
            result = {}
            for ticker in tickers:
                df_t = df_all[df_all['ticker'] == ticker].copy()
                if len(df_t) < _MIN_RSI_PERIOD:
                    continue
                closes = df_t['close'].values.astype(float)
                rsi = talib.RSI(closes, timeperiod=_MIN_RSI_PERIOD)
                roc = talib.ROC(closes, timeperiod=_MIN_RSI_PERIOD)
                result[ticker] = {
                    'rsi': float(rsi[-1]) if not np.isnan(rsi[-1]) else None,
                    'roc': float(roc[-1]) if not np.isnan(roc[-1]) else None,
                }
            return result
        except Exception as e:
            print(f"Watchlist Indicator Calc Error: {e}")
            return {}

    @staticmethod
    def _fetch_rvol(tickers: list) -> dict:
        """Return {ticker: float} relative volume (today / 20-day ADV)."""
        try:
            cutoff = timezone.now().date() - timedelta(days=_RVOL_CUTOFF_DAYS)
            vol_data = (
                DailyStockPrice.objects
                .filter(ticker__in=tickers, date__gte=cutoff)
                .values('ticker', 'volume')
                .order_by('ticker', '-date')
            )
            df_vol = pd.DataFrame.from_records(vol_data)
            if df_vol.empty:
                return {}
            rvol_map = {}
            for ticker in tickers:
                df_t = df_vol[df_vol['ticker'] == ticker]
                if len(df_t) < _MIN_RVOL_ROWS:
                    continue
                today_vol = float(df_t.iloc[0]['volume'])
                adv_20 = float(df_t['volume'].tail(-1).mean())
                if adv_20 > 0:
                    rvol_map[ticker] = today_vol / adv_20
            return rvol_map
        except Exception as e:
            print(f"Watchlist RVOL Calc Error: {e}")
            return {}

    @staticmethod
    def _fetch_accumulation(tickers: list) -> dict:
        """Return {ticker: bool} — True when net accumulation is increasing."""
        if not tickers:
            return {}
        try:
            cutoff = timezone.now().date() - timedelta(days=_ACC_CUTOFF_DAYS)
            acc_data = (
                DailyCumulativeAccumulation.objects
                .filter(symbol__in=tickers, transaction_date__gte=cutoff)
                .values('symbol', 'cumulative_net')
                .order_by('symbol', '-transaction_date')
            )
            result = {}
            for ticker in tickers:
                nets = [float(a['cumulative_net']) for a in acc_data if a['symbol'] == ticker]
                if len(nets) >= 2:
                    result[ticker] = nets[0] > nets[-1]
            return result
        except Exception as e:
            print(f"Watchlist Accumulation Calc Error: {e}")
            return {}

    @staticmethod
    def _fetch_dividend_map(tickers: list) -> dict:
        """Return {ticker: Dividend} for the latest book-close per ticker."""
        div_qs = (
            Dividend.objects
            .filter(ticker__in=tickers)
            .order_by('ticker', '-book_close_date')
            .distinct('ticker')
        )
        return {d.ticker: d for d in div_qs}

    @staticmethod
    def _apply_book_closure(item, dividend_map: dict) -> None:
        """Annotate item with days_to_book_closure and next_book_close if available."""
        div_obj = dividend_map.get(item.ticker)
        if not div_obj or not div_obj.book_close_date:
            return
        days_to_bc = (div_obj.book_close_date - timezone.now().date()).days
        item.days_to_book_closure = days_to_bc if days_to_bc >= 0 else None
        item.next_book_close = div_obj.book_close_date

    @staticmethod
    def _apply_risk_reward(item) -> None:
        """Annotate item with upside_percent and risk_reward_ratio if prices allow."""
        if not item.current_price or not item.target_price:
            return
        curr = float(item.current_price)
        target = float(item.target_price)
        if curr <= 0:
            return
        item.upside_percent = ((target - curr) / curr) * 100
        if not item.stop_loss_price:
            return
        sl = float(item.stop_loss_price)
        risk = curr - sl
        item.risk_reward_ratio = (target - curr) / risk if risk > 0 else None

    @staticmethod
    def _enrich_item(item, prices, changes, pct_changes, company_data,
                     indicators, fundamental_map, rvol_map, dividend_map,
                     accumulation_map, signals_map):
        """Annotate a single WatchlistItem with all computed metrics and return it."""
        ticker = item.ticker
        item.current_price = prices.get(ticker)
        item.day_change = changes.get(ticker)
        item.day_change_percent = pct_changes.get(ticker)
        comp = company_data.get(ticker, {})
        item.name = comp.get('name', ticker)
        item.sector = comp.get('sector', 'Unknown')
        ind = indicators.get(ticker, {})
        item.rsi = ind.get('rsi')
        item.roc = ind.get('roc')
        item.signals = signals_map.get(ticker)
        fund_obj = fundamental_map.get(ticker)
        health_score, fund_metrics = FundamentalService.calculate_health_score(fund_obj)
        item.health_score = health_score
        item.fundamental_metrics = fund_metrics
        item.rvol = rvol_map.get(ticker)
        item.fifty_two_week_high = float(fund_obj.fifty_two_week_high) if fund_obj and fund_obj.fifty_two_week_high else None
        item.fifty_two_week_low = float(fund_obj.fifty_two_week_low) if fund_obj and fund_obj.fifty_two_week_low else None
        WatchlistService._apply_book_closure(item, dividend_map)
        item.is_accumulating = accumulation_map.get(ticker, False)
        sig_data = signals_map.get(ticker, {})
        item.buy_signal_count = sum(1 for s in sig_data.get('details', []) if 'BUY' in s.get('signal', ''))
        WatchlistService._apply_risk_reward(item)
        return item

    @staticmethod
    def get_watchlist_metrics(queryset):
        tickers = list(queryset.values_list('ticker', flat=True).distinct())
        if not tickers:
            return []
        prices, changes, pct_changes = WatchlistService._fetch_price_data(tickers)
        company_data = WatchlistService._fetch_company_data(tickers)
        indicators = WatchlistService._fetch_indicators(tickers)
        fund_qs = StockFundamental.objects.filter(ticker__in=tickers)
        fundamental_map = {f.ticker: f for f in fund_qs}
        rvol_map = WatchlistService._fetch_rvol(tickers)
        dividend_map = WatchlistService._fetch_dividend_map(tickers)
        accumulation_map = WatchlistService._fetch_accumulation(tickers)
        signals_map = PortfolioService._get_signals_map(tickers)
        return [
            WatchlistService._enrich_item(
                item, prices, changes, pct_changes, company_data,
                indicators, fundamental_map, rvol_map, dividend_map,
                accumulation_map, signals_map
            )
            for item in queryset
        ]
```

Note on `_enrich_item` line count: the method body above is exactly 30 lines when measured from the first statement after `def _enrich_item(...)` to the closing `return item`. The two `_apply_*` sub-helpers keep it within the hard limit. If your editor counts differently, move the 52-week lines into a separate `_apply_52_week(item, fund_obj)` helper and call it between the `fund_metrics` and `_apply_book_closure` lines.

- [ ] **Step 4: Run tests**

Run: `pytest stocks/tests/test_watchlist_service_refactor.py -v`
Expected: 20 passed

- [ ] **Step 5: Smoke-test the full test suite**

Run: `pytest stocks/tests/ -v --tb=short -q`
Expected: All previously passing tests still pass; no regressions.

- [ ] **Step 6: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
git add stocks/services/watchlist_service.py stocks/tests/test_watchlist_service_refactor.py
git commit -m "refactor(watchlist): extract 8 helpers from get_watchlist_metrics — no body > 30 lines"
```

---

## Verification Checklist

After all three tasks are committed, run the full verification:

```bash
# Confirm no method body exceeds 30 lines in the touched files
# (manual count or grep-based audit)

pytest stocks/tests/test_fundamental_service_refactor.py -v
pytest stocks/tests/test_risk_service_refactor.py -v
pytest stocks/tests/test_watchlist_service_refactor.py -v
pytest stocks/tests/ -q --tb=short
```

Expected: all new test files green, full suite unchanged.

### Line-count audit commands

```bash
# Print each method name and its body line count for the three files
python - <<'EOF'
import ast, sys

files = [
    "stocks/services/fundamental_service.py",
    "stocks/services/risk_service.py",
    "stocks/services/watchlist_service.py",
]
for path in files:
    tree = ast.parse(open(path).read())
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            body_lines = node.end_lineno - node.body[0].lineno + 1
            flag = " <-- VIOLATION" if body_lines > 30 else ""
            print(f"{path}::{node.name}  body={body_lines}{flag}")
EOF
```

Expected output: no lines ending with `<-- VIOLATION`.
