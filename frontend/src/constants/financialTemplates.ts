export interface FinancialParticular {
    label: string;
    key: string;
    description?: string;
}

export interface FinancialSection {
    label: string;
    key: string;
    particulars: FinancialParticular[];
}

export interface FinancialTemplate {
    id: string;
    label: string;
    sections: {
        balance_sheet: FinancialSection[];
        profit_loss: FinancialSection[];
        cash_flow?: FinancialSection[];
    };
}

export const FINANCIAL_TEMPLATES: Record<string, FinancialTemplate> = {
    BANK: {
        id: 'BANK',
        label: 'Commercial Bank',
        sections: {
            balance_sheet: [
                {
                    label: 'ASSETS',
                    key: 'ASSETS',
                    particulars: [
                        { label: 'Cash and Cash Equivalent', key: 'cash_equivalent' },
                        { label: 'Due From Nepal Rastra Bank', key: 'due_from_nrb' },
                        { label: 'Placement With BFIs', key: 'placement_bfis' },
                        { label: 'Derivate Financial Instruments', key: 'derivative_assets' },
                        { label: 'Other Trading Assets', key: 'trading_assets' },
                        { label: 'Loan and Advances To BFIs', key: 'loans_bfis' },
                        { label: 'Loans and Advances To Customers', key: 'loans_customers' },
                        { label: 'Investment Securities', key: 'investment_securities' },
                        { label: 'Current Tax Assets', key: 'current_tax_assets' },
                        { label: 'Investment In Subsidiaries', key: 'subsidiaries' },
                        { label: 'Investment In Associates', key: 'associates' },
                        { label: 'Investment Property', key: 'investment_property' },
                        { label: 'Property and Equipment', key: 'property_equipment' },
                        { label: 'Goodwill and Intangible Assets', key: 'intangible_assets' },
                        { label: 'Deferred Tax Assets', key: 'deferred_tax_assets' },
                        { label: 'Other Assets', key: 'other_assets' },
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                },
                {
                    label: 'CAPITAL & LIABILITIES',
                    key: 'LIABILITIES',
                    particulars: [
                        { label: 'Due To Bank and Financial Institutions', key: 'due_to_bfis' },
                        { label: 'Due To Nepal Rastra Bank', key: 'due_to_nrb' },
                        { label: 'Derivate Financial Instruments', key: 'derivative_liabilities' },
                        { label: 'Deposits From Customers', key: 'deposits_customers' },
                        { label: 'Borrowings', key: 'borrowings' },
                        { label: 'Current Tax Liabilities', key: 'current_tax_liabilities' },
                        { label: 'Provisions', key: 'provisions' },
                        { label: 'Deferred Tax Liabilities', key: 'deferred_tax_liabilities' },
                        { label: 'Other Liabilities', key: 'other_liabilities' },
                        { label: 'Debt Securities Issued', key: 'debt_securities' },
                        { label: 'Subordinated Liabilities', key: 'subordinated_liabilities' },
                        { label: 'Total Liabilities', key: 'total_liabilities' },
                    ]
                },
                {
                    label: 'EQUITY',
                    key: 'EQUITY',
                    particulars: [
                        { label: 'Share Capital', key: 'share_capital' },
                        { label: 'Share Premium', key: 'share_premium' },
                        { label: 'Retained Earnings', key: 'retained_earnings' },
                        { label: 'Reserves', key: 'reserves_reserves' },
                        { label: 'Total Equity', key: 'total_equity' },
                        { label: 'Total Liabilities & Equity', key: 'total_liabilities_equity' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'INCOME',
                    key: 'INCOME',
                    particulars: [
                        { label: 'Interest Income', key: 'interest_income' },
                        { label: 'Interest Expense', key: 'interest_expense' },
                        { label: 'Net Interest Income', key: 'net_interest_income' },
                        { label: 'Fee and Commission Income', key: 'fee_income' },
                        { label: 'Fee and Commission Expense', key: 'fee_expense' },
                        { label: 'Net Fee and Commission Income', key: 'net_fee_income' },
                        { label: 'Net Interest, Fee & Commission Income', key: 'net_int_fee_income' },
                        { label: 'Net Trading Income', key: 'trading_income' },
                        { label: 'Other Operating Income', key: 'other_operating_income' },
                        { label: 'Total Operating Income', key: 'total_operating_income' },
                    ]
                },
                {
                    label: 'EXPENSES & LOSSES',
                    key: 'EXPENSES',
                    particulars: [
                        { label: 'Impairment Charge/(Reversal) for Loans', key: 'impairment_charge' },
                        { label: 'Net Operating Income', key: 'net_operating_income' },
                        { label: 'Personnel Expenses', key: 'personnel_expenses' },
                        { label: 'Other Operating Expenses', key: 'other_operating_expenses' },
                        { label: 'Depreciation & Amortisation', key: 'depreciation' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Non Operating Income', key: 'non_operating_income' },
                        { label: 'Non Operating Expense', key: 'non_operating_expense' },
                        { label: 'Profit Before Income Tax', key: 'pbt' },
                        { label: 'Income Tax Expenses', key: 'tax' },
                        { label: 'Profit/Loss For The Period', key: 'net_profit' },
                    ]
                },
                {
                    label: 'REGULATORY & OTHERS',
                    key: 'REGULATORY',
                    particulars: [
                        { label: 'Credit To Deposit Ratio (%)', key: 'cd_ratio' },
                        { label: 'NPL to Total Loans (%)', key: 'npl_ratio' },
                        { label: 'Total Loan Loss Provision to Total NPL (%)', key: 'loan_loss_provision_ratio' },
                        { label: 'Liquidity (CRR) (%)', key: 'liquidity_crr' },
                        { label: 'Cost of Funds (%)', key: 'cost_of_funds' },
                        { label: 'Base Rate (%)', key: 'base_rate' },
                        { label: 'Interest Rate Spread (%)', key: 'spread' },
                        { label: 'Core Capital - Tier 1 (%)', key: 'core_capital' },
                        { label: 'Supplementary Capital (%)', key: 'supplementary_capital' },
                        { label: 'Total Capital Fund (%)', key: 'capital_fund' },
                        { label: 'Total No. of Employees', key: 'total_employees' },
                        { label: 'No. of Branches', key: 'branches' },
                        { label: 'No. of ATMs', key: 'atms' },
                    ]
                }
            ],
            cash_flow: [
                {
                    label: 'OPERATING ACTIVITIES',
                    key: 'OPERATING',
                    particulars: [
                        { label: 'Interest Received', key: 'interest_received' },
                        { label: 'Fees and Other Income Received', key: 'fees_received' },
                        { label: 'Receipts From Other Operating Activities', key: 'other_receipts' },
                        { label: 'Interest Paid', key: 'interest_paid' },
                        { label: 'Commission and Fees Paid', key: 'fees_paid' },
                        { label: 'Cash Payment To Employees', key: 'employee_payments' },
                        { label: 'Other Expense Paid', key: 'other_payments' },
                        { label: 'Operating Cash Before Changes', key: 'operating_cash_before_changes' },
                        { label: 'Change in Due From NRB', key: 'change_nrb' },
                        { label: 'Change in Placements with BFIs', key: 'change_placements' },
                        { label: 'Change in Trading Assets', key: 'change_trading_assets' },
                        { label: 'Change in Loans to BFIs', key: 'change_loans_bfis' },
                        { label: 'Change in Loans to Customers', key: 'change_loans_customers' },
                        { label: 'Change in Other Assets', key: 'change_other_assets' },
                        { label: 'Change in Due To BFIs', key: 'change_due_bfis' },
                        { label: 'Change in Due To NRB', key: 'change_due_nrb' },
                        { label: 'Change in Deposits From Customers', key: 'change_deposits' },
                        { label: 'Change in Borrowings', key: 'change_borrowings' },
                        { label: 'Change in Other Liabilities', key: 'change_other_liabilities' },
                        { label: 'Operating Cash Before Tax', key: 'operating_cash_before_tax' },
                        { label: 'Income Taxes Paid', key: 'tax_paid' },
                        { label: 'Net Cash From Operating Activities', key: 'net_operating_cash' },
                    ]
                },
                {
                    label: 'INVESTING ACTIVITIES',
                    key: 'INVESTING',
                    particulars: [
                        { label: 'Purchase Of Investment Securities', key: 'purchase_investments' },
                        { label: 'Sale Of Investment Securities', key: 'sale_investments' },
                        { label: 'Purchase Of Property and Equipment', key: 'purchase_ppe' },
                        { label: 'Sale Of Property and Equipment', key: 'sale_ppe' },
                        { label: 'Purchase Of Intangible Assets', key: 'purchase_intangibles' },
                        { label: 'Sale Of Intangible Assets', key: 'sale_intangibles' },
                        { label: 'Net Cash Used In Investing Activities', key: 'net_investing_cash' },
                    ]
                },
                {
                    label: 'FINANCING ACTIVITIES',
                    key: 'FINANCING',
                    particulars: [
                        { label: 'Receipt From Issue Of Debt Securities', key: 'issue_debt_securities' },
                        { label: 'Repayment Of Debt Securities', key: 'repay_debt_securities' },
                        { label: 'Receipt From Issue Of Subordinated Liabilities', key: 'issue_subordinated' },
                        { label: 'Repayment Of Subordinated Liabilities', key: 'repay_subordinated' },
                        { label: 'Receipt From Issue Of Shares', key: 'issue_shares' },
                        { label: 'Dividends Paid', key: 'dividends_paid' },
                        { label: 'Net Cash From Financing Activities', key: 'net_financing_cash' },
                    ]
                },
                {
                    label: 'SUMMARY',
                    key: 'SUMMARY',
                    particulars: [
                        { label: 'Net Increase (Decrease) In Cash', key: 'net_change_cash' },
                        { label: 'Cash At Beginning Of Period', key: 'cash_beginning' },
                        { label: 'Cash At End Of Period', key: 'cash_ending' },
                    ]
                }
            ]
        }
    },
    BANK_QUARTERLY: {
        id: 'BANK_QUARTERLY',
        label: 'Commercial Bank (Quarterly)',
        sections: {
            balance_sheet: [
                {
                    label: 'QUARTERLY SUMMARY',
                    key: 'SUMMARY',
                    particulars: [
                        { label: 'Placements with BFIs', key: 'placement_bfis' },
                        { label: 'Loans to Customers', key: 'loans_customers' },
                        { label: 'Investment Securities', key: 'investment_securities' },
                        { label: 'Total Assets', key: 'total_assets' },
                        { label: 'Deposits from Customers', key: 'deposits_customers' },
                        { label: 'Borrowings', key: 'borrowings' },
                        { label: 'Paid Up Capital', key: 'paid_up_capital' },
                        { label: 'Reserves and Surplus', key: 'reserves' },
                        { label: 'Total Equity', key: 'total_equity' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'QUARTERLY P&L',
                    key: 'PL',
                    particulars: [
                        { label: 'Interest Income', key: 'interest_income' },
                        { label: 'Net Interest Income', key: 'net_interest_income' },
                        { label: 'Net Fee & Commission Income', key: 'net_fee_income' },
                        { label: 'Total Operating Income', key: 'total_operating_income' },
                        { label: 'Impairment Charges', key: 'impairment_charges' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Net Profit', key: 'net_profit' },
                        { label: 'Distributable Profit', key: 'distributable_profit' },
                    ]
                },
                {
                    label: 'KEY RATIOS',
                    key: 'RATIOS',
                    particulars: [
                        { label: 'Annualized EPS', key: 'eps_annualized' },
                        { label: 'Non-Performing Loan (NPL)', key: 'npl' },
                        { label: 'Cost of Funds', key: 'cost_of_funds' },
                        { label: 'Credit to Deposit Ratio (CD)', key: 'cd_ratio' },
                        { label: 'Base Rate', key: 'base_rate' },
                        { label: 'Interest Spread', key: 'spread' },
                        { label: 'Net Worth Per Share', key: 'book_value' },
                    ]
                }
            ]
        }
    },
    HYDRO: {
        id: 'HYDRO',
        label: 'Hydropower',
        sections: {
            balance_sheet: [
                {
                    label: 'NON-CURRENT ASSETS',
                    key: 'NON_CURRENT_ASSETS',
                    particulars: [
                        { label: 'Property, Plant and Equipment', key: 'ppe' },
                        { label: 'Capital Work in Progress', key: 'cwip' },
                        { label: 'Investment and Financial Assets', key: 'financial_assets' },
                        { label: 'Intangible Assets', key: 'intangible_assets' },
                        { label: 'Other Non-Current Assets', key: 'other_nc_assets' },
                    ]
                },
                {
                    label: 'CURRENT ASSETS',
                    key: 'CURRENT_ASSETS',
                    particulars: [
                        { label: 'Inventories', key: 'inventories' },
                        { label: 'Trade Receivables', key: 'receivables' },
                        { label: 'Cash and Cash Equivalents', key: 'cash' },
                        { label: 'Other Current Assets', key: 'other_c_assets' },
                    ]
                },
                {
                    label: 'EQUITY & LIABILITIES',
                    key: 'LIABILITIES',
                    particulars: [
                        { label: 'Share Capital', key: 'share_capital' },
                        { label: 'Reserve and Surplus', key: 'reserves' },
                        { label: 'Long Term Loans & Borrowings', key: 'long_term_loans' },
                        { label: 'Short Term Loans & Borrowings', key: 'short_term_loans' },
                        { label: 'Trade Payables', key: 'payables' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'PROFIT/LOSS STATEMENT',
                    key: 'PL',
                    particulars: [
                        { label: 'Revenue from Operations', key: 'revenue' },
                        { label: 'Cost of Sales', key: 'cost_of_sales' },
                        { label: 'Gross Profit', key: 'gross_profit' },
                        { label: 'Other Income', key: 'other_income' },
                        { label: 'Administrative Expenses', key: 'admin_expenses' },
                        { label: 'Finance Costs', key: 'finance_costs' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Net Profit', key: 'net_profit' },
                    ]
                }
            ]
        }
    },
    INSURANCE: {
        id: 'INSURANCE',
        label: 'Insurance',
        sections: {
            balance_sheet: [
                {
                    label: 'ASSETS',
                    key: 'ASSETS',
                    particulars: [
                        { label: 'Investments', key: 'investments' },
                        { label: 'Loans and Advances', key: 'loans_advances' },
                        { label: 'Cash and Bank Balances', key: 'cash_bank' },
                        { label: 'Fixed Assets', key: 'fixed_assets' },
                        { label: 'Insurance Receivables', key: 'insurance_receivables' },
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                },
                {
                    label: 'LIABILITIES & EQUITY',
                    key: 'LIABILITIES',
                    particulars: [
                        { label: 'Share Capital', key: 'share_capital' },
                        { label: 'Insurance Fund', key: 'insurance_fund' },
                        { label: 'Reserves and Surplus', key: 'reserves' },
                        { label: 'Unpaid Dividends', key: 'unpaid_dividends' },
                        { label: 'Provisions', key: 'provisions' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'REVENUE ACCOUNT',
                    key: 'REVENUE',
                    particulars: [
                        { label: 'Net Premium', key: 'net_premium' },
                        { label: 'Income from Investment/Loans', key: 'investment_income' },
                        { label: 'Net Claims Paid', key: 'claims_paid' },
                        { label: 'Commission/Administrative Expenses', key: 'expenses' },
                        { label: 'Net Profit/Loss', key: 'net_profit' },
                    ]
                }
            ]
        }
    },
    MANUFACTURING: {
        id: 'MANUFACTURING',
        label: 'Manufacturing',
        sections: {
            balance_sheet: [
                {
                    label: 'ASSETS',
                    key: 'ASSETS',
                    particulars: [
                        { label: 'Fixed Assets (Net)', key: 'fixed_assets' },
                        { label: 'Current Assets', key: 'current_assets' },
                        { label: 'Inventories', key: 'inventories' },
                        { label: 'Trade Debtors', key: 'debtors' },
                        { label: 'Cash and Bank', key: 'cash_bank' },
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                },
                {
                    label: 'LIABILITIES',
                    key: 'LIABILITIES',
                    particulars: [
                        { label: 'Share Capital', key: 'share_capital' },
                        { label: 'Reserves and Surplus', key: 'reserves' },
                        { label: 'Secured Loans', key: 'secured_loans' },
                        { label: 'Unsecured Loans', key: 'unsecured_loans' },
                        { label: 'Current Liabilities', key: 'current_liabilities' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'PROFIT/LOSS STATEMENT',
                    key: 'PL',
                    particulars: [
                        { label: 'Sales/Revenue', key: 'revenue' },
                        { label: 'Cost of Goods Sold', key: 'cogs' },
                        { label: 'Gross Profit', key: 'gross_profit' },
                        { label: 'Operating Expenses', key: 'operating_expenses' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Net Profit After Tax', key: 'net_profit' },
                    ]
                }
            ]
        }
    },
    HOTEL: {
        id: 'HOTEL',
        label: 'Hotels & Tourism',
        sections: {
            balance_sheet: [
                {
                    label: 'NON-CURRENT ASSETS',
                    key: 'NON_CURRENT_ASSETS',
                    particulars: [
                        { label: 'Property, Plant and Equipment', key: 'ppe' },
                        { label: 'Investments', key: 'investments' },
                        { label: 'Capital Work In Progress', key: 'cwip' },
                        { label: 'Total Non-Current Assets', key: 'total_nc_assets' },
                    ]
                },
                {
                    label: 'CURRENT ASSETS',
                    key: 'CURRENT_ASSETS',
                    particulars: [
                        { label: 'Inventories', key: 'inventories' },
                        { label: 'Cash and Cash Equivalents', key: 'cash' },
                        { label: 'Financial Assets', key: 'financial_assets' },
                        { label: 'Total Current Assets', key: 'total_c_assets' },
                    ]
                },
                {
                    label: 'TOTAL',
                    key: 'TOTAL_ASSETS',
                    particulars: [
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                },
                {
                    label: 'EQUITY',
                    key: 'EQUITY',
                    particulars: [
                        { label: 'Share Capital', key: 'share_capital' },
                        { label: 'Reserve and Surplus', key: 'reserves' },
                        { label: 'Total Equity', key: 'total_equity' },
                    ]
                },
                {
                    label: 'NON-CURRENT LIABILITIES',
                    key: 'NON_CURRENT_LIABILITIES',
                    particulars: [
                        { label: 'Long Term Loans & Borrowings', key: 'long_term_loans' },
                        { label: 'Total Non-Current Liabilities', key: 'total_nc_liabilities' },
                    ]
                },
                {
                    label: 'CURRENT LIABILITIES',
                    key: 'CURRENT_LIABILITIES',
                    particulars: [
                        { label: 'Short Term Loans & Borrowings', key: 'short_term_loans' },
                        { label: 'Total Current Liabilities', key: 'total_c_liabilities' },
                    ]
                },
                {
                    label: 'EQUITY & LIABILITIES TOTAL',
                    key: 'TOTAL_EQUITY_LIABILITIES',
                    particulars: [
                        { label: 'Total Liabilities', key: 'total_liabilities' },
                        { label: 'Total Equity and Liabilities', key: 'total_equity_liabilities' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'PROFIT/LOSS STATEMENT',
                    key: 'PL',
                    particulars: [
                        { label: 'Revenue From Operation (Sales)', key: 'revenue' },
                        { label: 'Cost of Goods Sold', key: 'cogs' },
                        { label: 'Gross Profit', key: 'gross_profit' },
                        { label: 'Employee Benefits Expense', key: 'employee_expenses' },
                        { label: 'Depreciation & Amortization', key: 'depreciation' },
                        { label: 'Administrative and Other Operating Expenses', key: 'admin_expenses' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Finance Cost', key: 'finance_costs' },
                        { label: 'Profit Before Tax', key: 'pbt' },
                        { label: 'Income Tax Expenses', key: 'tax' },
                        { label: 'Net Profit', key: 'net_profit' },
                    ]
                }
            ],
            cash_flow: [
                {
                    label: 'CASH FLOW STATEMENT',
                    key: 'CF',
                    particulars: [
                        { label: 'Cash Flows From Operating Activities', key: 'operating_cash_flow' },
                        { label: 'Cash Flows From Investing Activities', key: 'investing_cash_flow' },
                        { label: 'Cash Flows From Financing Activities', key: 'financing_cash_flow' },
                    ]
                }
            ]
        }
    },
    HOTEL_QUARTERLY: {
        id: 'HOTEL_QUARTERLY',
        label: 'Hotels & Tourism (Quarterly)',
        sections: {
            balance_sheet: [
                {
                    label: 'QUARTERLY FINANCIAL SUMMARY',
                    key: 'SUMMARY',
                    particulars: [
                        { label: 'Paid Up Capital', key: 'paid_up_capital' },
                        { label: 'Reserve and Surplus', key: 'reserves' },
                        { label: 'Total Equity', key: 'total_equity' },
                        { label: 'Loans and Borrowings', key: 'loans_borrowings' },
                        { label: 'Current Liabilities', key: 'current_liabilities' },
                        { label: 'Current Assets', key: 'current_assets' },
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'QUARTERLY PROFIT/LOSS',
                    key: 'PL',
                    particulars: [
                        { label: 'Revenue from Operations', key: 'revenue' },
                        { label: 'Gross Profit', key: 'gross_profit' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Net Profit', key: 'net_profit' },
                        { label: 'Number of Shares', key: 'shares' },
                        { label: 'EPS Reported', key: 'eps_reported' },
                        { label: 'Book Value Reported', key: 'book_value_reported' },
                        { label: 'ROE Reported', key: 'roe_reported' },
                    ]
                }
            ]
        }
    },
    GENERAL: {
        id: 'GENERAL',
        label: 'General / Other',
        sections: {
            balance_sheet: [
                {
                    label: 'ASSETS',
                    key: 'ASSETS',
                    particulars: [
                        { label: 'Current Assets', key: 'current_assets' },
                        { label: 'Non-Current Assets', key: 'non_current_assets' },
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                },
                {
                    label: 'LIABILITIES',
                    key: 'LIABILITIES',
                    particulars: [
                        { label: 'Current Liabilities', key: 'current_liabilities' },
                        { label: 'Non-Current Liabilities', key: 'non_current_liabilities' },
                        { label: 'Total Liabilities', key: 'total_liabilities' },
                    ]
                },
                {
                    label: 'EQUITY',
                    key: 'EQUITY',
                    particulars: [
                        { label: 'Share Capital', key: 'share_capital' },
                        { label: 'Reserves and Surplus', key: 'reserves' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'PROFIT/LOSS STATEMENT',
                    key: 'PL',
                    particulars: [
                        { label: 'Revenue / Turnover', key: 'revenue' },
                        { label: 'Cost of Sales', key: 'cost_of_sales' },
                        { label: 'Gross Profit', key: 'gross_profit' },
                        { label: 'Operating Expenses', key: 'operating_expenses' },
                        { label: 'Net Profit After Tax', key: 'net_profit' },
                    ]
                }
            ]
        }
    },
    HYDRO_QUARTERLY: {
        id: 'HYDRO_QUARTERLY',
        label: 'Hydropower (Quarterly)',
        sections: {
            balance_sheet: [
                {
                    label: 'QUARTERLY FINANCIAL SUMMARY',
                    key: 'SUMMARY',
                    particulars: [
                        { label: 'Paid Up Capital', key: 'paid_up_capital' },
                        { label: 'Reserve and Surplus', key: 'reserves' },
                        { label: 'Long Term Loans', key: 'long_term_loans' },
                        { label: 'Total Equity', key: 'total_equity' },
                        { label: 'Total Liabilities', key: 'total_liabilities' },
                        { label: 'Net Fixed Assets', key: 'fixed_assets' },
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'QUARTERLY PROFIT/LOSS',
                    key: 'PL',
                    particulars: [
                        { label: 'Revenue from Power Sales', key: 'revenue' },
                        { label: 'Cost of Sales', key: 'cost_of_sales' },
                        { label: 'Gross Profit', key: 'gross_profit' },
                        { label: 'Operating Expenses', key: 'operating_expenses' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Financial Costs', key: 'finance_costs' },
                        { label: 'Net Profit', key: 'net_profit' },
                        { label: 'EPS Reported', key: 'eps_reported' },
                        { label: 'Book Value Reported', key: 'book_value_reported' },
                    ]
                }
            ]
        }
    },
    INSURANCE_QUARTERLY: {
        id: 'INSURANCE_QUARTERLY',
        label: 'Insurance (Quarterly)',
        sections: {
            balance_sheet: [
                {
                    label: 'QUARTERLY FINANCIAL SUMMARY',
                    key: 'SUMMARY',
                    particulars: [
                        { label: 'Paid Up Capital', key: 'paid_up_capital' },
                        { label: 'Reserves and Surplus', key: 'reserves' },
                        { label: 'Insurance Fund', key: 'insurance_fund' },
                        { label: 'Total Equity', key: 'total_equity' },
                        { label: 'Total Investments', key: 'investments' },
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'QUARTERLY PROFIT/LOSS',
                    key: 'PL',
                    particulars: [
                        { label: 'Net Premium', key: 'net_premium' },
                        { label: 'Claims Paid', key: 'claims_paid' },
                        { label: 'Investment Income', key: 'investment_income' },
                        { label: 'Management Expenses', key: 'expenses' },
                        { label: 'Net Profit', key: 'net_profit' },
                        { label: 'Number of Policies', key: 'policies_count' },
                        { label: 'EPS Reported', key: 'eps_reported' },
                        { label: 'Book Value Reported', key: 'book_value_reported' },
                    ]
                }
            ]
        }
    },
    MANUFACTURING_QUARTERLY: {
        id: 'MANUFACTURING_QUARTERLY',
        label: 'Manufacturing (Quarterly)',
        sections: {
            balance_sheet: [
                {
                    label: 'QUARTERLY FINANCIAL SUMMARY',
                    key: 'SUMMARY',
                    particulars: [
                        { label: 'Paid Up Capital', key: 'paid_up_capital' },
                        { label: 'Reserve and Surplus', key: 'reserves' },
                        { label: 'Long Term Loans', key: 'long_term_loans' },
                        { label: 'Total Equity', key: 'total_equity' },
                        { label: 'Net Fixed Assets', key: 'fixed_assets' },
                        { label: 'Total Assets', key: 'total_assets' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'QUARTERLY PROFIT/LOSS',
                    key: 'PL',
                    particulars: [
                        { label: 'Sales Revenue', key: 'revenue' },
                        { label: 'Cost of Sales', key: 'cost_of_sales' },
                        { label: 'Gross Profit', key: 'gross_profit' },
                        { label: 'Operating Expenses', key: 'operating_expenses' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Net Profit', key: 'net_profit' },
                        { label: 'EPS Reported', key: 'eps_reported' },
                        { label: 'Book Value Reported', key: 'book_value_reported' },
                    ]
                }
            ]
        }
    },
    GENERAL_QUARTERLY: {
        id: 'GENERAL_QUARTERLY',
        label: 'General Sector (Quarterly)',
        sections: {
            balance_sheet: [
                {
                    label: 'QUARTERLY FINANCIAL SUMMARY',
                    key: 'SUMMARY',
                    particulars: [
                        { label: 'Paid Up Capital', key: 'paid_up_capital' },
                        { label: 'Reserve and Surplus', key: 'reserves' },
                        { label: 'Total Equity', key: 'total_equity' },
                        { label: 'Total Liabilities', key: 'total_liabilities' },
                        { label: 'Total Assets', key: 'total_assets' },
                        { label: 'Current Assets', key: 'current_assets' },
                        { label: 'Current Liabilities', key: 'current_liabilities' },
                    ]
                }
            ],
            profit_loss: [
                {
                    label: 'QUARTERLY PROFIT/LOSS',
                    key: 'PL',
                    particulars: [
                        { label: 'Revenue from Operations', key: 'revenue' },
                        { label: 'Gross Profit', key: 'gross_profit' },
                        { label: 'Operating Profit', key: 'operating_profit' },
                        { label: 'Net Profit', key: 'net_profit' },
                        { label: 'EPS Reported', key: 'eps_reported' },
                        { label: 'Book Value Reported', key: 'book_value_reported' },
                    ]
                }
            ]
        }
    }
};

export const SECTOR_TO_TEMPLATE: Record<string, string> = {
    'Commercial Banks': 'BANK',
    'Development Banks': 'BANK',
    'Finance': 'BANK',
    'Hydro Power': 'HYDRO',
    'Life Insurance': 'INSURANCE',
    'Non Life Insurance': 'INSURANCE',
    'Manufacturing And Processing': 'MANUFACTURING',
    'Investment': 'GENERAL',
    'Mutual Fund': 'GENERAL',
    'Hotels And Tourism': 'HOTEL',
    'Tradings': 'GENERAL',
    'Microfinance': 'BANK', // Microfinance resembles bank reporting
    'Others': 'GENERAL'
};

export const CATEGORY_GROUPS = [
    { label: 'Banks & Finance', sectors: ['Commercial Banks', 'Development Banks', 'Finance', 'Microfinance'] },
    { label: 'Hydro Power', sectors: ['Hydro Power'] },
    { label: 'Insurance', sectors: ['Life Insurance', 'Non Life Insurance'] },
    { label: 'Manufacturing', sectors: ['Manufacturing And Processing'] },
    { label: 'Tourism', sectors: ['Hotels And Tourism'] },
    { label: 'Others', sectors: ['Investment', 'Mutual Fund', 'Tradings', 'Others'] }
];
