from __future__ import annotations
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport

_THOUSANDS = 1000

_CGH_QUARTERLY = [
    # FY 082/083
    {"fy": "2082/083", "q": 3, "data": {
        "paid_up_capital": 1610795.55, "reserves": 3163.98, "total_equity": 1613959.53,
        "loans_borrowings": 1962397.77, "current_liabilities": 115061.86, "current_assets": 3452457.03,
        "total_assets": 3973672.10, "revenue": 455866.03, "gross_profit": 387725.36,
        "net_profit": -9384.49, "num_shares": 16107955.50, "eps": -0.78, "book_value": 100.20, "roe": -0.78
    }},
    {"fy": "2082/083", "q": 2, "data": {
        "paid_up_capital": 1534091.00, "reserves": 46269.54, "total_equity": 1580360.54,
        "loans_borrowings": 1934822.43, "current_liabilities": 126109.31, "current_assets": 491455.95,
        "total_assets": 3929666.72, "revenue": 248960.47, "gross_profit": 210168.52,
        "net_profit": -47020.56, "num_shares": 15340910.00, "eps": -6.13, "book_value": 103.02, "roe": -5.95
    }},
    {"fy": "2082/083", "q": 1, "data": {
        "paid_up_capital": 1534091.00, "reserves": 104372.30, "total_equity": 1638463.30,
        "loans_borrowings": 1836771.10, "current_liabilities": 73090.56, "current_assets": 429816.94,
        "total_assets": 3748301.63, "revenue": 138707.76, "gross_profit": 115832.51,
        "net_profit": -12431.73, "num_shares": 15340910.00, "eps": -3.24, "book_value": 106.80, "roe": -3.03
    }},

    # FY 081/082
    {"fy": "2081/082", "q": 4, "data": {
        "paid_up_capital": 1534091.00, "reserves": 116804.03, "total_equity": 1650895.03,
        "loans_borrowings": 1719327.87, "current_liabilities": 131698.33, "current_assets": 335738.66,
        "total_assets": 3701440.77, "revenue": 902416.57, "gross_profit": 782483.37,
        "net_profit": 210895.50, "num_shares": 15340910.00, "eps": 13.75, "book_value": 107.61, "roe": 12.77
    }},
    {"fy": "2081/082", "q": 3, "data": {
        "paid_up_capital": 1534091.00, "reserves": 38132.92, "total_equity": 1572223.92,
        "loans_borrowings": 1780308.26, "current_liabilities": 95085.54, "current_assets": 295128.70,
        "total_assets": 3646887.83, "revenue": 635108.31, "gross_profit": 547305.06,
        "net_profit": 108811.06, "num_shares": 15340910.00, "eps": 9.46, "book_value": 102.49, "roe": 9.23
    }},
    {"fy": "2081/082", "q": 2, "data": {
        "paid_up_capital": 1534091.00, "reserves": -4195.76, "total_equity": 1529895.24,
        "loans_borrowings": 1822850.83, "current_liabilities": 111244.43, "current_assets": 294831.86,
        "total_assets": 3663968.80, "revenue": 422537.74, "gross_profit": 367016.18,
        "net_profit": 66482.38, "num_shares": 15340910.00, "eps": 8.67, "book_value": 99.73, "roe": 8.69
    }},
    {"fy": "2081/082", "q": 1, "data": {
        "paid_up_capital": 1534091.00, "reserves": -45148.28, "total_equity": 1488942.73,
        "loans_borrowings": 1879664.58, "current_liabilities": 84363.74, "current_assets": 271864.98,
        "total_assets": 3618995.95, "revenue": 195875.59, "gross_profit": 169664.98,
        "net_profit": 25529.87, "num_shares": 15340910.00, "eps": 6.66, "book_value": 97.06, "roe": 6.86
    }},

    # FY 080/081
    {"fy": "2080/081", "q": 4, "data": {
        "paid_up_capital": 1534091.00, "reserves": -70678.14, "total_equity": 1463412.86,
        "loans_borrowings": 1938443.72, "current_liabilities": 160259.47, "current_assets": 298593.74,
        "total_assets": 3639698.69, "revenue": 1000115.98, "gross_profit": 870358.59,
        "net_profit": 223387.99, "num_shares": 15340910.00, "eps": 14.56, "book_value": 95.39, "roe": 15.26
    }},
    {"fy": "2080/081", "q": 3, "data": {
        "paid_up_capital": 1534091.00, "reserves": -122241.28, "total_equity": 1411849.72,
        "loans_borrowings": 2031257.85, "current_liabilities": 80741.27, "current_assets": 252253.13,
        "total_assets": 3617770.09, "revenue": 706056.09, "gross_profit": 606885.30,
        "net_profit": 107910.24, "num_shares": 15340910.00, "eps": 9.38, "book_value": 92.03, "roe": 10.19
    }},
    {"fy": "2080/081", "q": 2, "data": {
        "paid_up_capital": 1534091.00, "reserves": -167301.74, "total_equity": 1366789.26,
        "loans_borrowings": 2116602.14, "current_liabilities": 91920.90, "current_assets": 285231.46,
        "total_assets": 3669233.54, "revenue": 457537.91, "gross_profit": 400278.42,
        "net_profit": 62849.78, "num_shares": 15340910.00, "eps": 8.19, "book_value": 89.09, "roe": 9.20
    }},
    {"fy": "2080/081", "q": 1, "data": {
        "paid_up_capital": 1534091.00, "reserves": -213098.18, "total_equity": 1320992.82,
        "loans_borrowings": 2206134.06, "current_liabilities": 108807.72, "current_assets": 353536.29,
        "total_assets": 3692537.54, "revenue": 206159.93, "gross_profit": 179900.32,
        "net_profit": 21373.36, "num_shares": 15340910.00, "eps": 5.57, "book_value": 86.11, "roe": 6.47
    }},

    # FY 079/080
    {"fy": "2079/080", "q": 4, "data": {
        "paid_up_capital": 1534091.00, "reserves": -234471.55, "total_equity": 1299619.45,
        "loans_borrowings": 2284901.87, "current_liabilities": 142454.35, "current_assets": 403214.16,
        "total_assets": 3783578.61, "revenue": 913417.99, "gross_profit": 792600.02,
        "net_profit": 151162.52, "num_shares": 15340910.00, "eps": 9.85, "book_value": 84.72, "roe": 11.63
    }},
    {"fy": "2079/080", "q": 3, "data": {
        "paid_up_capital": 1534091.00, "reserves": -307898.39, "total_equity": 1226192.62,
        "loans_borrowings": 2279513.03, "current_liabilities": 90378.76, "current_assets": 296474.50,
        "total_assets": 3652687.34, "revenue": 629022.36, "gross_profit": 545865.14,
        "net_profit": 77735.68, "num_shares": 15340910.00, "eps": 6.76, "book_value": 79.93, "roe": 8.45
    }},
    {"fy": "2079/080", "q": 2, "data": {
        "paid_up_capital": 1534091.00, "reserves": -342949.19, "total_equity": 1191141.81,
        "loans_borrowings": 2308044.28, "current_liabilities": 94588.50, "current_assets": 286197.82,
        "total_assets": 3650377.52, "revenue": 408258.05, "gross_profit": 357839.06,
        "net_profit": 51487.12, "num_shares": 15340910.00, "eps": 6.71, "book_value": 77.64, "roe": 5.37
    }},
    {"fy": "2079/080", "q": 1, "data": {
        "paid_up_capital": 1534091.00, "reserves": -381328.63, "total_equity": 1152762.37,
        "loans_borrowings": 2336552.95, "current_liabilities": 96474.68, "current_assets": 251007.95,
        "total_assets": 3585789.99, "revenue": 186422.23, "gross_profit": 163265.49,
        "net_profit": 13107.67, "num_shares": 15340910.00, "eps": 3.42, "book_value": 75.14, "roe": 4.55
    }},

    # FY 078/079
    {"fy": "2078/079", "q": 4, "data": {
        "paid_up_capital": 1534091.00, "reserves": -394436.31, "total_equity": 1139654.69,
        "loans_borrowings": 2363512.95, "current_liabilities": 98396.34, "current_assets": 294693.00,
        "total_assets": 3601563.98, "revenue": 669848.29, "gross_profit": 562589.17,
        "net_profit": 25577.45, "num_shares": 15340910.00, "eps": 1.67, "book_value": 74.29, "roe": 2.24
    }}
]


class Command(BaseCommand):
    help = 'Seeds quarterly financials for CGH'

    def handle(self, *args, **kwargs) -> None:
        self.stdout.write('Seeding CGH Quarterly Financials...')
        self._ensure_company()
        self._seed_reports()
        self.stdout.write(self.style.SUCCESS('Successfully seeded CGH quarterly data'))

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
        for report in _CGH_QUARTERLY:
            self._upsert_report(report)

    def _upsert_report(self, r: dict) -> None:
        d = r['data']
        FinancialReport.objects.update_or_create(
            ticker='CGH',
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
