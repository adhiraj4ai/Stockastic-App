import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from .models import DailyStockPrice
import warnings

# Skfolio (Existing)
from skfolio import RiskMeasure
from skfolio.optimization import MeanRisk, ObjectiveFunction, MaximumDiversification, RiskBudgeting

# PyPortfolioOpt (New)
try:
    from pypfopt import EfficientFrontier, risk_models, expected_returns
    from pypfopt import objective_functions
except ImportError:
    pass

# Riskfolio-Lib (New)
try:
    import riskfolio as rp
except ImportError:
    pass

def perform_portfolio_optimization(tickers, current_holdings=None, method='max_sharpe'):
    """
    Performs portfolio optimization using PyPortfolioOpt, Riskfolio-lib, and Skfolio.
    
    Methods:
    - 'max_sharpe': PyPortfolioOpt (Efficient Frontier)
    - 'min_vol': PyPortfolioOpt (Min Volatility)
    - 'hrp': Riskfolio-Lib (Hierarchical Risk Parity)
    - 'cvar': Riskfolio-Lib (Min Conditional Value at Risk)
    - 'max_diversification': Skfolio (Max Diversification Ratio)
    - 'risk_parity': Skfolio (Risk Budgeting)
    """
    if not tickers:
        return {"error": "No tickers provided"}

    # Handle single stock portfolio explicitly - 100% weight
    if len(tickers) == 1:
        ticker = tickers[0]
        latest_price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
        current_price = float(latest_price_obj.close) if latest_price_obj else 0
        
        weights = {ticker: 1.0}
        trades = []
        if current_holdings:
            holding = current_holdings.get(ticker, {'quantity': 0, 'price': 0})
            latest_price = holding['price'] if holding['price'] > 0 else current_price
            if latest_price > 0:
                total_value = sum(h['quantity'] * h['price'] for h in current_holdings.values())
                target_qty = total_value / latest_price
                diff = round(target_qty - holding['quantity'])
                if abs(diff) >= 1:
                    trades.append({
                        "ticker": ticker,
                        "action": "BUY" if diff > 0 else "SELL",
                        "quantity": abs(diff),
                        "price": float(latest_price),
                        "estimated_value": float(abs(diff) * latest_price)
                    })

        return {
            "success": True,
            "weights": weights,
            "metrics": {
                "expected_return": 0.0,
                "volatility": 0.0,
                "sharpe_ratio": 0.0,
                "max_drawdown": 0.0,
            },
            "trades": trades,
            "note": "Single stock portfolio."
        }

    # Fetch Data
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=730)
    prices_qs = DailyStockPrice.objects.filter(
        ticker__in=tickers,
        date__gte=start_date,
        date__lte=end_date
    ).values('ticker', 'date', 'close')

    df = pd.DataFrame(list(prices_qs))
    if df.empty:
        return {"error": "No historical data found"}

    df['close'] = df['close'].apply(float)
    
    try:
        df_pivoted = df.pivot(index='date', columns='ticker', values='close')
        df_pivoted = df_pivoted.ffill().dropna()
        if df_pivoted.empty or len(df_pivoted) < 20:
            return {"error": "Insufficient historical data (need 20+ days)"}
            
        returns = df_pivoted.pct_change().dropna()
        
        # --- Optimization Logic ---
        weight_map = {}
        metrics = {}
        note = ""

        # Dynamic max weight constraint (e.g., max 60-100% depending on N)
        # For HRP/Riskfolio we might let it be unconstrained or strictly long only
        
        if method in ['max_sharpe', 'min_vol'] and 'pypfopt' in globals():
            # Use PyPortfolioOpt
            mu = expected_returns.mean_historical_return(df_pivoted)
            S = risk_models.sample_cov(df_pivoted)
            
            ef = EfficientFrontier(mu, S)
            ef.add_constraint(objective_functions.L2_reg, gamma=0.1) # Regulation to avoid extreme corner solutions
            
            if method == 'max_sharpe':
                raw_weights = ef.max_sharpe()
                note = "Optimized via PyPortfolioOpt (Max Sharpe)"
            else: # min_vol
                raw_weights = ef.min_volatility()
                note = "Optimized via PyPortfolioOpt (Min Volatility)"
                
            weight_map = ef.clean_weights()
            perf = ef.portfolio_performance(verbose=False) # (return, vol, sharpe)
            metrics = {
                "expected_return": perf[0],
                "volatility": perf[1],
                "sharpe_ratio": perf[2],
                "max_drawdown": 0.0 # PyPfOpt doesn't calc this easily without backtest
            }

        elif method in ['hrp', 'cvar'] and 'rp' in globals():
            # Use Riskfolio-Lib
            port = rp.Portfolio(returns=returns)
            port.assets_stats(method_mu='hist', method_cov='hist', d=0.94)
            
            if method == 'hrp':
                # Hierarchical Risk Parity
                # Provide link: https://riskfolio-lib.readthedocs.io/en/latest/examples.html
                w = port.optimization(model='HRP', codependence='pearson', rm='MV', rf=0, link='single',leaf_order=True)
                note = "Optimized via Riskfolio-Lib (HRP - Hierarchical Clustering)"
                
            elif method == 'cvar':
                # Min Conditional Value at Risk
                # model='Classic', rm='CVaR', obj='MinRisk'
                w = port.optimization(model='Classic', rm='CVaR', obj='MinRisk', rf=0, l=0, hist=True)
                note = "Optimized via Riskfolio-Lib (Min CVaR - Conditional Value at Risk)"
                
            elif method == 'cdar':
                # Min CDaR (Conditional Drawdown at Risk)
                # rm='CDaR'
                w = port.optimization(model='Classic', rm='CDaR', obj='MinRisk', rf=0, l=0, hist=True)
                note = "Optimized via Riskfolio-Lib (Min CDaR - Minimizes Deep Drawdowns)"

            weight_map = w.to_dict()['weights'] # Riskfolio returns DataFrame with 'weights' col
            
            # Predict metrics (Riskfolio has specific reporting)
            # Simple approximation using historical mean/cov
            mu = returns.mean() * 252
            cov = returns.cov() * 252
            w_arr = np.array([weight_map[t] for t in returns.columns])
            
            exp_ret = np.dot(w_arr, mu)
            vol = np.sqrt(np.dot(w_arr.T, np.dot(cov, w_arr)))
            sharpe = exp_ret / vol if vol > 0 else 0
            
            metrics = {
                "expected_return": exp_ret,
                "volatility": vol,
                "sharpe_ratio": sharpe,
                "max_drawdown": 0.0
            }

        elif method == 'equal':
            # Equal Weighted (1/N)
            n = len(tickers)
            weight_map = {t: 1.0/n for t in tickers}
            note = "Equal Weighted (1/N) Baseline Strategy"
            
            # Calculate metrics
            w_arr = np.array([1.0/n] * n)
            mu = returns.mean() * 252
            cov = returns.cov() * 252
            exp_ret = np.dot(w_arr, mu)
            vol = np.sqrt(np.dot(w_arr.T, np.dot(cov, w_arr)))
            sharpe = exp_ret / vol if vol > 0 else 0
            metrics = {
                "expected_return": exp_ret,
                "volatility": vol,
                "sharpe_ratio": sharpe,
                "max_drawdown": 0.0
            }

        else: # Default Fallback to Skfolio for others or if libs missing
            # max_diversification, risk_parity
            from skfolio.optimization import MeanRisk, ObjectiveFunction, MaximumDiversification, RiskBudgeting
            from skfolio import RiskMeasure
            
            dynamic_max_weight = max(0.6, min(0.95, 1.3 / len(tickers)))
            
            if method == 'max_diversification':
                model = MaximumDiversification(max_weights=dynamic_max_weight)
                note = "Optimized via Skfolio (Max Diversification)"
            elif method == 'risk_parity':
                model = RiskBudgeting(risk_measure=RiskMeasure.VARIANCE, max_weights=dynamic_max_weight)
                note = "Optimized via Skfolio (Risk Parity)"
            else:
                 # Fallback Max Sharpe via Skfolio if PyPfOpt missing
                model = MeanRisk(risk_measure=RiskMeasure.VARIANCE, objective_function=ObjectiveFunction.MAXIMIZE_RATIO, max_weights=dynamic_max_weight)
                note = "Optimized via Skfolio (Max Sharpe Fallback)"
            
            model.fit(returns)
            weights_sk = dict(zip(df_pivoted.columns, model.weights_))
            weight_map = weights_sk
            
            # Prediction
            pred = model.predict(returns)
            metrics = {
                "expected_return": float(pred.annualized_mean),
                "volatility": float(pred.annualized_standard_deviation),
                "sharpe_ratio": float(pred.annualized_sharpe_ratio),
                "max_drawdown": float(pred.max_drawdown),
            }

        # --- Calculation of Trades (Common) ---
        trades = []
        if current_holdings:
            total_value = sum(h['quantity'] * h['price'] for h in current_holdings.values())
            
            for ticker, weight in weight_map.items():
                holding = current_holdings.get(ticker, {'quantity': 0, 'price': 0})
                current_price = holding['price']
                if current_price <= 0 and ticker in df_pivoted.columns:
                    current_price = df_pivoted[ticker].iloc[-1]
                
                if current_price > 0:
                    target_value = total_value * weight
                    current_qty = holding['quantity']
                    target_qty = target_value / current_price
                    diff_qty = round(target_qty - current_qty)
                    
                    if abs(diff_qty) >= 1:
                        trades.append({
                            "ticker": ticker,
                            "action": "BUY" if diff_qty > 0 else "SELL",
                            "quantity": abs(diff_qty),
                            "price": float(current_price),
                            "estimated_value": float(abs(diff_qty) * current_price)
                        })

        return {
            "success": True,
            "weights": {t: float(w) for t, w in weight_map.items()},
            "metrics": metrics,
            "trades": sorted(trades, key=lambda x: x['estimated_value'], reverse=True),
            "note": note
        }

    except Exception as e:
        print(f"[OPTIMIZATION FATAL] {str(e)}")
        import traceback
        traceback.print_exc()
        return {"error": f"Optimization failed: {str(e)}"}
