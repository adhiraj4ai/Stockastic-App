from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds NMB quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding NMB quarterly financial data...')

        # Ensure NMB company exists
        company, _ = Company.objects.get_or_create(
            symbol='NMB',
            defaults={
                'name': 'NMB Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 22285041.00,
                    'retained_earnings': 928940.00,
                    'reserves': 13687340.00,
                    'total_equity': 36901321.00,
                    'total_assets': 375401623.00,
                    'deposits': 297832117.00,
                    'borrowings': 1867500.00,
                    'loans_bfis': 11900933.00,
                    'loans_customers': 243830354.00,
                    'investment_securities': 32248619.00,
                    'interest_income': 15984078.00,
                    'net_interest_income': 7378022.00,
                    'total_operating_income': 10128175.00,
                    'operating_profit': 4272487.00,
                    'net_profit': 2687785.00,
                    'distributable_profit': 928940.00,
                    'num_shares': 222850410.00,
                    'eps': 16.08,
                    'book_value': 165.59,
                    'roe': 9.71,
                    'car': 12.77,
                    'npl': 4.95,
                    'cost_of_funds': 3.62,
                    'cd_ratio': 84.68,
                    'base_rate': 5.27,
                    'interest_spread': 3.50,
                },
                2: {
                    'paid_up_capital': 19285041.00,
                    'retained_earnings': 564313.00,
                    'reserves': 12812540.00,
                    'total_equity': 32661894.00,
                    'total_assets': 359135362.00,
                    'deposits': 291441042.00,
                    'borrowings': 3275333.00,
                    'loans_bfis': 11326026.00,
                    'loans_customers': 239470649.00,
                    'investment_securities': 30473302.00,
                    'interest_income': 10653507.00,
                    'net_interest_income': 4771476.00,
                    'total_operating_income': 6549212.00,
                    'operating_profit': 2509968.00,
                    'net_profit': 1648613.00,
                    'distributable_profit': 564313.00,
                    'num_shares': 192850410.00,
                    'eps': 17.10,
                    'book_value': 169.36,
                    'roe': 10.10,
                    'car': 11.81,
                    'npl': 4.56,
                    'cost_of_funds': 3.89,
                    'cd_ratio': 85.09,
                    'base_rate': 5.48,
                    'interest_spread': 3.78,
                },
                1: {
                    'paid_up_capital': 18366706.00,
                    'retained_earnings': 1943318.00,
                    'reserves': 12620367.00,
                    'total_equity': 32930391.00,
                    'total_assets': 360220850.00,
                    'deposits': 290605382.00,
                    'borrowings': 3553938.00,
                    'loans_bfis': 10890253.00,
                    'loans_customers': 234023130.00,
                    'investment_securities': 31261761.00,
                    'interest_income': 5594323.00,
                    'net_interest_income': 2487253.00,
                    'total_operating_income': 3444924.00,
                    'operating_profit': 1498463.00,
                    'net_profit': 915983.00,
                    'distributable_profit': 1943318.00,
                    'num_shares': 183667060.00,
                    'eps': 19.95,
                    'book_value': 179.29,
                    'roe': 11.13,
                    'car': 12.07,
                    'npl': 4.58,
                    'cost_of_funds': 4.05,
                    'cd_ratio': 81.88,
                    'base_rate': 5.89,
                    'interest_spread': 3.89,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 18366706.00,
                    'retained_earnings': 1909467.00,
                    'reserves': 12325588.00,
                    'total_equity': 32601761.00,
                    'total_assets': 352101478.00,
                    'deposits': 280926468.00,
                    'borrowings': 3987500.00,
                    'loans_bfis': 10514170.00,
                    'loans_customers': 229119342.00,
                    'investment_securities': 32508745.00,
                    'interest_income': 22267952.00,
                    'net_interest_income': 8020894.00,
                    'total_operating_income': 10881682.00,
                    'operating_profit': 5350207.00,
                    'net_profit': 3281791.00,
                    'distributable_profit': 1909467.00,
                    'num_shares': 183667060.00,
                    'eps': 17.87,
                    'book_value': 176.81,
                    'roe': 10.66,
                    'car': 12.03,
                    'npl': 3.72,
                    'cost_of_funds': 5.06,
                    'cd_ratio': 84.33,
                    'base_rate': 6.22,
                    'interest_spread': 3.82,
                },
                3: {
                    'paid_up_capital': 18366706.00,
                    'retained_earnings': 1311978.00,
                    'reserves': 11890849.00,
                    'total_equity': 31569532.00,
                    'total_assets': 346326725.00,
                    'deposits': 269094636.00,
                    'borrowings': 6644025.00,
                    'loans_bfis': 9432764.00,
                    'loans_customers': 225630657.00,
                    'investment_securities': 13462071.00,
                    'interest_income': 17215287.00,
                    'net_interest_income': 6490286.00,
                    'total_operating_income': 8650121.00,
                    'operating_profit': 3562226.00,
                    'net_profit': 2373289.00,
                    'distributable_profit': 1311978.00,
                    'num_shares': 183667060.00,
                    'eps': 17.23,
                    'book_value': 171.88,
                    'roe': 10.02,
                    'car': 12.18,
                    'npl': 4.47,
                    'cost_of_funds': 5.24,
                    'cd_ratio': 83.97,
                    'base_rate': 6.49,
                    'interest_spread': 3.80,
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
                    ticker='NMB',
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
            f'\n✓ Successfully processed quarterly reports for NMB'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
