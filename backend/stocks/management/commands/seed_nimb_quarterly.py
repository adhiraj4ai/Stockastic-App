from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds NIMB quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding NIMB quarterly financial data...')

        # Ensure NIMB company exists
        company, _ = Company.objects.get_or_create(
            symbol='NIMB',
            defaults={
                'name': 'Nepal Investment Mega Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 34128595.00,
                    'retained_earnings': -3103085.00,
                    'reserves': 37136432.00,
                    'total_equity': 68161942.00,
                    'total_assets': 616006747.00,
                    'deposits': 526408857.00,
                    'borrowings': 0,
                    'loans_bfis': 15374709.00,
                    'loans_customers': 326130569.00,
                    'investment_securities': 156622812.00,
                    'interest_income': 23725140.00,
                    'net_interest_income': 9579558.00,
                    'total_operating_income': 12622683.00,
                    'operating_profit': 4779666.00,
                    'net_profit': 3146769.00,
                    'distributable_profit': -3103085.00,
                    'num_shares': 341285950.00,
                    'eps': 12.29,
                    'book_value': 199.72,
                    'roe': 6.16,
                    'car': 12.41,
                    'npl': 8.41,
                    'cost_of_funds': 3.37,
                    'cd_ratio': 68.37,
                    'base_rate': 4.90,
                    'interest_spread': 2.79,
                },
                2: {
                    'paid_up_capital': 34128595.00,
                    'retained_earnings': -3621062.00,
                    'reserves': 35963118.00,
                    'total_equity': 66470651.00,
                    'total_assets': 607417875.00,
                    'deposits': 519101304.00,
                    'borrowings': 0,
                    'loans_bfis': 15348486.00,
                    'loans_customers': 328162322.00,
                    'investment_securities': 117715010.00,
                    'interest_income': 16138515.00,
                    'net_interest_income': 6420321.00,
                    'total_operating_income': 8584844.00,
                    'operating_profit': 2402128.00,
                    'net_profit': 1613034.00,
                    'distributable_profit': -3621062.00,
                    'num_shares': 341285950.00,
                    'eps': 9.45,
                    'book_value': 194.77,
                    'roe': 4.85,
                    'car': 12.56,
                    'npl': 7.90,
                    'cost_of_funds': 3.63,
                    'cd_ratio': 69.63,
                    'base_rate': 5.20,
                    'interest_spread': 3.04,
                },
                1: {
                    'paid_up_capital': 34128595.00,
                    'retained_earnings': -1169440.00,
                    'reserves': 33896055.00,
                    'total_equity': 66855210.00,
                    'total_assets': 583758593.00,
                    'deposits': 493851081.00,
                    'borrowings': 0,
                    'loans_bfis': 14990190.00,
                    'loans_customers': 330814880.00,
                    'investment_securities': 142037336.00,
                    'interest_income': 8340324.00,
                    'net_interest_income': 3243125.00,
                    'total_operating_income': 4310649.00,
                    'operating_profit': 150292.00,
                    'net_profit': 45050.00,
                    'distributable_profit': -1169440.00,
                    'num_shares': 341285950.00,
                    'eps': 0.53,
                    'book_value': 195.89,
                    'roe': 0.27,
                    'car': 13.48,
                    'npl': 6.63,
                    'cost_of_funds': 3.92,
                    'cd_ratio': 72.86,
                    'base_rate': 5.69,
                    'interest_spread': 3.44,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 34128595.00,
                    'retained_earnings': 491356.00,
                    'reserves': 32741724.00,
                    'total_equity': 67361675.00,
                    'total_assets': 565663355.00,
                    'deposits': 472347472.00,
                    'borrowings': 2744000.00,
                    'loans_bfis': 15355688.00,
                    'loans_customers': 326932297.00,
                    'investment_securities': 138556342.00,
                    'interest_income': 36101210.00,
                    'net_interest_income': 14128167.00,
                    'total_operating_income': 17641938.00,
                    'operating_profit': 10142766.00,
                    'net_profit': 6756649.00,
                    'distributable_profit': 491356.00,
                    'num_shares': 341285950.00,
                    'eps': 19.80,
                    'book_value': 197.38,
                    'roe': 10.60,
                    'car': 13.73,
                    'npl': 5.85,
                    'cost_of_funds': 4.25,
                    'cd_ratio': 74.44,
                    'base_rate': 5.78,
                    'interest_spread': 3.01,
                },
                3: {
                    'paid_up_capital': 34128595.00,
                    'retained_earnings': -1104144.00,
                    'reserves': 31953556.00,
                    'total_equity': 64978007.00,
                    'total_assets': 549625805.00,
                    'deposits': 455890952.00,
                    'borrowings': 5494000.00,
                    'loans_bfis': 14280036.00,
                    'loans_customers': 327823499.00,
                    'investment_securities': 115729580.00,
                    'interest_income': 26800101.00,
                    'net_interest_income': 10314926.00,
                    'total_operating_income': 12795348.00,
                    'operating_profit': 6611410.00,
                    'net_profit': 4540005.00,
                    'distributable_profit': -1104144.00,
                    'num_shares': 341285950.00,
                    'eps': 17.74,
                    'book_value': 190.39,
                    'roe': 9.32,
                    'car': 13.33,
                    'npl': 6.06,
                    'cost_of_funds': 4.39,
                    'cd_ratio': 76.76,
                    'base_rate': 6.10,
                    'interest_spread': 3.45,
                }
            }
        }

        created_count = 0
        updated_count = 0

        for fiscal_year, quarters in quarterly_data.items():
            formatted_fy = fiscal_year.replace('/', '-')
            for quarter, d in quarters.items():
                # Prepare JSON data conforming to BANK_QUARTERLY template structure
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
                    ticker='NIMB',
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
            f'\n✓ Successfully processed quarterly reports for NIMB'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
