from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds LSL quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding LSL quarterly financial data...')

        # Ensure LSL company exists
        company, _ = Company.objects.get_or_create(
            symbol='LSL',
            defaults={
                'name': 'Laxmi Sunrise Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 26781163.00,
                    'retained_earnings': 516139.00,
                    'reserves': 19589830.00,
                    'total_equity': 46887132.00,
                    'total_assets': 490645637.00,
                    'deposits': 403956023.00,
                    'borrowings': 595531.00,
                    'loans_bfis': 8938233.00,
                    'loans_customers': 302966478.00,
                    'investment_securities': 101440462.00,
                    'interest_income': 18911243.00,
                    'net_interest_income': 7876279.00,
                    'total_operating_income': 10857154.00,
                    'operating_profit': 2950916.00,
                    'net_profit': 2038184.00,
                    'distributable_profit': 516139.00,
                    'num_shares': 267811630.00,
                    'eps': 10.15,
                    'book_value': 175.08,
                    'roe': 5.80,
                    'car': 11.90,
                    'npl': 5.29,
                    'cost_of_funds': 3.45,
                    'cd_ratio': 77.04,
                    'base_rate': 5.20,
                    'interest_spread': 3.40,
                },
                2: {
                    'paid_up_capital': 26781163.00,
                    'retained_earnings': -842713.00,
                    'reserves': 18580948.00,
                    'total_equity': 44519398.00,
                    'total_assets': 462317626.00,
                    'deposits': 384230854.00,
                    'borrowings': 563443.00,
                    'loans_bfis': 8827403.00,
                    'loans_customers': 287903154.00,
                    'investment_securities': 101909352.00,
                    'interest_income': 12820129.00,
                    'net_interest_income': 5249037.00,
                    'total_operating_income': 7343988.00,
                    'operating_profit': -159808.00,
                    'net_profit': -273615.00,
                    'distributable_profit': -842713.00,
                    'num_shares': 267811630.00,
                    'eps': -2.04,
                    'book_value': 166.23,
                    'roe': -1.23,
                    'car': 11.79,
                    'npl': 5.50,
                    'cost_of_funds': 3.64,
                    'cd_ratio': 77.44,
                    'base_rate': 5.47,
                    'interest_spread': 3.54,
                },
                1: {
                    'paid_up_capital': 24346512.00,
                    'retained_earnings': 2623779.00,
                    'reserves': 18044829.00,
                    'total_equity': 45015120.00,
                    'total_assets': 451720475.00,
                    'deposits': 375009644.00,
                    'borrowings': 563443.00,
                    'loans_bfis': 8667132.00,
                    'loans_customers': 282377407.00,
                    'investment_securities': 98209925.00,
                    'interest_income': 6710122.00,
                    'net_interest_income': 2715176.00,
                    'total_operating_income': 3916981.00,
                    'operating_profit': 438172.00,
                    'net_profit': 332331.00,
                    'distributable_profit': 2623779.00,
                    'num_shares': 243465120.00,
                    'eps': 5.46,
                    'book_value': 184.89,
                    'roe': 2.95,
                    'car': 12.49,
                    'npl': 5.42,
                    'cost_of_funds': 4.05,
                    'cd_ratio': 77.09,
                    'base_rate': 5.89,
                    'interest_spread': 3.66,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 24346512.00,
                    'retained_earnings': 3005372.00,
                    'reserves': 18087149.00,
                    'total_equity': 45439033.00,
                    'total_assets': 443709908.00,
                    'deposits': 367053706.00,
                    'borrowings': 548495.00,
                    'loans_bfis': 8233948.00,
                    'loans_customers': 275040178.00,
                    'investment_securities': 98415987.00,
                    'interest_income': 29455960.00,
                    'net_interest_income': 11376389.00,
                    'total_operating_income': 14684603.00,
                    'operating_profit': 6098957.00,
                    'net_profit': 4116967.00,
                    'distributable_profit': 3005372.00,
                    'num_shares': 243465120.00,
                    'eps': 16.91,
                    'book_value': 186.63,
                    'roe': 9.58,
                    'car': 12.73,
                    'npl': 4.25,
                    'cost_of_funds': 4.47,
                    'cd_ratio': 77.15,
                    'base_rate': 6.50,
                    'interest_spread': 3.51,
                },
                3: {
                    'paid_up_capital': 24346512.00,
                    'retained_earnings': 772720.00,
                    'reserves': 17769586.00,
                    'total_equity': 42888818.00,
                    'total_assets': 417949336.00,
                    'deposits': 344203067.00,
                    'borrowings': 1035531.00,
                    'loans_bfis': 7721654.00,
                    'loans_customers': 276046193.00,
                    'investment_securities': 74165742.00,
                    'interest_income': 21609522.00,
                    'net_interest_income': 7893573.00,
                    'total_operating_income': 10245078.00,
                    'operating_profit': 2529374.00,
                    'net_profit': 1652163.00,
                    'distributable_profit': 772720.00,
                    'num_shares': 243465120.00,
                    'eps': 9.05,
                    'book_value': 176.16,
                    'roe': 5.14,
                    'car': 11.76,
                    'npl': 5.86,
                    'cost_of_funds': 4.71,
                    'cd_ratio': 82.48,
                    'base_rate': 6.72,
                    'interest_spread': 3.67,
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
                    ticker='LSL',
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
            f'\n✓ Successfully processed quarterly reports for LSL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
