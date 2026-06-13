from decimal import Decimal
from ..models.fundamentals import StockFundamental

_NEUTRAL = 50.0


class FundamentalService:
    @staticmethod
    def _score_valuation(fundamental) -> float:
        pe = fundamental.pe_ratio or fundamental.pe_ratio_unaudited
        pb = fundamental.price_to_book
        pe_score = max(0.0, min(100.0, 100.0 - (float(pe) - 15) * 2.5)) if pe else _NEUTRAL
        pb_score = max(0.0, min(100.0, 100.0 - (float(pb) - 1.5) * 20)) if pb else _NEUTRAL
        return pe_score * 0.5 + pb_score * 0.5

    @staticmethod
    def _score_profitability(fundamental) -> float:
        roe = fundamental.ro_equity
        if not roe:
            return _NEUTRAL
        return max(0.0, min(100.0, (float(roe) - 5) * 6.67))

    @staticmethod
    def _score_growth(fundamental) -> float:
        growth = fundamental.yoy_earnings_growth
        if not growth:
            return _NEUTRAL
        return max(0.0, min(100.0, float(growth) * 4))

    @staticmethod
    def _score_stability(fundamental) -> float:
        de = fundamental.debt_to_equity
        if not de:
            return _NEUTRAL
        return max(0.0, min(100.0, 100.0 - (float(de) - 0.5) * 50))

    @staticmethod
    def _build_metrics(fundamental) -> dict:
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
        """
        Calculates a Fundamental Health Score (0-100) based on weighted metrics.
        Weights:
        - Valuation (PE, PB): 40%
        - Profitability (ROE): 30%
        - Growth (EPS Growth): 20%
        - Stability (Debt/Equity): 10%
        """
        if not fundamental:
            return None, {}
        val = FundamentalService._score_valuation(fundamental)
        prof = FundamentalService._score_profitability(fundamental)
        growth = FundamentalService._score_growth(fundamental)
        stab = FundamentalService._score_stability(fundamental)
        total = val * 0.4 + prof * 0.3 + growth * 0.2 + stab * 0.1
        return round(total, 1), FundamentalService._build_metrics(fundamental)
