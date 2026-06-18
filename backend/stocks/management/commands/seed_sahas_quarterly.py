from __future__ import annotations
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport

_THOUSANDS = 1000

_SAHAS_QUARTERLY = [
    # FY 082-083
    {"fy": "2082/083", "q": 3, "data": {
        "paid_up_capital": 4573800.00, "reserves": 3510079.37, "total_equity": 8083879.37,
        "borrowings": 10326966.13, "current_liabilities": 1999021.98, "current_assets": 1061793.93,
        "total_assets": 18536828.26, "revenue": 2336201.71, "gross_profit": 2184467.24,
        "operating_profit": 1667231.08, "net_profit": 1182718.34, "num_shares": 45738000.00,
        "eps": 34.48, "book_value": 176.74, "roe": 19.51
    }},
    {"fy": "2082/083", "q": 2, "data": {
        "paid_up_capital": 4573800.00, "reserves": 3229245.57, "total_equity": 7803045.57,
        "borrowings": 10874885.43, "current_liabilities": 2342181.44, "current_assets": 1269927.80,
        "total_assets": 18843694.39, "revenue": 1706531.00, "gross_profit": 1291493.52,
        "operating_profit": 1245569.39, "net_profit": 904828.36, "num_shares": 45738000.00,
        "eps": 39.57, "book_value": 170.60, "roe": 23.19
    }},
    {"fy": "2082/083", "q": 1, "data": {
        "paid_up_capital": 3780000.00, "reserves": 3656953.74, "total_equity": 7436953.74,
        "borrowings": 10417804.74, "current_liabilities": 1612250.33, "current_assets": 1100156.20,
        "total_assets": 17986815.62, "revenue": 925328.74, "gross_profit": 704508.90,
        "operating_profit": 677478.85, "net_profit": 494899.98, "num_shares": 37800000.00,
        "eps": 52.37, "book_value": 196.74, "roe": 26.62
    }},

    # FY 081-082
    {"fy": "2081/082", "q": 4, "data": {
        "paid_up_capital": 3780000.00, "reserves": 3169650.61, "total_equity": 6949650.61,
        "borrowings": 8893479.67, "current_liabilities": 1871707.30, "current_assets": 979976.62,
        "total_assets": 17720233.88, "revenue": 2652588.21, "gross_profit": 1829629.42,
        "operating_profit": 1731716.27, "net_profit": 902723.07, "num_shares": 37800000.00,
        "eps": 23.88, "book_value": 183.85, "roe": 12.99
    }},
    {"fy": "2081/082", "q": 3, "data": {
        "paid_up_capital": 3780000.00, "reserves": 3101183.85, "total_equity": 6881183.85,
        "borrowings": 10734427.22, "current_liabilities": 2169856.42, "current_assets": 1033971.04,
        "total_assets": 17737851.46, "revenue": 2146851.00, "gross_profit": 1552391.02,
        "operating_profit": 1487197.55, "net_profit": 834187.49, "num_shares": 37800000.00,
        "eps": 29.42, "book_value": 182.04, "roe": 16.16
    }},
    {"fy": "2081/082", "q": 2, "data": {
        "paid_up_capital": 3780000.00, "reserves": 2977180.20, "total_equity": 6757180.20,
        "borrowings": 10852836.31, "current_liabilities": 2029165.54, "current_assets": 1137508.79,
        "total_assets": 17706414.15, "revenue": 1617547.28, "gross_profit": 1216700.55,
        "operating_profit": 1169975.82, "net_profit": 709882.83, "num_shares": 37800000.00,
        "eps": 37.56, "book_value": 178.76, "roe": 21.01
    }},
    {"fy": "2081/082", "q": 1, "data": {
        "paid_up_capital": 3500000.00, "reserves": 2965818.12, "total_equity": 6465818.12,
        "borrowings": 11065997.06, "current_liabilities": 2039413.58, "current_assets": 912260.34,
        "total_assets": 17620846.55, "revenue": 867884.24, "gross_profit": 667208.67,
        "operating_profit": 645857.17, "net_profit": 400225.67, "num_shares": 35000000.00,
        "eps": 45.74, "book_value": 184.74, "roe": 24.76
    }},

    # FY 080-081
    {"fy": "2080/081", "q": 4, "data": {
        "paid_up_capital": 3500000.00, "reserves": 2561276.46, "total_equity": 6061276.46,
        "borrowings": 10920031.43, "current_liabilities": 1402540.90, "current_assets": 1025943.87,
        "total_assets": 17083872.35, "revenue": 2448059.91, "gross_profit": 1711715.61,
        "operating_profit": 1589833.41, "net_profit": 416042.02, "num_shares": 35000000.00,
        "eps": 11.89, "book_value": 173.18, "roe": 6.86
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
        ticker='SAHAS',
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
    help = 'Seeds quarterly financials for SAHAS'

    def handle(self, *args, **options) -> None:
        self.stdout.write('Seeding SAHAS Quarterly Financials...')
        self._ensure_company()
        self._seed_reports()
        self.stdout.write(self.style.SUCCESS('Successfully seeded SAHAS quarterly data'))

    def _ensure_company(self) -> None:
        Company.all_objects.get_or_create(
            symbol='SAHAS',
            defaults={
                'name': 'Sahas Urja Limited',
                'sector': 'Hydro Power',
                'instrument_type': 'Equity',
                'status': 'A',
            }
        )

    def _seed_reports(self) -> None:
        for report in _SAHAS_QUARTERLY:
            _upsert_report(report)
