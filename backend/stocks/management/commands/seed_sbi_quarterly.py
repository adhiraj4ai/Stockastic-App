from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds SBI quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding SBI quarterly financial data...')

        # Ensure SBI company exists
        company, _ = Company.objects.get_or_create(
            symbol='SBI',
            defaults={
                'name': 'Nepal SBI Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 11335124.39,
                    'retained_earnings': 1026239.33,
                    'reserves': 9126743.44,
                    'total_equity': 21488107.16,
                    'total_assets': 254744083.17,
                    'deposits': 220027582.40,
                    'borrowings': 0.0,
                    'loans_bfis': 6210406.92,
                    'loans_customers': 144712059.09,
                    'investment_securities': 31479013.21,
                    'interest_income': 10811896.30,
                    'net_interest_income': 3869415.72,
                    'total_operating_income': 5301392.27,
                    'operating_profit': 2085360.13,
                    'net_profit': 1461785.73,
                    'distributable_profit': 1026239.33,
                    'num_shares': 113351243.91,
                    'eps': 17.19,
                    'book_value': 189.57,
                    'roe': 9.07,
                    'car': 13.76,
                    'npl': 2.53,
                    'cost_of_funds': 4.11,
                    'cd_ratio': 68.57,
                    'base_rate': 5.49,
                    'interest_spread': 3.31,
                },
                2: {
                    'paid_up_capital': 10899158.07,
                    'retained_earnings': 1201306.33,
                    'reserves': 8945912.75,
                    'total_equity': 21046377.15,
                    'total_assets': 254842602.39,
                    'deposits': 216104869.32,
                    'borrowings': 0.0,
                    'loans_bfis': 6532446.71,
                    'loans_customers': 141991958.70,
                    'investment_securities': 32173396.42,
                    'interest_income': 7270138.05,
                    'net_interest_income': 2561023.13,
                    'total_operating_income': 3548222.21,
                    'operating_profit': 1471398.20,
                    'net_profit': 1031342.92,
                    'distributable_profit': 1201306.33,
                    'num_shares': 108991580.68,
                    'eps': 18.93,
                    'book_value': 193.10,
                    'roe': 9.8,
                    'car': 14.12,
                    'npl': 2.64,
                    'cost_of_funds': 4.02,
                    'cd_ratio': 68.68,
                    'base_rate': 5.68,
                    'interest_spread': 3.54,
                },
                1: {
                    'paid_up_capital': 10899158.07,
                    'retained_earnings': 1509884.91,
                    'reserves': 8643793.89,
                    'total_equity': 21052836.87,
                    'total_assets': 248006474.23,
                    'deposits': 212979028.71,
                    'borrowings': 0.0,
                    'loans_bfis': 6594409.17,
                    'loans_customers': 138976729.43,
                    'investment_securities': 30523515.16,
                    'interest_income': 3744074.16,
                    'net_interest_income': 1318658.75,
                    'total_operating_income': 1764022.00,
                    'operating_profit': 715747.51,
                    'net_profit': 501565.20,
                    'distributable_profit': 1509884.91,
                    'num_shares': 108991580.68,
                    'eps': 18.41,
                    'book_value': 193.16,
                    'roe': 9.53,
                    'car': 14.32,
                    'npl': 3.01,
                    'cost_of_funds': 4.42,
                    'cd_ratio': 67.87,
                    'base_rate': 5.96,
                    'interest_spread': 3.46,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 10899158.07,
                    'retained_earnings': 1230357.62,
                    'reserves': 8425661.10,
                    'total_equity': 20555176.78,
                    'total_assets': 232757654.15,
                    'deposits': 199603443.88,
                    'borrowings': 0.0,
                    'loans_bfis': 6612393.71,
                    'loans_customers': 134965733.93,
                    'investment_securities': 54579704.35,
                    'interest_income': 15462931.03,
                    'net_interest_income': 5262311.87,
                    'total_operating_income': 6788341.66,
                    'operating_profit': 2733792.21,
                    'net_profit': 1802580.12,
                    'distributable_profit': 1230357.62,
                    'num_shares': 108991580.68,
                    'eps': 16.54,
                    'book_value': 188.59,
                    'roe': 9.01,
                    'car': 13.03,
                    'npl': 3.35,
                    'cost_of_funds': 5.18,
                    'cd_ratio': 70.75,
                    'base_rate': 6.29,
                    'interest_spread': 3.52,
                },
                3: {
                    'paid_up_capital': 10899158.07,
                    'retained_earnings': 1051533.38,
                    'reserves': 8003797.21,
                    'total_equity': 19954488.65,
                    'total_assets': 220637312.43,
                    'deposits': 185831403.47,
                    'borrowings': 0.0,
                    'loans_bfis': 6308626.83,
                    'loans_customers': 135248575.82,
                    'investment_securities': 43654980.44,
                    'interest_income': 11307477.42,
                    'net_interest_income': 3534955.84,
                    'total_operating_income': 4640501.03,
                    'operating_profit': 1792696.58,
                    'net_profit': 1203261.40,
                    'distributable_profit': 1051533.38,
                    'num_shares': 108991580.68,
                    'eps': 14.72,
                    'book_value': 183.08,
                    'roe': 8.04,
                    'car': 12.44,
                    'npl': 4.06,
                    'cost_of_funds': 5.35,
                    'cd_ratio': 75.49,
                    'base_rate': 6.73,
                    'interest_spread': 3.77,
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
                    ticker='SBI',
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
            f'\n✓ Successfully processed quarterly reports for SBI'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
