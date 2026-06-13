from __future__ import annotations
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport

_THOUSANDS = 1000


class QuarterlyBankSeeder(BaseCommand):
    """Base class for quarterly bank financial report seeders.

    Subclasses must set `symbol`, `company_name`, and `quarterly_data`.
    Django will not register this as a command because the filename starts
    with an underscore.
    """

    symbol: str = ''
    company_name: str = ''
    sector: str = 'Commercial Banks'
    quarterly_data: dict = {}

    def handle(self, *args, **kwargs) -> None:
        self.stdout.write(f'Seeding {self.symbol} quarterly financial data...')
        self._ensure_company()
        created, updated = self._upsert_all()
        self._print_summary(created, updated)

    def _ensure_company(self) -> None:
        Company.all_objects.get_or_create(
            symbol=self.symbol,
            defaults={
                'name': self.company_name,
                'sector': self.sector,
                'instrument_type': 'Equity',
                'status': 'A',
            },
        )

    def _upsert_all(self) -> tuple[int, int]:
        created = updated = 0
        for fiscal_year, quarters in self.quarterly_data.items():
            for quarter, data in quarters.items():
                was_created = self._upsert_one(
                    fiscal_year.replace('/', '-'), quarter, data
                )
                if was_created:
                    created += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'Created FY {fiscal_year} Q{quarter}')
                    )
                else:
                    updated += 1
                    self.stdout.write(
                        self.style.WARNING(f'Updated FY {fiscal_year} Q{quarter}')
                    )
        return created, updated

    def _upsert_one(self, formatted_fy: str, quarter: int, d: dict) -> bool:
        _, created = FinancialReport.objects.update_or_create(
            ticker=self.symbol,
            fiscal_year=formatted_fy,
            report_type='QUARTERLY',
            quarter=quarter,
            defaults=self._build_defaults(d),
        )
        return created

    def _build_defaults(self, d: dict) -> dict:
        return {
            'is_audited': False,
            'report_template': 'BANK_QUARTERLY',
            'balance_sheet': self._build_balance_sheet(d),
            'profit_loss': self._build_profit_loss(d),
            'key_ratios': self._build_key_ratios(d),
            'paid_up_capital': Decimal(str(d['paid_up_capital'] * _THOUSANDS)),
            'reserves_and_surplus': Decimal(str(d['reserves'] * _THOUSANDS)),
            'net_profit': Decimal(str(d['net_profit'] * _THOUSANDS)),
            'eps': Decimal(str(d['eps'])),
            'book_value': Decimal(str(d['book_value'])),
            'return_on_equity': Decimal(str(d['roe'])),
        }

    @staticmethod
    def _build_balance_sheet(d: dict) -> dict:
        t = _THOUSANDS
        return {
            'SUMMARY': {
                'placement_bfis': d['loans_bfis'] * t,
                'loans_customers': d['loans_customers'] * t,
                'investment_securities': d['investment_securities'] * t,
                'total_assets': d['total_assets'] * t,
                'deposits_customers': d['deposits'] * t,
                'borrowings': d['borrowings'] * t,
                'paid_up_capital': d['paid_up_capital'] * t,
                'reserves': d['reserves'] * t,
                'total_equity': d['total_equity'] * t,
            }
        }

    @staticmethod
    def _build_profit_loss(d: dict) -> dict:
        t = _THOUSANDS
        return {
            'PL': {
                'interest_income': d['interest_income'] * t,
                'net_interest_income': d['net_interest_income'] * t,
                'net_fee_income': None,
                'total_operating_income': d['total_operating_income'] * t,
                'impairment_charges': None,
                'operating_profit': d['operating_profit'] * t,
                'net_profit': d['net_profit'] * t,
                'distributable_profit': d['distributable_profit'] * t,
            },
            'RATIOS': {
                'eps_annualized': d['eps'],
                'npl': d['npl'],
                'cost_of_funds': d['cost_of_funds'],
                'cd_ratio': d['cd_ratio'],
                'base_rate': d['base_rate'],
                'spread': d['interest_spread'],
                'book_value': d['book_value'],
            },
        }

    @staticmethod
    def _build_key_ratios(d: dict) -> dict:
        return {
            'Per Share': {
                'EPS (annualized)': d['eps'],
                'Book Value': d['book_value'],
            },
            'Performance': {
                'ROE': d['roe'],
                'CAR': d['car'],
                'NPL': d['npl'],
                'Cost of Funds': d['cost_of_funds'],
                'CD Ratio': d['cd_ratio'],
                'Base Rate': d['base_rate'],
                'Interest Spread': d['interest_spread'],
            },
        }

    def _print_summary(self, created: int, updated: int) -> None:
        self.stdout.write(
            self.style.SUCCESS(f'\nQuarterly reports for {self.symbol}')
        )
        self.stdout.write(f'  Created: {created}  Updated: {updated}')
