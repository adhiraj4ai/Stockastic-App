from decimal import Decimal
from django.db.models import Sum, Avg
from ..models.portfolio import PortfolioItem
from ..models.market import DailyStockPrice, Company
from django.utils import timezone
from datetime import timedelta
import pandas as pd
import numpy as np

class RiskAnalysisService:
    @staticmethod
    def get_risk_analysis(user, account_id=None):
        """
        Calculates concentrations, liquidity risk, and normalized radar scores.
        """
        # 1. Fetch Portfolio Items
        items_qs = PortfolioItem.objects.filter(user=user)
        if account_id and account_id != 'all':
            items_qs = items_qs.filter(account_id=account_id)
        
        if not items_qs.exists():
            return RiskAnalysisService._empty_response()

        # 2. Basic Portfolio Data
        tickers = list(items_qs.values_list('ticker', flat=True).distinct())
        
        # Latest Prices
        latest_prices = {}
        price_qs = DailyStockPrice.objects.filter(ticker__in=tickers).order_by('ticker', '-date').distinct('ticker')
        for p in price_qs:
            latest_prices[p.ticker] = Decimal(str(p.close))
            
        # Sector Info
        companies = Company.objects.filter(symbol__in=tickers)
        sector_map = {c.symbol: c.sector or 'Unknown' for c in companies}
        
        # 3. Calculate Weights (Concentration)
        holdings = []
        total_value = Decimal('0')
        sector_values = {}
        
        for item in items_qs:
            price = latest_prices.get(item.ticker, item.buy_price)
            value = Decimal(item.quantity) * price
            sector = sector_map.get(item.ticker, 'Unknown')
            
            holdings.append({
                'ticker': item.ticker,
                'quantity': item.quantity,
                'value': value,
                'sector': sector
            })
            total_value += value
            sector_values[sector] = sector_values.get(sector, Decimal('0')) + value
            
        if total_value == 0:
            return RiskAnalysisService._empty_response()

        # 4. Analyze Concentration & Liquidity
        alerts = []
        concentration_score = 1.0 # 1-10 (1 is low risk)
        max_stock_weight = 0
        
        for h in holdings:
            weight = (h['value'] / total_value) * 100
            h['weight'] = float(round(weight, 2))
            max_stock_weight = max(max_stock_weight, h['weight'])
            
            if weight > 20:
                alerts.append({
                    'type': 'CONCENTRATION',
                    'level': 'HIGH' if weight > 35 else 'MEDIUM',
                    'message': f"High concentration in {h['ticker']} ({h['weight']}% of portfolio)."
                })

        for sector, s_val in sector_values.items():
            s_weight = (s_val / total_value) * 100
            if s_weight > 30:
                alerts.append({
                    'type': 'SECTOR_RISK',
                    'level': 'HIGH' if s_weight > 50 else 'MEDIUM',
                    'message': f"Sector '{sector}' exceeds 30% of portfolio."
                })

        # Normalized Concentration Score (Max Weight based)
        # If max weight is 20%, score should be ~4-5. If 100%, score 10.
        concentration_score = min(10, max(1, (max_stock_weight / 10)))

        # 5. Liquidity Risk (Avg Volume analysis)
        # We look at 20-day Average Daily Volume (ADV)
        liquidity_score = 1.0
        max_days_to_liquidate = 0
        
        cutoff_date = timezone.now().date() - timedelta(days=30)
        adv_qs = DailyStockPrice.objects.filter(
            ticker__in=tickers, 
            date__gte=cutoff_date
        ).values('ticker').annotate(adv=Avg('volume'))
        
        adv_map = {item['ticker']: item['adv'] for item in adv_qs}
        
        for h in holdings:
            adv = adv_map.get(h['ticker'], 0)
            if not adv or adv == 0:
                # Flag as extreme liquidity risk if no volume data found recently
                h['days_to_liquidate'] = 99
                alerts.append({
                    'type': 'LIQUIDITY',
                    'level': 'HIGH',
                    'message': f"No recent volume data for {h['ticker']}. Liquidity risk high."
                })
                continue
            
            # Days to liquidate = Own Qty / (ADV * 0.1) -> assuming we can only sell 10% of ADV daily safely
            days = float(h['quantity']) / (float(adv) * 0.1)
            h['days_to_liquidate'] = round(days, 2)
            max_days_to_liquidate = max(max_days_to_liquidate, days)
            
            if days > 5:
                alerts.append({
                    'type': 'LIQUIDITY',
                    'level': 'HIGH' if days > 15 else 'MEDIUM',
                    'message': f"Liquidity Warning: It might take ~{h['days_to_liquidate']} days to exit {h['ticker']} safely."
                })

        # Normalized Liquidity Score
        # 1 day = 1, 10 days = 10
        liquidity_score = min(10, max(1, max_days_to_liquidate))

        # 6. Volatility Risk (Simplified from PortfolioService logic)
        volatility_score = 5.0 # Default/Mid
        try:
            cutoff_v = timezone.now().date() - timedelta(days=60)
            hist_qs = DailyStockPrice.objects.filter(
                ticker__in=tickers,
                date__gte=cutoff_v
            ).values('ticker', 'date', 'close').order_by('date')
            
            df = pd.DataFrame.from_records(hist_qs)
            if not df.empty:
                df['close'] = df['close'].astype(float)
                # Weighted volatility
                weighted_vol = 0
                for h in holdings:
                    df_t = df[df['ticker'] == h['ticker']]
                    if len(df_t) > 5:
                        vol = df_t['close'].pct_change().std() * (252**0.5) * 100
                        weighted_vol += (vol * float(h['weight'] / 100))
                
                # Normalize Volatility Score (0-60%) -> 1-10
                volatility_score = min(10, max(1, weighted_vol / 6))
        except:
            pass

        return {
            "radar_data": [
                {"axis": "Concentration", "value": round(concentration_score, 1), "fullMark": 10},
                {"axis": "Liquidity", "value": round(liquidity_score, 1), "fullMark": 10},
                {"axis": "Volatility", "value": round(volatility_score, 1), "fullMark": 10},
                {"axis": "Sector Diversification", "value": round(max(1, 10 - concentration_score), 1), "fullMark": 10}, # Inverse of concentration for visualization
                {"axis": "Systemic Risk", "value": 5.0, "fullMark": 10} # Placeholder
            ],
            "alerts": alerts,
            "holdings_metrics": holdings,
            "summary": {
                "total_value": float(total_value),
                "risk_level": "HIGH" if (concentration_score > 7 or liquidity_score > 7) else "MEDIUM" if (concentration_score > 4 or liquidity_score > 4) else "LOW"
            }
        }

    @staticmethod
    def _empty_response():
        return {
            "radar_data": [],
            "alerts": [],
            "holdings_metrics": [],
            "summary": {"total_value": 0, "risk_level": "LOW"}
        }
