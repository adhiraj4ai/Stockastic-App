from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds NABIL quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding NABIL quarterly financial data...')

        # Ensure NABIL company exists
        company, _ = Company.objects.get_or_create(
            symbol='NABIL',
            defaults={
                'name': 'Nabil Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 32056997.00,
                    'retained_earnings': 4373617.00,
                    'reserves': 34400229.00,
                    'total_equity': 70830843.00,
                    'total_assets': 718429050.00,
                    'deposits': 578345768.00,
                    'borrowings': 0,
                    'loans_bfis': 16160596.00,
                    'loans_customers': 447942202.00,
                    'investment_securities': 126679829.00,
                    'interest_income': 28443665.00,
                    'net_interest_income': 12459400.00,
                    'total_operating_income': 16229983.00,
                    'operating_profit': 9610629.00,
                    'net_profit': 6764646.00,
                    'distributable_profit': 4373617.00,
                    'num_shares': 320569970.00,
                    'eps': 28.14,
                    'book_value': 220.95,
                    'roe': 12.73,
                    'car': 12.51,
                    'npl': 4.37,
                    'cost_of_funds': 3.25,
                    'cd_ratio': 79.50,
                    'base_rate': 4.65,
                    'interest_spread': 3.31,
                },
                2: {
                    'paid_up_capital': 32056997.00,
                    'retained_earnings': 3273032.00,
                    'reserves': 33428056.00,
                    'total_equity': 68758085.00,
                    'total_assets': 697025625.00,
                    'deposits': 566059414.00,
                    'borrowings': 0,
                    'loans_bfis': 15895783.00,
                    'loans_customers': 434738445.00,
                    'investment_securities': 129389795.00,
                    'interest_income': 19200838.00,
                    'net_interest_income': 8087288.00,
                    'total_operating_income': 10631729.00,
                    'operating_profit': 6572698.00,
                    'net_profit': 4759641.00,
                    'distributable_profit': 3273032.00,
                    'num_shares': 320569970.00,
                    'eps': 29.69,
                    'book_value': 214.49,
                    'roe': 13.84,
                    'car': 12.77,
                    'npl': 4.25,
                    'cost_of_funds': 3.62,
                    'cd_ratio': 78.12,
                    'base_rate': 5.04,
                    'interest_spread': 3.54,
                },
                1: {
                    'paid_up_capital': 27056997.00,
                    'retained_earnings': 5635298.00,
                    'reserves': 32439874.00,
                    'total_equity': 65132169.00,
                    'total_assets': 675523529.00,
                    'deposits': 556618505.00,
                    'borrowings': 0,
                    'loans_bfis': 15049512.00,
                    'loans_customers': 421026606.00,
                    'investment_securities': 134806744.00,
                    'interest_income': 9801139.00,
                    'net_interest_income': 3901260.00,
                    'total_operating_income': 5274110.00,
                    'operating_profit': 2579886.00,
                    'net_profit': 1756991.00,
                    'distributable_profit': 5635298.00,
                    'num_shares': 270569970.00,
                    'eps': 25.97,
                    'book_value': 240.72,
                    'roe': 10.79,
                    'car': 12.67,
                    'npl': 4.31,
                    'cost_of_funds': 4.13,
                    'cd_ratio': 78.14,
                    'base_rate': 5.58,
                    'interest_spread': 3.51,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 27056997.00,
                    'retained_earnings': 4773059.00,
                    'reserves': 31909517.00,
                    'total_equity': 63739572.00,
                    'total_assets': 638155760.00,
                    'deposits': 524625959.00,
                    'borrowings': 0,
                    'loans_bfis': 14195506.00,
                    'loans_customers': 412795547.00,
                    'investment_securities': 117289485.00,
                    'interest_income': 40470486.00,
                    'net_interest_income': 16327297.00,
                    'total_operating_income': 21005110.00,
                    'operating_profit': 10847850.00,
                    'net_profit': 7127566.00,
                    'distributable_profit': 4773059.00,
                    'num_shares': 270569970.00,
                    'eps': 26.34,
                    'book_value': 235.58,
                    'roe': 11.64,
                    'car': 11.94,
                    'npl': 4.27,
                    'cost_of_funds': 4.41,
                    'cd_ratio': 82.48,
                    'base_rate': 5.83,
                    'interest_spread': 3.57,
                },
                3: {
                    'paid_up_capital': 27056997.00,
                    'retained_earnings': 2874126.00,
                    'reserves': 31315515.00,
                    'total_equity': 61246639.00,
                    'total_assets': 611861882.00,
                    'deposits': 502106195.00,
                    'borrowings': 0,
                    'loans_bfis': 14666374.00,
                    'loans_customers': 401162306.00,
                    'investment_securities': 101711639.00,
                    'interest_income': 30313792.00,
                    'net_interest_income': 12054425.00,
                    'total_operating_income': 15298265.00,
                    'operating_profit': 7622335.00,
                    'net_profit': 5051419.00,
                    'distributable_profit': 2874126.00,
                    'num_shares': 270569970.00,
                    'eps': 24.89,
                    'book_value': 226.36,
                    'roe': 11.00,
                    'car': 11.72,
                    'npl': 4.96,
                    'cost_of_funds': 4.59,
                    'cd_ratio': 82.31,
                    'base_rate': 5.97,
                    'interest_spread': 3.57,
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
                    ticker='NABIL',
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
            f'\n✓ Successfully processed quarterly reports for NABIL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
