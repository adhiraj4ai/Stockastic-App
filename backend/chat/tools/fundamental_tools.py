from typing import Dict, Any, List
from datetime import date, timedelta
from .base import BaseTool, ToolParameter
from ..db_utils import get_reference_date

class GetCompanyFundamentalsTool(BaseTool):
    """Get fundamental data for a company"""
    
    @property
    def name(self) -> str:
        return "get_company_fundamentals"
    
    @property
    def description(self) -> str:
        return "Get fundamental data for a company including sector, market cap, P/E ratio, and booking value."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol (e.g., Nabil)", required=True),
        ]
    
    def execute(self, user, symbol: str) -> Dict[str, Any]:
        from stocks.models.fundamentals import StockFundamental
        
        try:
            fund = StockFundamental.objects.get(ticker=symbol.upper())
            
            return {
                "symbol": fund.ticker,
                "company_name": fund.company_name,
                "sector": fund.sector,
                "market_cap": float(fund.market_cap) if fund.market_cap else None,
                "pe_ratio": float(fund.pe_ratio) if fund.pe_ratio else None,
                "eps": float(fund.eps) if fund.eps else None,
                "book_value": float(fund.book_value) if fund.book_value else None,
                "peg_ratio": float(fund.peg_ratio) if fund.peg_ratio else None,
                "dividend_yield": float(fund.dividend_yield) if fund.dividend_yield else None,
                "ro_equity": float(fund.ro_equity) if fund.ro_equity else None,
                "fifty_two_week_high": float(fund.fifty_two_week_high) if fund.fifty_two_week_high else None,
                "fifty_two_week_low": float(fund.fifty_two_week_low) if fund.fifty_two_week_low else None,
            }
        except StockFundamental.DoesNotExist:
            return {"error": f"No fundamental data found for {symbol}"}

class GetStockDividendsTool(BaseTool):
    """Get dividend history for a stock"""
    
    @property
    def name(self) -> str:
        return "get_stock_dividends"
    
    @property
    def description(self) -> str:
        return "Get historical dividend data (bonus shares and cash dividends) for a stock symbol."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol", required=True),
        ]
    
    def execute(self, user, symbol: str) -> Dict[str, Any]:
        from stocks.models.fundamentals import FinancialReport, Dividend
        from django.db.models import Q
        
        symbol = symbol.upper()
        
        # Fetch from FinancialReport
        financial_dividends = FinancialReport.objects.filter(
            ticker=symbol
        ).filter(
            Q(bonus_share__gt=0) | Q(cash_dividend__gt=0) | Q(dividend_announced_date__isnull=False)
        ).order_by('-fiscal_year', '-quarter')
        
        results = []
        seen_fy = set()
        
        for report in financial_dividends:
            if report.fiscal_year in seen_fy:
                continue
                
            bonus = float(report.bonus_share or 0)
            cash = float(report.cash_dividend or 0)
            
            results.append({
                'fiscal_year': report.fiscal_year,
                'bonus_percent': bonus,
                'cash_percent': cash,
                'total_percent': bonus + cash,
                'announced_date': report.dividend_announced_date.isoformat() if report.dividend_announced_date else None,
            })
            seen_fy.add(report.fiscal_year)
            
        # Also fetch from Dividend model for legacy data
        dividend_objs = Dividend.objects.filter(ticker=symbol).order_by('-fiscal_year')
        for d in dividend_objs:
            if d.fiscal_year not in seen_fy:
                results.append({
                    'fiscal_year': d.fiscal_year,
                    'bonus_percent': float(d.bonus_percent),
                    'cash_percent': float(d.cash_percent),
                    'total_percent': float(d.total_percent),
                    'announced_date': d.date.isoformat() if d.date else None,
                })
                seen_fy.add(d.fiscal_year)
                
        results.sort(key=lambda x: x['fiscal_year'], reverse=True)
        
        return {
            "symbol": symbol,
            "dividends": results
        }

class GetFinancialRatiosTool(BaseTool):
    """Get latest financial ratios"""
    
    @property
    def name(self) -> str:
        return "get_financial_ratios"
    
    @property
    def description(self) -> str:
        return "Get detailed financial ratios from the latest quarterly report."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbol", type="string", description="Stock symbol", required=True),
        ]
    
    def execute(self, user, symbol: str) -> Dict[str, Any]:
        from stocks.models.fundamentals import FinancialReport
        
        # Get latest report
        report = FinancialReport.objects.filter(ticker=symbol.upper()).order_by('-fiscal_year', '-quarter').first()
        
        if not report:
            return {"error": f"No financial reports found for {symbol}"}
            
        return {
            "symbol": report.ticker,
            "period": f"{report.fiscal_year} Q{report.quarter}",
            "eps": float(report.eps) if report.eps else None,
            "pe_ratio": float(report.pe_ratio) if report.pe_ratio else None,
            "book_value": float(report.book_value) if report.book_value else None,
            "return_on_equity": float(report.return_on_equity) if report.return_on_equity else None,
            "net_profit": float(report.net_profit) if report.net_profit else None,
            "revenue": float(report.revenue) if report.revenue else None,
            "reserves": float(report.reserves_and_surplus) if report.reserves_and_surplus else None,
            "paid_up_capital": float(report.paid_up_capital) if report.paid_up_capital else None,
        }

class CompareStocksTool(BaseTool):
    """Compare multiple stocks side-by-side fundamentals"""
    
    @property
    def name(self) -> str:
        return "compare_stocks_fundamentals"
    
    @property
    def description(self) -> str:
        return "Compare fundamental metrics (P/E, EPS, ROE, Market Cap) for multiple stock symbols side-by-side."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="symbols", type="array", description="List of stock symbols to compare", required=True),
        ]
    
    def execute(self, user, symbols: List[str]) -> Dict[str, Any]:
        from stocks.models.fundamentals import StockFundamental
        
        comparison = []
        for symbol in symbols:
            try:
                fund = StockFundamental.objects.get(ticker=symbol.upper())
                comparison.append({
                    "symbol": fund.ticker,
                    "company": fund.company_name,
                    "market_cap": float(fund.market_cap) if fund.market_cap else None,
                    "pe": float(fund.pe_ratio) if fund.pe_ratio else None,
                    "eps": float(fund.eps) if fund.eps else None,
                    "pb": float(fund.price_to_book) if fund.price_to_book else None,
                    "roe": float(fund.ro_equity) if fund.ro_equity else None,
                    "div_yield": float(fund.dividend_yield) if fund.dividend_yield else None
                })
            except StockFundamental.DoesNotExist:
                continue
        
        return {
            "comparison": comparison,
            "count": len(comparison)
        }

class GetCorporateActionsTool(BaseTool):
    """List recent corporate actions (Dividends, Bonuses, Rights)"""
    
    @property
    def name(self) -> str:
        return "get_recent_corporate_actions"
    
    @property
    def description(self) -> str:
        return "Get a list of the most recent corporate action announcements (dividends, bonuses, book closures) across the market."
    
    @property
    def parameters(self) -> List[ToolParameter]:
        return [
            ToolParameter(name="days", type="number", description="Number of past days to look for announcements", required=False),
        ]
    
    def execute(self, user, days: int = 30) -> Dict[str, Any]:
        from stocks.models.fundamentals import FinancialReport, Dividend
        from django.db.models import Q
        from datetime import date, timedelta
        
        start_date = get_reference_date() - timedelta(days=days)
        
        # Recent from FinancialReport
        reports = FinancialReport.objects.filter(
            Q(dividend_announced_date__gte=start_date) | Q(dividend_book_close_date__gte=start_date)
        ).order_by('-dividend_announced_date')[:20]
        
        actions = []
        for r in reports:
            actions.append({
                "symbol": r.ticker,
                "type": "Dividend/Bonus",
                "fiscal_year": r.fiscal_year,
                "bonus": float(r.bonus_share or 0),
                "cash": float(r.cash_dividend or 0),
                "announced_date": r.dividend_announced_date.isoformat() if r.dividend_announced_date else None,
                "book_close": r.dividend_book_close_date.isoformat() if r.dividend_book_close_date else None
            })
            
        return {
            "period_days": days,
            "announcements": actions,
            "count": len(actions)
        }
