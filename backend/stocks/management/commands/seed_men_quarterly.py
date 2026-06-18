from __future__ import annotations
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport

_THOUSANDS = 1000

_MEN_QUARTERLY = [
    # FY 082-083
    {"fy": "2082/083", "q": 3, "data": {
        "paid_up_capital": 3123258.85, "reserves": 1319224.63, "total_equity": 4442483.48,
        "borrowings": 2837563.32, "current_liabilities": 605356.40, "current_assets": 1517034.74,
        "total_assets": 7418159.37, "revenue": 1108761.26, "gross_profit": 722729.49,
        "operating_profit": 686392.84, "net_profit": 527633.11, "num_shares": 31232588.50,
        "eps": 22.52, "book_value": 142.24, "roe": 15.84
    }},
    {"fy": "2082/083", "q": 2, "data": {
        "paid_up_capital": 3123258.85, "reserves": 1332902.91, "total_equity": 4456161.76,
        "borrowings": 2833800.82, "current_liabilities": 527451.99, "current_assets": 1909418.77,
        "total_assets": 7418748.90, "revenue": 914447.80, "gross_profit": 675094.83,
        "operating_profit": 649655.83, "net_profit": 541449.55, "num_shares": 31232588.50,
        "eps": 34.67, "book_value": 142.68, "roe": 24.30
    }},
    {"fy": "2082/083", "q": 1, "data": {
        "paid_up_capital": 2602715.71, "reserves": 1764069.73, "total_equity": 4366785.44,
        "borrowings": 3021445.91, "current_liabilities": 624802.47, "current_assets": 1959760.73,
        "total_assets": 7522892.40, "revenue": 642575.42, "gross_profit": 484211.53,
        "operating_profit": 471648.14, "net_profit": 423496.69, "num_shares": 26027157.08,
        "eps": 65.09, "book_value": 167.78, "roe": 38.79
    }},

    # FY 081-082
    {"fy": "2081/082", "q": 4, "data": {
        "paid_up_capital": 2602715.71, "reserves": 1356297.83, "total_equity": 3959013.54,
        "borrowings": 3109900.01, "current_liabilities": 476675.46, "current_assets": 1540488.62,
        "total_assets": 7169516.20, "revenue": 1313696.93, "gross_profit": 938779.00,
        "operating_profit": 892150.46, "net_profit": 629075.95, "num_shares": 26027157.08,
        "eps": 24.17, "book_value": 152.11, "roe": 15.89
    }},
    {"fy": "2081/082", "q": 3, "data": {
        "paid_up_capital": 2602715.71, "reserves": 1193926.41, "total_equity": 3796642.12,
        "borrowings": 3180305.11, "current_liabilities": 462217.23, "current_assets": 1376881.66,
        "total_assets": 7072108.87, "revenue": 924213.47, "gross_profit": 692278.84,
        "operating_profit": 660866.16, "net_profit": 465054.41, "num_shares": 26027157.08,
        "eps": 23.82, "book_value": 145.87, "roe": 16.33
    }},
    {"fy": "2081/082", "q": 2, "data": {
        "paid_up_capital": 2602715.71, "reserves": 1240453.41, "total_equity": 3843169.12,
        "borrowings": 3230246.61, "current_liabilities": 485652.46, "current_assets": 1436476.34,
        "total_assets": 7198567.49, "revenue": 799547.73, "gross_profit": 669468.16,
        "operating_profit": 650817.24, "net_profit": 512061.38, "num_shares": 26027157.08,
        "eps": 39.35, "book_value": 147.66, "roe": 26.65
    }},
    {"fy": "2081/082", "q": 1, "data": {
        "paid_up_capital": 2263231.05, "reserves": 1330212.35, "total_equity": 3593443.40,
        "borrowings": 3419094.64, "current_liabilities": 559550.54, "current_assets": 1281648.55,
        "total_assets": 7107304.45, "revenue": 497372.52, "gross_profit": 387014.64,
        "operating_profit": 376551.44, "net_profit": 305393.21, "num_shares": 22632310.50,
        "eps": 53.97, "book_value": 158.77, "roe": 33.99
    }},

    # FY 080-081
    {"fy": "2080/081", "q": 4, "data": {
        "paid_up_capital": 2263231.05, "reserves": 1027994.09, "total_equity": 3291225.14,
        "borrowings": 3480629.88, "current_liabilities": 417473.70, "current_assets": 962274.62,
        "total_assets": 6852327.46, "revenue": 985181.59, "gross_profit": 510866.36,
        "operating_profit": 474754.73, "net_profit": 203679.93, "num_shares": 22632310.50,
        "eps": 9.00, "book_value": 145.42, "roe": 6.19
    }}
]

def _build_bs(d: dict) -> dict:
    return {
        "SUMMARY": {
            "paid_up_capital": d["paid_up_capital"] * _THOUSANDS,
            "reserves": d["reserves"] * _THOUSANDS,
            "long_term_loans": d["borrowings"] * _THOUSANDS,
            "total_equity": d["total_equity"] * _THOUSANDS,
            "total_liabilities": (d["borrowings"] + d["current_liabilities"]) * _THOUSANDS,
            "fixed_assets": (d["total_assets"] - d["current_assets"]) * _THOUSANDS,
            "total_assets": d["total_assets"] * _THOUSANDS,
        }
    }

def _build_pl(d: dict) -> dict:
    return {
        "PL": {
            "revenue": d["revenue"] * _THOUSANDS,
            "cost_of_sales": (d["revenue"] - d["gross_profit"]) * _THOUSANDS,
            "gross_profit": d["gross_profit"] * _THOUSANDS,
            "operating_profit": d["operating_profit"] * _THOUSANDS,
            "net_profit": d["net_profit"] * _THOUSANDS,
            "eps_reported": d["eps"],
            "book_value_reported": d["book_value"],
        }
    }

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

def _upsert_report(r: dict) -> None:
    d = r['data']
    FinancialReport.objects.update_or_create(
        ticker='MEN',
        fiscal_year=r['fy'],
        report_type=FinancialReport.ReportType.QUARTERLY,
        quarter=r['q'],
        defaults={
            'report_template': 'HYDRO_QUARTERLY',
            'is_audited': False,
            'balance_sheet': _build_bs(d),
            'profit_loss': _build_pl(d),
            'key_ratios': _build_kr(d),
            'paid_up_capital': Decimal(str(d['paid_up_capital'] * _THOUSANDS)),
            'reserves_and_surplus': Decimal(str(d['reserves'] * _THOUSANDS)),
            'revenue': Decimal(str(d['revenue'] * _THOUSANDS)),
            'operating_profit': Decimal(str(d['operating_profit'] * _THOUSANDS)),
            'net_profit': Decimal(str(d['net_profit'] * _THOUSANDS)),
            'eps': Decimal(str(d["eps"])),
            'book_value': Decimal(str(d["book_value"])),
            'return_on_equity': Decimal(str(d["roe"])),
        }
    )

class Command(BaseCommand):
    help = 'Seeds quarterly financials for MEN'

    def handle(self, *args, **options) -> None:
        self.stdout.write('Seeding MEN Quarterly Financials...')
        self._ensure_company()
        self._seed_reports()
        self.stdout.write(self.style.SUCCESS('Successfully seeded MEN quarterly data'))

    def _ensure_company(self) -> None:
        Company.all_objects.get_or_create(
            symbol='MEN',
            defaults={
                'name': 'Mountain Energy Nepal Limited',
                'sector': 'Hydro Power',
                'instrument_type': 'Equity',
                'status': 'A',
            }
        )

    def _seed_reports(self) -> None:
        for report in _MEN_QUARTERLY:
            _upsert_report(report)
