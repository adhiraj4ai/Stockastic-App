from __future__ import annotations

# particular -> (json_section, subsection, key) in the FinancialReport JSON
PARTICULAR_TO_PATH: dict[str, tuple[str, str, str]] = {
    "Property,PlantAndEquipment": ("balance_sheet", "NON_CURRENT_ASSETS", "ppe"),
    "Wip(ProjectWorkInProgress,UnderDevelopment)": ("balance_sheet", "NON_CURRENT_ASSETS", "cwip"),
    "InvestmentAndFinancialAssets": ("balance_sheet", "NON_CURRENT_ASSETS", "financial_assets"),
    "TotalNon-CurrentAssets": ("balance_sheet", "TOTALS", "non_current_assets"),
    "TotalCurrentAssets": ("balance_sheet", "TOTALS", "current_assets"),
    "TotalAssets": ("balance_sheet", "TOTALS", "total_assets"),
    "ShareCapital": ("balance_sheet", "LIABILITIES", "share_capital"),
    "ReserveAndSurplus": ("balance_sheet", "LIABILITIES", "reserves"),
    "TotalEquity": ("balance_sheet", "TOTALS", "total_equity"),
    "LongTermLoans&Borrowings": ("balance_sheet", "LIABILITIES", "long_term_loans"),
    "TotalNon-CurrentLiabilities": ("balance_sheet", "TOTALS", "non_current_liabilities"),
    "ShortTermLoans&Borrowings": ("balance_sheet", "LIABILITIES", "short_term_loans"),
    "TotalCurrentLiabilities": ("balance_sheet", "TOTALS", "current_liabilities"),
    "TotalLiabilities": ("balance_sheet", "TOTALS", "total_liabilities"),
    "TotalEquityAndLiabilities": ("balance_sheet", "TOTALS", "total_equity_and_liabilities"),
    "Revenue(PowerSales)": ("profit_loss", "PL", "revenue"),
    "Cogs(Generation,Distribution,Royalty&ProjectExpenses)": ("profit_loss", "PL", "cost_of_sales"),
    "GrossProfit": ("profit_loss", "PL", "gross_profit"),
    "Depreciation": ("profit_loss", "PL", "depreciation"),
    "AdministrativeAndOtherOperatingExpenses": ("profit_loss", "PL", "admin_expenses"),
    "ProfitFromOperation(OperatingProfit)": ("profit_loss", "PL", "operating_profit"),
    "FinanceCost": ("profit_loss", "PL", "finance_costs"),
    "ProfitBeforeTax": ("profit_loss", "PL", "profit_before_tax"),
    "ProfitForTheYear(NetProfit)": ("profit_loss", "PL", "net_profit"),
    "CashFlowsFromOperatingActivities": ("cash_flow", "CF", "operating_cash_flow"),
    "CashFlowsFromInvestingActivities": ("cash_flow", "CF", "investing_cash_flow"),
    "CashFlowsFromFinancingActivities": ("cash_flow", "CF", "financing_cash_flow"),
}

# particular -> scalar column on FinancialReport (Decimal model fields)
SCALAR_PARTICULARS: dict[str, str] = {
    "ShareCapital": "paid_up_capital",
    "ReserveAndSurplus": "reserves_and_surplus",
    "Revenue(PowerSales)": "revenue",
    "ProfitFromOperation(OperatingProfit)": "operating_profit",
    "ProfitForTheYear(NetProfit)": "net_profit",
}
