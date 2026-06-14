from __future__ import annotations
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport

_THOUSANDS = 1000

_CITY_QUARTERLY = [
    # FY 082/083
    {"fy": "2082/083", "q": 3, "data": {
        "paid_up_capital": 3013200.00, "reserves": -81982.91, "total_equity": 2931217.09,
        "loans_borrowings": 2508278.41, "current_liabilities": 194781.38, "current_assets": 459674.77,
        "total_assets": 5638745.49, "revenue": 356799.54, "gross_profit": 0.0,
        "net_profit": -138746.76, "num_shares": 30132000.00, "eps": -6.14, "book_value": 97.28, "roe": -6.31
    }},
    {"fy": "2082/083", "q": 2, "data": {
        "paid_up_capital": 3013200.00, "reserves": -44174.42, "total_equity": 2969025.58,
        "loans_borrowings": 2508350.49, "current_liabilities": 194361.50, "current_assets": 487771.79,
        "total_assets": 5684006.02, "revenue": 232398.25, "gross_profit": 0.0,
        "net_profit": -100938.26, "num_shares": 30132000.00, "eps": -6.70, "book_value": 98.53, "roe": -6.80
    }},
    {"fy": "2082/083", "q": 1, "data": {
        "paid_up_capital": 1674000.00, "reserves": 602401.47, "total_equity": 2276401.47,
        "loans_borrowings": 3343162.52, "current_liabilities": 372546.61, "current_assets": 682327.98,
        "total_assets": 5908122.77, "revenue": 107586.93, "gross_profit": 0.0,
        "net_profit": -55652.16, "num_shares": 16740000.00, "eps": -13.30, "book_value": 135.99, "roe": -9.78
    }},

    # FY 081/082
    {"fy": "2081/082", "q": 4, "data": {
        "paid_up_capital": 1674000.00, "reserves": -320906.66, "total_equity": 1353093.34,
        "loans_borrowings": 3356475.10, "current_liabilities": 907109.86, "current_assets": 300216.92,
        "total_assets": 5560623.70, "revenue": 486848.43, "gross_profit": 0.0,
        "net_profit": -198965.88, "num_shares": 16740000.00, "eps": -11.89, "book_value": 80.83, "roe": -14.70
    }},
    {"fy": "2081/082", "q": 3, "data": {
        "paid_up_capital": 1674000.00, "reserves": -335966.95, "total_equity": 1338033.05,
        "loans_borrowings": 3371552.67, "current_liabilities": 881540.14, "current_assets": 310381.68,
        "total_assets": 5535392.11, "revenue": 353832.21, "gross_profit": 0.0,
        "net_profit": -173803.26, "num_shares": 16740000.00, "eps": -13.84, "book_value": 79.93, "roe": -17.32
    }},

    # FY 080/081
    {"fy": "2080/081", "q": 4, "data": {
        "paid_up_capital": 1674000.00, "reserves": -90995.55, "total_equity": 1583004.45,
        "loans_borrowings": 3266766.77, "current_liabilities": 702036.75, "current_assets": 286451.15,
        "total_assets": 5536871.98, "revenue": 504231.03, "gross_profit": 0.0,
        "net_profit": -204730.67, "num_shares": 16740000.00, "eps": -12.23, "book_value": 94.56, "roe": -12.93
    }},
    {"fy": "2080/081", "q": 3, "data": {
        "paid_up_capital": 1674000.00, "reserves": -94347.16, "total_equity": 1579652.84,
        "loans_borrowings": 3247830.80, "current_liabilities": 676029.26, "current_assets": 304575.40,
        "total_assets": 5486862.91, "revenue": 370296.90, "gross_profit": 0.0,
        "net_profit": -153700.59, "num_shares": 16740000.00, "eps": -12.24, "book_value": 94.36, "roe": -12.97
    }},
    {"fy": "2080/081", "q": 2, "data": {
        "paid_up_capital": 1674000.00, "reserves": -58517.65, "total_equity": 1615482.35,
        "loans_borrowings": 3206167.58, "current_liabilities": 660067.39, "current_assets": 294309.76,
        "total_assets": 5464224.05, "revenue": 243046.89, "gross_profit": 0.0,
        "net_profit": -117992.20, "num_shares": 16740000.00, "eps": -14.10, "book_value": 96.50, "roe": -14.61
    }},
    {"fy": "2080/081", "q": 1, "data": {
        "paid_up_capital": 1674000.00, "reserves": 285.50, "total_equity": 1674285.50,
        "loans_borrowings": 3188066.32, "current_liabilities": 613788.49, "current_assets": 289360.90,
        "total_assets": 5468697.23, "revenue": 115959.76, "gross_profit": 0.0,
        "net_profit": -60339.70, "num_shares": 16740000.00, "eps": -14.42, "book_value": 100.02, "roe": -14.42
    }},

    # FY 079/080
    {"fy": "2079/080", "q": 4, "data": {
        "paid_up_capital": 1674000.00, "reserves": 60625.20, "total_equity": 1734625.20,
        "loans_borrowings": 3189725.89, "current_liabilities": 529113.70, "current_assets": 286377.36,
        "total_assets": 5461571.19, "revenue": 473151.16, "gross_profit": 0.0,
        "net_profit": -273636.36, "num_shares": 16740000.00, "eps": -16.35, "book_value": 103.62, "roe": -15.77
    }}
]


class Command(BaseCommand):
    help = 'Seeds quarterly financials for CITY'

    def handle(self, *args, **kwargs) -> None:
        self.stdout.write('Seeding CITY Quarterly Financials...')
        self._ensure_company()
        self._seed_reports()
        self.stdout.write(self.style.SUCCESS('Successfully seeded CITY quarterly data'))

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
        for report in _CITY_QUARTERLY:
            self._upsert_report(report)

    def _upsert_report(self, r: dict) -> None:
        d = r['data']
        FinancialReport.objects.update_or_create(
            ticker='CITY',
            fiscal_year=r['fy'],
            report_type=FinancialReport.ReportType.QUARTERLY,
            quarter=r['q'],
            defaults={
                'report_template': 'GENERAL',
                'is_audited': False,
                'balance_sheet': self._build_bs(d),
                'profit_loss': self._build_pl(d),
                'key_ratios': self._build_kr(d),
                'net_profit': Decimal(str(d['net_profit'] * _THOUSANDS)),
                'revenue': Decimal(str(d['revenue'] * _THOUSANDS)),
                'eps': Decimal(str(d['eps'])),
                'book_value': Decimal(str(d['book_value'])),
                'return_on_equity': Decimal(str(d['roe'])),
            }
        )

    @staticmethod
    def _build_bs(d: dict) -> dict:
        return {
            "SUMMARY": {
                "paid_up_capital": d["paid_up_capital"] * _THOUSANDS,
                "reserve_and_surplus": d["reserves"] * _THOUSANDS,
                "total_equity": d["total_equity"] * _THOUSANDS,
                "loans_borrowings": d["loans_borrowings"] * _THOUSANDS,
                "current_liabilities": d["current_liabilities"] * _THOUSANDS,
                "current_assets": d["current_assets"] * _THOUSANDS,
                "total_assets": d["total_assets"] * _THOUSANDS,
            }
        }

    @staticmethod
    def _build_pl(d: dict) -> dict:
        return {
            "PL": {
                "revenue": d["revenue"] * _THOUSANDS,
                "gross_profit": d["gross_profit"] * _THOUSANDS,
                "net_profit": d["net_profit"] * _THOUSANDS,
            }
        }

    @staticmethod
    def _build_kr(d: dict) -> dict:
        return {
            "Per Share": {
                "EPS": d["eps"],
                "Book Value": d["book_value"],
            },
            "Performance": {
                "ROE": d["roe"]
            }
        }
