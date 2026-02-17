from decimal import Decimal
from ..models.fundamentals import StockFundamental

class FundamentalService:
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

        scores = []
        
        # 1. Valuation (40%)
        # Lower PE/PB is generally better for "Value/Quality" score 
        # Thresholds tailored for emerging markets/Nepal
        val_score = 0
        pe = fundamental.pe_ratio or fundamental.pe_ratio_unaudited
        pb = fundamental.price_to_book
        
        if pe:
            # Score 0-100: PE < 15 is great (100), PE > 50 is poor (0)
            p_score = max(0, min(100, 100 - (float(pe) - 15) * 2.5))
            val_score += p_score * 0.5
        else:
            val_score += 50 * 0.5 # Neutral if missing
            
        if pb:
            # PB < 1.5 is great, PB > 6 is poor
            b_score = max(0, min(100, 100 - (float(pb) - 1.5) * 20))
            val_score += b_score * 0.5
        else:
            val_score += 50 * 0.5

        scores.append(val_score * 0.4)

        # 2. Profitability (30%) - ROE
        # ROE > 20% is excellent, ROE < 5% is poor
        roe_score = 50
        roe = fundamental.ro_equity
        if roe:
            roe_score = max(0, min(100, (float(roe) - 5) * 6.67))
        scores.append(roe_score * 0.3)

        # 3. Growth (20%) - EPS Growth
        growth_score = 50
        growth = fundamental.yoy_earnings_growth
        if growth:
            # Growth > 25% is great, Growth < 0 is poor
            growth_score = max(0, min(100, float(growth) * 4))
        scores.append(growth_score * 0.2)

        # 4. Stability (10%) - Debt to Equity
        stability_score = 50
        de = fundamental.debt_to_equity
        if de:
            # DE < 0.5 is great, DE > 2.5 is poor
            stability_score = max(0, min(100, 100 - (float(de) - 0.5) * 50))
        scores.append(stability_score * 0.1)

        total_score = sum(scores)
        
        return round(total_score, 1), {
            "pe": float(pe) if pe else None,
            "pb": float(pb) if pb else None,
            "roe": float(roe) if roe else None,
            "growth": float(growth) if growth else None,
            "de": float(de) if de else None
        }
