from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds HBL quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding HBL quarterly financial data...')

        # Ensure HBL company exists
        company, _ = Company.objects.get_or_create(
            symbol='HBL',
            defaults={
                'name': 'Himalayan Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 22581662.53,
                    'retained_earnings': -10467917.57,
                    'reserves': 26191205.93,
                    'total_equity': 38832227.63,
                    'total_assets': 406902211.86,
                    'deposits': 338181830.75,
                    'borrowings': 0,
                    'loans_bfis': 11674090.13,
                    'loans_customers': 231414300.92,
                    'investment_securities': 44382315.80,
                    'interest_income': 17282439.37,
                    'net_interest_income': 6832100.62,
                    'total_operating_income': 8328823.25,
                    'operating_profit': 1156183.65,
                    'net_profit': 762536.32,
                    'distributable_profit': -10467917.57,
                    'num_shares': 225816625.32,
                    'eps': 4.50,
                    'book_value': 171.96,
                    'roe': 2.62,
                    'car': 11.26,
                    'npl': 7.98,
                    'cost_of_funds': 3.92,
                    'cd_ratio': 75.01,
                    'base_rate': 5.46,
                    'interest_spread': 2.84,
                },
                2: {
                    'paid_up_capital': 22581662.53,
                    'retained_earnings': -9073065.21,
                    'reserves': 25308755.06,
                    'total_equity': 39344629.11,
                    'total_assets': 400243766.09,
                    'deposits': 332159169.22,
                    'borrowings': 0,
                    'loans_bfis': 11145757.45,
                    'loans_customers': 234257795.27,
                    'investment_securities': 43691448.02,
                    'interest_income': 11811788.28,
                    'net_interest_income': 4702327.90,
                    'total_operating_income': 5712951.81,
                    'operating_profit': 1853787.43,
                    'net_profit': 1292681.91,
                    'distributable_profit': -9073065.21,
                    'num_shares': 225816625.32,
                    'eps': 11.45,
                    'book_value': 174.23,
                    'roe': 6.57,
                    'car': 11.73,
                    'npl': 4.65,
                    'cost_of_funds': 4.04,
                    'cd_ratio': 74.89,
                    'base_rate': 5.66,
                    'interest_spread': 3.07,
                },
                1: {
                    'paid_up_capital': 22581662.53,
                    'retained_earnings': -7546487.43,
                    'reserves': 24549083.91,
                    'total_equity': 40111535.75,
                    'total_assets': 384674583.03,
                    'deposits': 315115801.32,
                    'borrowings': 0,
                    'loans_bfis': 10810569.96,
                    'loans_customers': 232735984.61,
                    'investment_securities': 40431184.30,
                    'interest_income': 6224375.62,
                    'net_interest_income': 2507111.35,
                    'total_operating_income': 3054545.35,
                    'operating_profit': 1056623.59,
                    'net_profit': 702894.98,
                    'distributable_profit': -7546487.43,
                    'num_shares': 225816625.32,
                    'eps': 12.45,
                    'book_value': 177.63,
                    'roe': 7.01,
                    'car': 12.29,
                    'npl': 7.39,
                    'cost_of_funds': 4.26,
                    'cd_ratio': 76.15,
                    'base_rate': 6.08,
                    'interest_spread': 3.34,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 21656615.63,
                    'retained_earnings': -7101527.36,
                    'reserves': 23359966.79,
                    'total_equity': 37915055.06,
                    'total_assets': 372947315.68,
                    'deposits': 309158672.47,
                    'borrowings': 0,
                    'loans_bfis': 10405889.59,
                    'loans_customers': 232858288.11,
                    'investment_securities': 40506834.19,
                    'interest_income': 27700811.43,
                    'net_interest_income': 10456690.27,
                    'total_operating_income': 12521357.44,
                    'operating_profit': 5436492.91,
                    'net_profit': 1512532.12,
                    'distributable_profit': -7101527.36,
                    'num_shares': 216566156.32,
                    'eps': 6.98,
                    'book_value': 175.07,
                    'roe': 4.06,
                    'car': 11.64,
                    'npl': 7.28,
                    'cost_of_funds': 4.84,
                    'cd_ratio': 81.35,
                    'base_rate': 6.63,
                    'interest_spread': 3.29,
                },
                3: {
                    'paid_up_capital': 21656615.63,
                    'retained_earnings': -7363460.00,
                    'reserves': 22835904.06,
                    'total_equity': 37129059.70,
                    'total_assets': 368405115.34,
                    'deposits': 301137978.38,
                    'borrowings': 0,
                    'loans_bfis': 9790477.99,
                    'loans_customers': 233534866.45,
                    'investment_securities': 43153744.37,
                    'interest_income': 21010924.21,
                    'net_interest_income': 7752411.14,
                    'total_operating_income': 9109581.92,
                    'operating_profit': 3811531.51,
                    'net_profit': 500048.14,
                    'distributable_profit': -7363460.00,
                    'num_shares': 216566156.32,
                    'eps': 3.08,
                    'book_value': 171.44,
                    'roe': 1.80,
                    'car': 10.84,
                    'npl': 7.68,
                    'cost_of_funds': 5.03,
                    'cd_ratio': 79.38,
                    'base_rate': 6.80,
                    'interest_spread': 3.55,
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
                    ticker='HBL',
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
            f'\n✓ Successfully processed quarterly reports for HBL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
