from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds PRVU quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding PRVU quarterly financial data...')

        # Ensure PRVU company exists
        company, _ = Company.objects.get_or_create(
            symbol='PRVU',
            defaults={
                'name': 'Prabhu Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 23542490.00,
                    'retained_earnings': -4288158.00,
                    'reserves': 15178956.00,
                    'total_equity': 34433288.00,
                    'total_assets': 401941270.00,
                    'deposits': 335539723.00,
                    'borrowings': 0.0,
                    'loans_bfis': 6806567.00,
                    'loans_customers': 221878316.00,
                    'investment_securities': 111965152.00,
                    'interest_income': 16819667.00,
                    'net_interest_income': 7181924.00,
                    'total_operating_income': 9824422.00,
                    'operating_profit': 2264317.00,
                    'net_profit': 851523.00,
                    'distributable_profit': -4288158.00,
                    'num_shares': 235424900.00,
                    'eps': 4.82,
                    'book_value': 146.26,
                    'roe': 3.3,
                    'car': 12.25,
                    'npl': 8.84,
                    'cost_of_funds': 3.37,
                    'cd_ratio': 70.61,
                    'base_rate': 5.14,
                    'interest_spread': 3.44,
                },
                2: {
                    'paid_up_capital': 23542490.00,
                    'retained_earnings': -3356448.00,
                    'reserves': 14227002.00,
                    'total_equity': 34413044.00,
                    'total_assets': 410577089.00,
                    'deposits': 340737320.00,
                    'borrowings': 721000.00,
                    'loans_bfis': 7342165.00,
                    'loans_customers': 227321174.00,
                    'investment_securities': 83782419.00,
                    'interest_income': 11726578.00,
                    'net_interest_income': 4984000.00,
                    'total_operating_income': 6696424.00,
                    'operating_profit': 1966509.00,
                    'net_profit': 1014457.00,
                    'distributable_profit': -3356448.00,
                    'num_shares': 235424900.00,
                    'eps': 8.62,
                    'book_value': 146.17,
                    'roe': 5.9,
                    'car': 12.38,
                    'npl': 8.68,
                    'cost_of_funds': 3.58,
                    'cd_ratio': 70.91,
                    'base_rate': 5.36,
                    'interest_spread': 3.8,
                },
                1: {
                    'paid_up_capital': 23542490.00,
                    'retained_earnings': 406084.00,
                    'reserves': 14556056.00,
                    'total_equity': 38504630.00,
                    'total_assets': 419253359.00,
                    'deposits': 345176860.00,
                    'borrowings': 702750.00,
                    'loans_bfis': 7549758.00,
                    'loans_customers': 227345818.00,
                    'investment_securities': 230856042.00,
                    'interest_income': 6459930.00,
                    'net_interest_income': 2895276.00,
                    'total_operating_income': 3825140.00,
                    'operating_profit': 1172085.00,
                    'net_profit': 558483.00,
                    'distributable_profit': 406084.00,
                    'num_shares': 235424900.00,
                    'eps': 9.49,
                    'book_value': 163.55,
                    'roe': 5.8,
                    'car': 13.6,
                    'npl': 5.78,
                    'cost_of_funds': 3.86,
                    'cd_ratio': 69.46,
                    'base_rate': 5.68,
                    'interest_spread': 5.83,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 23542490.00,
                    'retained_earnings': 1045108.00,
                    'reserves': 13551236.00,
                    'total_equity': 38138834.00,
                    'total_assets': 410670031.00,
                    'deposits': 342188540.00,
                    'borrowings': 687750.00,
                    'loans_bfis': 7829686.00,
                    'loans_customers': 230370295.00,
                    'investment_securities': 119662947.00,
                    'interest_income': 23229499.00,
                    'net_interest_income': 16031635.00,
                    'total_operating_income': 10572632.00,
                    'operating_profit': 6282761.00,
                    'net_profit': 5442693.00,
                    'distributable_profit': 1045108.00,
                    'num_shares': 235424900.00,
                    'eps': 23.12,
                    'book_value': 162.00,
                    'roe': 14.95,
                    'car': 13.9,
                    'npl': 4.96,
                    'cost_of_funds': 4.36,
                    'cd_ratio': 70.78,
                    'base_rate': 6.67,
                    'interest_spread': 3.73,
                },
                3: {
                    'paid_up_capital': 23542490.00,
                    'retained_earnings': -3398403.00,
                    'reserves': 14530631.00,
                    'total_equity': 34674717.00,
                    'total_assets': 384322878.00,
                    'deposits': 320520512.00,
                    'borrowings': 688250.00,
                    'loans_bfis': 7857320.00,
                    'loans_customers': 223342080.00,
                    'investment_securities': 103771685.00,
                    'interest_income': 19119067.00,
                    'net_interest_income': 7085677.00,
                    'total_operating_income': 9619049.00,
                    'operating_profit': 3435270.00,
                    'net_profit': 1876060.00,
                    'distributable_profit': -3402082.00,
                    'num_shares': 235424900.00,
                    'eps': 10.63,
                    'book_value': 147.29,
                    'roe': 7.21,
                    'car': 12.84,
                    'npl': 5.09,
                    'cost_of_funds': 4.62,
                    'cd_ratio': 73.33,
                    'base_rate': 6.73,
                    'interest_spread': 3.9,
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
                    ticker='PRVU',
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
            f'\n✓ Successfully processed quarterly reports for PRVU'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
