from __future__ import annotations
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, Dividend, FinancialReport

_CGH_DATA = {
    "073-074": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 2363122000.0, "Investments": 0.0, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 0.0, "Cash and Cash Equivalents": 12469000.0, "Financial Assets": 169256000.0},
            "SUMMARY": {
                "total_non_current_assets": 2363122000.0,
                "total_current_assets": 351862000.0,
                "total_assets": 2714984000.0,
                "share_capital": 1000000000.0,
                "reserve_and_surplus": -124092000.0,
                "total_equity": 1063317000.0,
                "long_term_loans_borrowings": 1528464000.0,
                "total_non_current_liabilities": 1528464000.0,
                "short_term_loans_borrowings": 0.0,
                "total_current_liabilities": 123203000.0,
                "total_liabilities": 1651667000.0,
            }
        },
        "pl": {
            "revenue": 415780000.0, "cogs": 49195000.0, "gross_profit": 366585000.0,
            "employee_benefits": 50345000.0, "depreciation_amortization": 150817000.0,
            "admin_operating_expenses": 104342000.0, "operating_profit": 69953000.0,
            "finance_cost": 95487000.0, "profit_before_tax": -25534000.0,
            "income_tax": -4151000.0, "net_profit": -21383000.0
        },
        "cf": {}
    },
    "074-075": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 2808832000.0, "Investments": 0.0, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 0.0, "Cash and Cash Equivalents": 11488000.0, "Financial Assets": 170313000.0},
            "SUMMARY": {
                "total_non_current_assets": 2823232000.0,
                "total_current_assets": 355234000.0,
                "total_assets": 3178466000.0,
                "share_capital": 1000000000.0,
                "reserve_and_surplus": -103006000.0,
                "total_equity": 1084403000.0,
                "long_term_loans_borrowings": 1968699000.0,
                "total_non_current_liabilities": 1968699000.0,
                "short_term_loans_borrowings": 0.0,
                "total_current_liabilities": 125364000.0,
                "total_liabilities": 2094063000.0,
            }
        },
        "pl": {
            "revenue": 547904000.0, "cogs": 66764000.0, "gross_profit": 48114000.0,
            "employee_benefits": 71136000.0, "depreciation_amortization": 159069000.0,
            "admin_operating_expenses": 92786000.0, "operating_profit": 16868000.0,
            "finance_cost": 141358000.0, "profit_before_tax": 27321000.0,
            "income_tax": 6235000.0, "net_profit": 21086000.0
        },
        "cf": {}
    },
    "075-076": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 3231982000.0, "Investments": 0.0, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 0.0, "Cash and Cash Equivalents": 46566000.0, "Financial Assets": 194768000.0},
            "SUMMARY": {
                "total_non_current_assets": 3246382000.0,
                "total_current_assets": 423361000.0,
                "total_assets": 3669743000.0,
                "share_capital": 1000000000.0,
                "reserve_and_surplus": -102472000.0,
                "total_equity": 1247544000.0,
                "long_term_loans_borrowings": 2220825000.0,
                "total_non_current_liabilities": 2220825000.0,
                "short_term_loans_borrowings": 0.0,
                "total_current_liabilities": 201374000.0,
                "total_liabilities": 2422199000.0,
            }
        },
        "pl": {
            "revenue": 569656000.0, "cogs": 76434000.0, "gross_profit": 493222000.0,
            "employee_benefits": 107497000.0, "depreciation_amortization": 145084000.0,
            "admin_operating_expenses": 89722000.0, "operating_profit": 170104000.0,
            "finance_cost": 169122000.0, "profit_before_tax": 982000.0,
            "income_tax": 411000.0, "net_profit": 571000.0
        },
        "cf": {}
    },
    "076-077": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 3153159929.0, "Investments": 194900000.0, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 23352133.0, "Cash and Cash Equivalents": 19298666.0, "Financial Assets": 0.0},
            "SUMMARY": {
                "total_non_current_assets": 3384106645.0,
                "total_current_assets": 336441760.0,
                "total_assets": 3720548405.0,
                "share_capital": 1350000000.0,
                "reserve_and_surplus": -139717385.0,
                "total_equity": 1210282615.0,
                "long_term_loans_borrowings": 2036946014.0,
                "total_non_current_liabilities": 2041785521.0,
                "short_term_loans_borrowings": 190388083.0,
                "total_current_liabilities": 468480268.0,
                "total_liabilities": 2510265789.0,
            }
        },
        "pl": {
            "revenue": 413083421.0, "cogs": 61926752.0, "gross_profit": 351156669.0,
            "employee_benefits": 94088653.0, "depreciation_amortization": 122247896.0,
            "admin_operating_expenses": 76817662.0, "operating_profit": 209280711.0,
            "finance_cost": 218224463.0, "profit_before_tax": -131191648.0,
            "income_tax": -24574848.0, "net_profit": -106616800.0
        },
        "cf": {}
    },
    "077-078": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 3111482832.0, "Investments": 209300000.0, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 23398810.0, "Cash and Cash Equivalents": 95271057.0, "Financial Assets": 0.0},
            "SUMMARY": {
                "total_non_current_assets": 3329716107.0,
                "total_current_assets": 371393378.0,
                "total_assets": 3701109485.0,
                "share_capital": 1534091000.0,
                "reserve_and_surplus": -412409733.0,
                "total_equity": 1121681267.0,
                "long_term_loans_borrowings": 2363276699.0,
                "total_non_current_liabilities": 2368773560.0,
                "short_term_loans_borrowings": 69566250.0,
                "total_current_liabilities": 210654657.0,
                "total_liabilities": 2579428217.0,
            }
        },
        "pl": {
            "revenue": 221948824.0, "cogs": 32845553.0, "gross_profit": 189103271.0,
            "employee_benefits": 48805813.0, "depreciation_amortization": 124357573.0,
            "admin_operating_expenses": 74137309.0, "operating_profit": 73626917.0,
            "finance_cost": 195508095.0, "profit_before_tax": -246238752.0,
            "income_tax": 26453595.0, "net_profit": -272692347.0
        },
        "cf": {}
    },
    "079-080": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 3058706725.0, "Investments": 4560462.0, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 27772074.0, "Cash and Cash Equivalents": 250717144.0, "Financial Assets": 0.0},
            "SUMMARY": {
                "total_non_current_assets": 3441077005.0,
                "total_current_assets": 403214160.0,
                "total_assets": 3837093996.0,
                "share_capital": 1534091000.0,
                "reserve_and_surplus": -294066136.0,
                "total_equity": 1240024864.0,
                "long_term_loans_borrowings": 2088489974.0,
                "total_non_current_liabilities": 2227499851.0,
                "short_term_loans_borrowings": 196389314.0,
                "total_current_liabilities": 369569282.0,
                "total_liabilities": 2597069132.0,
            }
        },
        "pl": {
            "revenue": 913416423.0, "cogs": 120817970.0, "gross_profit": 792600015.0,
            "employee_benefits": 132113360.0, "depreciation_amortization": 115084653.0,
            "admin_operating_expenses": 104470376.0, "operating_profit": 461056376.0,
            "finance_cost": 285018234.0, "profit_before_tax": 176038142.0,
            "income_tax": 0.0, "net_profit": 112035816.0
        },
        "cf": {}
    },
    "080-081": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 3013246470.0, "Investments": 0.0, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 40688907.0, "Cash and Cash Equivalents": 0.0, "Financial Assets": 0.0},
            "SUMMARY": {
                "total_non_current_assets": 3375171925.0,
                "total_current_assets": 0.0,
                "total_assets": 3713642826.0,
                "share_capital": 1534091000.0,
                "reserve_and_surplus": -94091480.0,
                "total_equity": 1439999520.0,
                "long_term_loans_borrowings": 1692720930.0,
                "total_non_current_liabilities": 1910945228.0,
                "short_term_loans_borrowings": 245722789.0,
                "total_current_liabilities": 362698077.0,
                "total_liabilities": 2273643305.0,
            }
        },
        "pl": {
            "revenue": 1000115981.0, "cogs": 0.0, "gross_profit": 0.0,
            "employee_benefits": 0.0, "depreciation_amortization": 119142565.0,
            "admin_operating_expenses": 109998989.0, "operating_profit": 513148545.0,
            "finance_cost": 239644012.0, "profit_before_tax": 273504532.0,
            "income_tax": 0.0, "net_profit": 199974656.0
        },
        "cf": {
            "OPERATING ACTIVITIES": {"Net Cash Flow From Operating Activities": 530215096.06},
            "INVESTING ACTIVITIES": {"Net Cash Used In Investing Activities": -53196583.55},
            "FINANCING ACTIVITIES": {"Net Cash From Financing Activities": -585008918.34}
        }
    }
}


class Command(BaseCommand):
    help = 'Seeds annual financials and dividend for CGH'

    def handle(self, *args, **kwargs) -> None:
        self.stdout.write('Seeding CGH Data...')
        self._ensure_company()
        self._seed_reports()
        self._seed_dividends()
        self.stdout.write(self.style.SUCCESS('Successfully seeded CGH data'))

    def _ensure_company(self) -> None:
        Company.all_objects.get_or_create(
            symbol='CGH',
            defaults={
                'name': 'Chandragiri Hills Limited',
                'sector': 'Hotels And Tourism',
                'instrument_type': 'Equity',
                'status': 'A',
            }
        )

    def _seed_reports(self) -> None:
        for fy, raw in _CGH_DATA.items():
            FinancialReport.objects.update_or_create(
                ticker='CGH',
                fiscal_year=fy,
                report_type=FinancialReport.ReportType.ANNUAL,
                defaults={
                    'report_template': 'GENERAL',
                    'is_audited': True,
                    'balance_sheet': raw['bs'],
                    'profit_loss': raw['pl'],
                    'cash_flow': raw['cf'],
                    'net_profit': Decimal(str(raw['pl']['net_profit'])),
                    'revenue': Decimal(str(raw['pl']['revenue'])),
                }
            )

    def _seed_dividends(self) -> None:
        Dividend.objects.update_or_create(
            ticker='CGH',
            fiscal_year='2081/2082',
            defaults={
                'bonus_percent': Decimal('5.00'),
                'cash_percent': Decimal('0.2632'),
                'total_percent': Decimal('5.26'),
                'book_close_date': '2025-12-26',
            }
        )
