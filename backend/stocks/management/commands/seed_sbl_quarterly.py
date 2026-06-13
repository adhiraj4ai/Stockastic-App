from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds SBL quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding SBL quarterly financial data...')

        # Ensure SBL company exists
        company, _ = Company.objects.get_or_create(
            symbol='SBL',
            defaults={
                'name': 'Siddhartha Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 18294479.20,
                    'retained_earnings': 836925.46,
                    'reserves': 16432012.42,
                    'total_equity': 35563417.08,
                    'total_assets': 366484968.19,
                    'deposits': 303643231.27,
                    'borrowings': 2751942.06,
                    'loans_bfis': 8851208.12,
                    'loans_customers': 230021810.26,
                    'investment_securities': 66906886.99,
                    'interest_income': 15459263.84,
                    'net_interest_income': 6528874.45,
                    'total_operating_income': 8832372.48,
                    'operating_profit': 2947185.55,
                    'net_profit': 2014855.23,
                    'distributable_profit': 836925.46,
                    'num_shares': 182944791.99,
                    'eps': 14.68,
                    'book_value': 194.39,
                    'roe': 7.55,
                    'car': 13.11,
                    'npl': 3.71,
                    'cost_of_funds': 3.64,
                    'cd_ratio': 77.92,
                    'base_rate': 5.24,
                    'interest_spread': 3.71,
                },
                2: {
                    'paid_up_capital': 14794479.20,
                    'retained_earnings': 584501.58,
                    'reserves': 15870905.99,
                    'total_equity': 31249886.77,
                    'total_assets': 349273419.82,
                    'deposits': 290470798.27,
                    'borrowings': 4229680.38,
                    'loans_bfis': 8460430.85,
                    'loans_customers': 225613159.02,
                    'investment_securities': 67564370.77,
                    'interest_income': 10431270.07,
                    'net_interest_income': 4328012.21,
                    'total_operating_income': 5979108.22,
                    'operating_profit': 1968406.24,
                    'net_profit': 1326653.25,
                    'distributable_profit': 2747060.58,
                    'num_shares': 147944791.99,
                    'eps': 17.93,
                    'book_value': 211.23,
                    'roe': 8.49,
                    'car': 12.18,
                    'npl': 3.45,
                    'cost_of_funds': 3.9,
                    'cd_ratio': 79.05,
                    'base_rate': 5.6,
                    'interest_spread': 3.9,
                },
                1: {
                    'paid_up_capital': 14089980.19,
                    'retained_earnings': 1616196.41,
                    'reserves': 15017280.71,
                    'total_equity': 30723457.32,
                    'total_assets': 331925760.94,
                    'deposits': 273243085.82,
                    'borrowings': 4009899.71,
                    'loans_bfis': 7975461.73,
                    'loans_customers': 217985056.40,
                    'investment_securities': 53083184.57,
                    'interest_income': 5334961.22,
                    'net_interest_income': 2162568.55,
                    'total_operating_income': 3090625.39,
                    'operating_profit': 506092.83,
                    'net_profit': 324091.37,
                    'distributable_profit': 1616196.41,
                    'num_shares': 140899801.90,
                    'eps': 9.20,
                    'book_value': 218.05,
                    'roe': 4.22,
                    'car': 12.21,
                    'npl': 3.8,
                    'cost_of_funds': 4.12,
                    'cd_ratio': 81.23,
                    'base_rate': 5.9,
                    'interest_spread': 3.98,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 14089980.19,
                    'retained_earnings': 1862787.25,
                    'reserves': 15041350.84,
                    'total_equity': 30994118.28,
                    'total_assets': 338780164.06,
                    'deposits': 280321367.83,
                    'borrowings': 5839097.14,
                    'loans_bfis': 8091531.80,
                    'loans_customers': 214542377.47,
                    'investment_securities': 54719357.05,
                    'interest_income': 22312191.83,
                    'net_interest_income': 8439920.12,
                    'total_operating_income': 11156840.37,
                    'operating_profit': 5029857.73,
                    'net_profit': 3395285.73,
                    'distributable_profit': 1862787.25,
                    'num_shares': 140899801.90,
                    'eps': 24.10,
                    'book_value': 219.97,
                    'roe': 10.95,
                    'car': 11.77,
                    'npl': 2.62,
                    'cost_of_funds': 4.39,
                    'cd_ratio': 76.92,
                    'base_rate': 6.42,
                    'interest_spread': 3.98,
                },
                3: {
                    'paid_up_capital': 14089980.19,
                    'retained_earnings': 188449.75,
                    'reserves': 14954873.56,
                    'total_equity': 29233303.50,
                    'total_assets': 313084093.95,
                    'deposits': 247642460.80,
                    'borrowings': 7534044.60,
                    'loans_bfis': 7296819.53,
                    'loans_customers': 207935280.39,
                    'investment_securities': 59523277.43,
                    'interest_income': 16766478.84,
                    'net_interest_income': 6336204.46,
                    'total_operating_income': 8159305.06,
                    'operating_profit': 2387295.34,
                    'net_profit': 1668260.48,
                    'distributable_profit': 188449.75,
                    'num_shares': 140899801.90,
                    'eps': 15.79,
                    'book_value': 207.48,
                    'roe': 7.61,
                    'car': 11.18,
                    'npl': 4.04,
                    'cost_of_funds': 4.62,
                    'cd_ratio': 83.96,
                    'base_rate': 6.43,
                    'interest_spread': 3.98,
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
                    ticker='SBL',
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
            f'\n✓ Successfully processed quarterly reports for SBL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
