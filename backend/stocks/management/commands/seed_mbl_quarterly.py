from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds MBL quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding MBL quarterly financial data...')

        # Ensure MBL company exists
        company, _ = Company.objects.get_or_create(
            symbol='MBL',
            defaults={
                'name': 'Machhapuchchhre Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 15086211.56,
                    'share_premium': 30881.77,
                    'retained_earnings': 762273.57,
                    'reserves': 7431617.19,
                    'total_equity': 23310984.09,
                    'total_assets': 249301924.81,
                    'deposits': 213563522.24,
                    'borrowings': 0,
                    'loans_bfis': 6858048.55,
                    'loans_customers': 159211232.46,
                    'investment_securities': 56990379.67,
                    'interest_income': 10134678.60,
                    'net_interest_income': 4398350.26,
                    'total_operating_income': 6093021.61,
                    'operating_profit': 2400198.25,
                    'net_profit': 1658659.81,
                    'distributable_profit': 762273.57,
                    'num_shares': 150862115.64,
                    'eps': 14.66,
                    'book_value': 154.52,
                    'roe': 9.49,
                    'car': 13.40,
                    'npl': 4.01,
                    'cost_of_funds': 3.40,
                    'cd_ratio': 77.67,
                    'base_rate': 5.19,
                    'interest_spread': 3.53,
                },
                2: {
                    'paid_up_capital': 12086211.56,
                    'share_premium': 30881.77,
                    'retained_earnings': 436380.13,
                    'reserves': 6981825.55,
                    'total_equity': 19535299.01,
                    'total_assets': 238205661.33,
                    'deposits': 204047175.13,
                    'borrowings': 2246118.92,
                    'loans_bfis': 6231337.94,
                    'loans_customers': 154009533.46,
                    'investment_securities': 37129948.09,
                    'interest_income': 6852493.25,
                    'net_interest_income': 2941016.74,
                    'total_operating_income': 4026991.48,
                    'operating_profit': 1456891.45,
                    'net_profit': 1011173.46,
                    'distributable_profit': 436380.13,
                    'num_shares': 120862115.64,
                    'eps': 16.73,
                    'book_value': 161.63,
                    'roe': 10.35,
                    'car': 12.16,
                    'npl': 4.25,
                    'cost_of_funds': 3.56,
                    'cd_ratio': 77.99,
                    'base_rate': 5.48,
                    'interest_spread': 3.83,
                },
                1: {
                    'paid_up_capital': 12086211.56,
                    'share_premium': 30881.77,
                    'retained_earnings': -114282.44,
                    'reserves': 6683809.28,
                    'total_equity': 18686620.17,
                    'total_assets': 226591698.72,
                    'deposits': 193541014.05,
                    'borrowings': 2137795.90,
                    'loans_bfis': 6072768.54,
                    'loans_customers': 148652798.38,
                    'investment_securities': 46580040.39,
                    'interest_income': 3485403.83,
                    'net_interest_income': 1458948.27,
                    'total_operating_income': 2051978.08,
                    'operating_profit': 598431.04,
                    'net_profit': 417956.34,
                    'distributable_profit': -114282.44,
                    'num_shares': 120862115.64,
                    'eps': 13.83,
                    'book_value': 154.61,
                    'roe': 8.95,
                    'car': 12.17,
                    'npl': 4.13,
                    'cost_of_funds': 4.03,
                    'cd_ratio': 79.44,
                    'base_rate': 5.81,
                    'interest_spread': 3.65,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 11621357.27,
                    'share_premium': 30881.77,
                    'retained_earnings': 1072935.78,
                    'reserves': 6310010.44,
                    'total_equity': 19035185.25,
                    'total_assets': 217602071.52,
                    'deposits': 184176049.90,
                    'borrowings': 2143480.56,
                    'loans_bfis': 5809651.70,
                    'loans_customers': 141636859.41,
                    'investment_securities': 45511965.33,
                    'interest_income': 14580766.04,
                    'net_interest_income': 5756716.09,
                    'total_operating_income': 7440674.14,
                    'operating_profit': 3330238.93,
                    'net_profit': 2011461.52,
                    'distributable_profit': 1072935.78,
                    'num_shares': 116213572.73,
                    'eps': 17.31,
                    'book_value': 163.79,
                    'roe': 10.57,
                    'car': 13.32,
                    'npl': 3.83,
                    'cost_of_funds': 4.23,
                    'cd_ratio': 80.62,
                    'base_rate': 6.30,
                    'interest_spread': 3.79,
                },
                3: {
                    'paid_up_capital': 11621357.27,
                    'share_premium': 30881.77,
                    'retained_earnings': 70743.08,
                    'reserves': 6433046.64,
                    'total_equity': 18156028.75,
                    'total_assets': 208115078.23,
                    'deposits': 169659048.69,
                    'borrowings': 2128889.05,
                    'loans_bfis': 5706779.19,
                    'loans_customers': 140615040.52,
                    'investment_securities': 35381913.76,
                    'interest_income': 10916105.12,
                    'net_interest_income': 4250737.56,
                    'total_operating_income': 5542830.67,
                    'operating_profit': 2057818.48,
                    'net_profit': 1102627.84,
                    'distributable_profit': 70743.08,
                    'num_shares': 116213572.73,
                    'eps': 12.65,
                    'book_value': 156.23,
                    'roe': 8.10,
                    'car': 12.68,
                    'npl': 4.59,
                    'cost_of_funds': 4.42,
                    'cd_ratio': 84.76,
                    'base_rate': 6.52,
                    'interest_spread': 3.87,
                }
            }
        }

        created_count = 0
        updated_count = 0

        for fiscal_year, quarters in quarterly_data.items():
            formatted_fy = fiscal_year.replace('/', '-')
            for quarter, d in quarters.items():
                balance_sheet = {
                    'SUMMARY': {
                        'placement_bfis': d['loans_bfis'] * 1000,
                        'loans_customers': d['loans_customers'] * 1000,
                        'investment_securities': d['investment_securities'] * 1000,
                        'total_assets': d['total_assets'] * 1000,
                        'deposits_customers': d['deposits'] * 1000,
                        'borrowings': d['borrowings'] * 1000,
                        'paid_up_capital': d['paid_up_capital'] * 1000,
                        'reserves': d['reserves'] * 1000,
                        'total_equity': d['total_equity'] * 1000,
                    }
                }

                profit_loss = {
                    'PL': {
                        'interest_income': d['interest_income'] * 1000,
                        'net_interest_income': d['net_interest_income'] * 1000,
                        'net_fee_income': None,
                        'total_operating_income': d['total_operating_income'] * 1000,
                        'impairment_charges': None,
                        'operating_profit': d['operating_profit'] * 1000,
                        'net_profit': d['net_profit'] * 1000,
                        'distributable_profit': d['distributable_profit'] * 1000,
                    },
                    'RATIOS': {
                        'eps_annualized': d['eps'],
                        'npl': d['npl'],
                        'cost_of_funds': d['cost_of_funds'],
                        'cd_ratio': d['cd_ratio'],
                        'base_rate': d['base_rate'],
                        'spread': d['interest_spread'],
                        'book_value': d['book_value'],
                    }
                }

                # Create or update report
                report, created = FinancialReport.objects.update_or_create(
                    ticker='MBL',
                    fiscal_year=formatted_fy,
                    report_type='QUARTERLY',
                    quarter=quarter,
                    defaults={
                        'is_audited': False,
                        'report_template': 'BANK_QUARTERLY',
                        'balance_sheet': balance_sheet,
                        'profit_loss': profit_loss,
                        'key_ratios': None,
                        'paid_up_capital': Decimal(str(d['paid_up_capital'] * 1000)),
                        'reserves_and_surplus': Decimal(str(d['reserves'] * 1000)),
                        'net_profit': Decimal(str(d['net_profit'] * 1000)),
                        'eps': Decimal(str(d['eps'])),
                        'book_value': Decimal(str(d['book_value'])),
                        'return_on_equity': Decimal(str(d['roe'])),
                    }
                )

                if created:
                    created_count += 1
                    self.stdout.write(self.style.SUCCESS(f'✓ Created report for FY {formatted_fy} Q{quarter}'))
                else:
                    updated_count += 1
                    self.stdout.write(self.style.WARNING(f'⟳ Updated report for FY {formatted_fy} Q{quarter}'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Successfully processed quarterly reports for MBL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
