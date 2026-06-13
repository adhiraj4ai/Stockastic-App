from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds GBIME quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding GBIME quarterly financial data...')

        # Ensure GBIME company exists
        company, _ = Company.objects.get_or_create(
            symbol='GBIME',
            defaults={
                'name': 'Global IME Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 38115853.00,
                    'retained_earnings': 3005479.00,
                    'reserves': 26925894.00,
                    'total_equity': 68047226.00,
                    'total_assets': 774887689.00,
                    'deposits': 626003217.00,
                    'borrowings': 9033679.00,
                    'loans_bfis': 17043423.00,
                    'loans_customers': 439044883.00,
                    'investment_securities': 147500051.00,
                    'interest_income': 29818037.00,
                    'net_interest_income': 11884413.00,
                    'total_operating_income': 16027749.00,
                    'operating_profit': 5904678.00,
                    'net_profit': 4401178.00,
                    'distributable_profit': 3005479.00,
                    'num_shares': 381158530.00,
                    'eps': 15.40,
                    'book_value': 178.53,
                    'roe': 8.62,
                    'car': 12.06,
                    'npl': 4.97,
                    'cost_of_funds': 3.58,
                    'cd_ratio': 71.13,
                    'base_rate': 4.95,
                    'interest_spread': 3.30,
                },
                2: {
                    'paid_up_capital': 38115853.00,
                    'retained_earnings': 2426675.00,
                    'reserves': 26270848.00,
                    'total_equity': 66813376.00,
                    'total_assets': 748296593.00,
                    'deposits': 605880278.00,
                    'borrowings': 10331991.00,
                    'loans_bfis': 16169007.00,
                    'loans_customers': 432967256.00,
                    'investment_securities': 153407414.00,
                    'interest_income': 20087055.00,
                    'net_interest_income': 8022317.00,
                    'total_operating_income': 10870932.00,
                    'operating_profit': 4276327.00,
                    'net_profit': 3252117.00,
                    'distributable_profit': 2426675.00,
                    'num_shares': 381158530.00,
                    'eps': 17.06,
                    'book_value': 175.29,
                    'roe': 9.73,
                    'car': 12.17,
                    'npl': 4.91,
                    'cost_of_funds': 3.73,
                    'cd_ratio': 71.55,
                    'base_rate': 5.16,
                    'interest_spread': 3.43,
                },
                1: {
                    'paid_up_capital': 38115853.00,
                    'retained_earnings': 4849506.00,
                    'reserves': 25452353.00,
                    'total_equity': 68417712.00,
                    'total_assets': 729628551.00,
                    'deposits': 582254603.00,
                    'borrowings': 10257395.00,
                    'loans_bfis': 16104772.00,
                    'loans_customers': 421252080.00,
                    'investment_securities': 162229212.00,
                    'interest_income': 10321005.00,
                    'net_interest_income': 4133063.00,
                    'total_operating_income': 5516210.00,
                    'operating_profit': 2371636.00,
                    'net_profit': 1858650.00,
                    'distributable_profit': 4849506.00,
                    'num_shares': 381158530.00,
                    'eps': 19.51,
                    'book_value': 179.50,
                    'roe': 11.01,
                    'car': 12.98,
                    'npl': 4.98,
                    'cost_of_funds': 3.92,
                    'cd_ratio': 73.34,
                    'base_rate': 5.40,
                    'interest_spread': 3.48,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 38115853.00,
                    'retained_earnings': 5379300.00,
                    'reserves': 24210305.00,
                    'total_equity': 67705458.00,
                    'total_assets': 689746863.00,
                    'deposits': 550628438.00,
                    'borrowings': 12393476.00,
                    'loans_bfis': 15795204.00,
                    'loans_customers': 411791797.00,
                    'investment_securities': 148734000.00,
                    'interest_income': 43961495.00,
                    'net_interest_income': 16712277.00,
                    'total_operating_income': 21276431.00,
                    'operating_profit': 8770578.00,
                    'net_profit': 6204745.00,
                    'distributable_profit': 5379300.00,
                    'num_shares': 381158530.00,
                    'eps': 16.28,
                    'book_value': 177.63,
                    'roe': 9.61,
                    'car': 13.39,
                    'npl': 4.87,
                    'cost_of_funds': 4.30,
                    'cd_ratio': 76.07,
                    'base_rate': 5.76,
                    'interest_spread': 3.63,
                },
                3: {
                    'paid_up_capital': 38115853.00,
                    'retained_earnings': 3549252.00,
                    'reserves': 24452843.00,
                    'total_equity': 66117947.00,
                    'total_assets': 651477868.00,
                    'deposits': 517668834.00,
                    'borrowings': 12109421.00,
                    'loans_bfis': 14638595.00,
                    'loans_customers': 413286442.00,
                    'investment_securities': 113282021.00,
                    'interest_income': 33153390.00,
                    'net_interest_income': 12317191.00,
                    'total_operating_income': 15539810.00,
                    'operating_profit': 6336653.00,
                    'net_profit': 4534099.00,
                    'distributable_profit': 3549252.00,
                    'num_shares': 381158530.00,
                    'eps': 15.86,
                    'book_value': 173.47,
                    'roe': 9.14,
                    'car': 12.36,
                    'npl': 4.98,
                    'cost_of_funds': 4.65,
                    'cd_ratio': 78.04,
                    'base_rate': 6.38,
                    'interest_spread': 3.79,
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
                    ticker='GBIME',
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
            f'\n✓ Successfully processed quarterly reports for GBIME'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
