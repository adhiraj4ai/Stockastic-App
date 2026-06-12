from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds SANIMA quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding SANIMA quarterly financial data...')

        # Ensure SANIMA company exists
        company, _ = Company.objects.get_or_create(
            symbol='SANIMA',
            defaults={
                'name': 'Sanima Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 15581525.41,
                    'retained_earnings': 2141527.89,
                    'reserves': 8663193.47,
                    'total_equity': 26386246.77,
                    'total_assets': 274189150.39,
                    'deposits': 233869125.22,
                    'borrowings': 0.0,
                    'loans_bfis': 7819076.06,
                    'loans_customers': 190776626.85,
                    'investment_securities': 34184553.87,
                    'interest_income': 12414344.73,
                    'net_interest_income': 5160016.18,
                    'total_operating_income': 7279647.79,
                    'operating_profit': 3320691.87,
                    'net_profit': 2350202.91,
                    'distributable_profit': 2141527.89,
                    'num_shares': 155815254.14,
                    'eps': 20.11,
                    'book_value': 169.34,
                    'roe': 11.88,
                    'car': 13.16,
                    'npl': 3.99,
                    'cost_of_funds': 3.75,
                    'cd_ratio': 82.76,
                    'base_rate': 5.11,
                    'interest_spread': 3.48,
                },
                2: {
                    'paid_up_capital': 13581525.41,
                    'retained_earnings': 1610256.78,
                    'reserves': 8221600.39,
                    'total_equity': 23413382.58,
                    'total_assets': 270383013.52,
                    'deposits': 231050046.83,
                    'borrowings': 2163000.00,
                    'loans_bfis': 7920531.97,
                    'loans_customers': 183862229.80,
                    'investment_securities': 36172051.80,
                    'interest_income': 8466396.97,
                    'net_interest_income': 3428085.66,
                    'total_operating_income': 4674820.17,
                    'operating_profit': 1959717.36,
                    'net_profit': 1391075.72,
                    'distributable_profit': 1610256.78,
                    'num_shares': 135815254.14,
                    'eps': 20.48,
                    'book_value': 172.39,
                    'roe': 11.88,
                    'car': 12.57,
                    'npl': 3.63,
                    'cost_of_funds': 4.02,
                    'cd_ratio': 79.42,
                    'base_rate': 5.25,
                    'interest_spread': 3.32,
                },
                1: {
                    'paid_up_capital': 13581525.41,
                    'retained_earnings': 2130448.95,
                    'reserves': 7744809.96,
                    'total_equity': 23456784.33,
                    'total_assets': 266521035.03,
                    'deposits': 2108250.00,
                    'borrowings': 0.0,
                    'loans_bfis': 7615884.39,
                    'loans_customers': 177560480.48,
                    'investment_securities': 31646145.19,
                    'interest_income': 4332202.82,
                    'net_interest_income': 1688524.47,
                    'total_operating_income': 2382849.44,
                    'operating_profit': 657617.64,
                    'net_profit': 454918.15,
                    'distributable_profit': -414778.09,
                    'num_shares': 135815254.14,
                    'eps': 13.40,
                    'book_value': 172.71,
                    'roe': 7.76,
                    'car': 12.76,
                    'npl': 3.91,
                    'cost_of_funds': 4.32,
                    'cd_ratio': 79.23,
                    'base_rate': 5.59,
                    'interest_spread': 3.65,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 13581525.41,
                    'retained_earnings': 2780720.66,
                    'reserves': 6567134.96,
                    'total_equity': 22929381.04,
                    'total_assets': 263447489.73,
                    'deposits': 223954679.23,
                    'borrowings': 2063250.00,
                    'loans_bfis': 7014125.24,
                    'loans_customers': 176440505.81,
                    'investment_securities': 29355983.94,
                    'interest_income': 18040787.83,
                    'net_interest_income': 6355997.91,
                    'total_operating_income': 8601565.84,
                    'operating_profit': 3574110.33,
                    'net_profit': 2571155.95,
                    'distributable_profit': 2780720.66,
                    'num_shares': 135815254.14,
                    'eps': 18.93,
                    'book_value': 168.83,
                    'roe': 11.73,
                    'car': 13.01,
                    'npl': 3.01,
                    'cost_of_funds': 4.70,
                    'cd_ratio': 81.03,
                    'base_rate': 6.12,
                    'interest_spread': 3.68,
                },
                3: {
                    'paid_up_capital': 13581525.41,
                    'retained_earnings': 2198563.01,
                    'reserves': 6129646.02,
                    'total_equity': 21909734.44,
                    'total_assets': 252671241.29,
                    'deposits': 213778953.69,
                    'borrowings': 2615350.00,
                    'loans_bfis': 6712707.14,
                    'loans_customers': 173096650.45,
                    'investment_securities': 30714064.49,
                    'interest_income': 13024712.82,
                    'net_interest_income': 4282861.16,
                    'total_operating_income': 6045790.55,
                    'operating_profit': 2251366.36,
                    'net_profit': 1652476.83,
                    'distributable_profit': 2198563.01,
                    'num_shares': 135815254.14,
                    'eps': 16.22,
                    'book_value': 161.32,
                    'roe': 10.06,
                    'car': 12.93,
                    'npl': 3.42,
                    'cost_of_funds': 4.99,
                    'cd_ratio': 81.04,
                    'base_rate': 6.43,
                    'interest_spread': 3.60,
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
                    ticker='SANIMA',
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
            f'\n✓ Successfully processed quarterly reports for SANIMA'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
