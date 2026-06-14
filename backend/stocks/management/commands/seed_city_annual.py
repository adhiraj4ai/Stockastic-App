from __future__ import annotations
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport

_CITY_DATA = {
    "078-079": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 4682211482.16, "Investments": 329146124.35, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 5438553.50, "Cash and Cash Equivalents": 70425191.06, "Financial Assets": 92168517.82},
            "SUMMARY": {
                "total_non_current_assets": 5119998609.70,
                "total_current_assets": 383197080.67,
                "total_assets": 5503195690.37,
                "share_capital": 1506600000.00,
                "reserve_and_surplus": 284049871.54,
                "total_equity": 1790649871.54,
                "long_term_loans_borrowings": 3120852038.37,
                "total_non_current_liabilities": 3580014938.19,
                "short_term_loans_borrowings": 18243580.00,
                "total_current_liabilities": 132530880.64,
                "total_liabilities": 3712545818.83,
            }
        },
        "pl": {
            "revenue": 189164541.27, "cogs": 62837463.35, "gross_profit": 126327077.92,
            "employee_benefits": 52442513.83, "depreciation_amortization": 37898284.39,
            "admin_operating_expenses": 43420285.00, "operating_profit": -12024278.11,
            "finance_cost": 47699803.50, "profit_before_tax": -54157747.80,
            "income_tax": 0.0, "net_profit": -44682976.47
        },
        "cf": {
            "OPERATING ACTIVITIES": {"Net Cash Flow From Operating Activities": 212867485.89},
            "INVESTING ACTIVITIES": {"Net Cash Used In Investing Activities": -64059942.29},
            "FINANCING ACTIVITIES": {"Net Cash From Financing Activities": -204501199.88}
        }
    },
    "079-080": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 4634893851.55, "Investments": 368026642.57, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 6267839.13, "Cash and Cash Equivalents": 14731534.78, "Financial Assets": 37864603.47},
            "SUMMARY": {
                "total_non_current_assets": 5171383410.12,
                "total_current_assets": 285645287.72,
                "total_assets": 5457028697.84,
                "share_capital": 1674000000.00,
                "reserve_and_surplus": 59474552.36,
                "total_equity": 1733474552.36,
                "long_term_loans_borrowings": 3129148566.46,
                "total_non_current_liabilities": 3197818345.31,
                "short_term_loans_borrowings": 59664288.94,
                "total_current_liabilities": 525735800.17,
                "total_liabilities": 3723554145.48,
            }
        },
        "pl": {
            "revenue": 473151155.23, "cogs": 128788922.89, "gross_profit": 344362232.34,
            "employee_benefits": 87589187.07, "depreciation_amortization": 131117032.04,
            "admin_operating_expenses": 127219469.33, "operating_profit": -25064390.48,
            "finance_cost": 353420611.28, "profit_before_tax": -341902028.60,
            "income_tax": -69681573.49, "net_profit": -272220455.19
        },
        "cf": {
            "OPERATING ACTIVITIES": {"Net Cash Flow From Operating Activities": 212867485.89},
            "INVESTING ACTIVITIES": {"Net Cash Used In Investing Activities": 64059942.29},
            "FINANCING ACTIVITIES": {"Net Cash From Financing Activities": 204501199.88}
        }
    },
    "080-081": {
        "bs": {
            "Non-Current Assets": {"Property, Plant and Equipment": 4670039886.67, "Investments": 358210701.42, "Capital Work In Progress": 0.0},
            "Current Assets": {"Inventories": 7117530.09, "Cash and Cash Equivalents": 15958700.57, "Financial Assets": 67758222.94},
            "SUMMARY": {
                "total_non_current_assets": 5128370197.23,
                "total_current_assets": 286797941.42,
                "total_assets": 5415168138.65,
                "share_capital": 1674000000.00,
                "reserve_and_surplus": -211245286.08,
                "total_equity": 1462754713.92,
                "long_term_loans_borrowings": 3189953949.28,
                "total_non_current_liabilities": 3252385194.06,
                "short_term_loans_borrowings": 76812851.55,
                "total_current_liabilities": 70028230.67,
                "total_liabilities": 3952413424.73,
            }
        },
        "pl": {
            "revenue": 504231032.71, "cogs": 124710895.86, "gross_profit": 379520136.85,
            "employee_benefits": 102291777.76, "depreciation_amortization": 133092836.04,
            "admin_operating_expenses": 130983519.76, "operating_profit": -6442286.69,
            "finance_cost": 327317945.27, "profit_before_tax": -255565011.18,
            "income_tax": -52340021.01, "net_profit": -203224990.17
        },
        "cf": {
            "OPERATING ACTIVITIES": {"Net Cash Flow From Operating Activities": 53580401.07},
            "INVESTING ACTIVITIES": {"Net Cash Used In Investing Activities": -99616739.37},
            "FINANCING ACTIVITIES": {"Net Cash From Financing Activities": 47263504.10}
        }
    }
}


class Command(BaseCommand):
    help = 'Seeds annual financials for CITY'

    def handle(self, *args, **kwargs) -> None:
        self.stdout.write('Seeding CITY Data...')
        self._ensure_company()
        self._seed_reports()
        self.stdout.write(self.style.SUCCESS('Successfully seeded CITY data'))

    def _ensure_company(self) -> None:
        Company.all_objects.get_or_create(
            symbol='CITY',
            defaults={
                'name': 'City Hotel Limited',
                'sector': 'Hotels And Tourism',
                'instrument_type': 'Equity',
                'status': 'A',
            }
        )

    def _seed_reports(self) -> None:
        for fy, raw in _CITY_DATA.items():
            FinancialReport.objects.update_or_create(
                ticker='CITY',
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
