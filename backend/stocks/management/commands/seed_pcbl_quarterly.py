from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds PCBL quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding PCBL quarterly financial data...')

        # Ensure PCBL company exists
        company, _ = Company.objects.get_or_create(
            symbol='PCBL',
            defaults={
                'name': 'Prime Commercial Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 20954781.77,
                    'retained_earnings': 773003.13,
                    'reserves': 14163218.70,
                    'total_equity': 35891003.61,
                    'total_assets': 325394310.58,
                    'deposits': 271312349.37,
                    'borrowings': 1493500.00,
                    'loans_bfis': 8708825.74,
                    'loans_customers': 222068388.57,
                    'investment_securities': 53778765.61,
                    'interest_income': 16298745.70,
                    'net_interest_income': 6841242.73,
                    'total_operating_income': 8905501.84,
                    'operating_profit': 4893937.94,
                    'net_profit': 3089335.32,
                    'distributable_profit': 773003.13,
                    'num_shares': 209547817.73,
                    'eps': 19.66,
                    'book_value': 171.28,
                    'roe': 11.48,
                    'car': 11.72,
                    'npl': 6.39,
                    'cost_of_funds': 4.10,
                    'cd_ratio': 83.12,
                    'base_rate': 5.27,
                    'interest_spread': 3.79,
                },
                2: {
                    'paid_up_capital': 20954781.77,
                    'retained_earnings': 370062.89,
                    'reserves': 13417258.99,
                    'total_equity': 34742103.64,
                    'total_assets': 319678211.19,
                    'deposits': 267331520.70,
                    'borrowings': 1443500.00,
                    'loans_bfis': 8240081.49,
                    'loans_customers': 217175133.29,
                    'investment_securities': 53294494.15,
                    'interest_income': 11218395.39,
                    'net_interest_income': 4653314.97,
                    'total_operating_income': 6187489.23,
                    'operating_profit': 3395383.14,
                    'net_profit': 2043378.30,
                    'distributable_profit': 370062.89,
                    'num_shares': 209547817.73,
                    'eps': 19.50,
                    'book_value': 165.80,
                    'roe': 11.76,
                    'car': 11.68,
                    'npl': 6.38,
                    'cost_of_funds': 4.46,
                    'cd_ratio': 82.86,
                    'base_rate': 5.72,
                    'interest_spread': 3.79,
                },
                1: {
                    'paid_up_capital': 19402575.72,
                    'retained_earnings': 3044609.51,
                    'reserves': 12345765.91,
                    'total_equity': 34792951.13,
                    'total_assets': 316629560.49,
                    'deposits': 261753134.51,
                    'borrowings': 2811000.00,
                    'loans_bfis': 8477630.79,
                    'loans_customers': 214956435.77,
                    'investment_securities': 53426608.64,
                    'interest_income': 5896339.62,
                    'net_interest_income': 2407447.60,
                    'total_operating_income': 3450494.10,
                    'operating_profit': 2075827.02,
                    'net_profit': 1258430.07,
                    'distributable_profit': 3044609.51,
                    'num_shares': 194025757.16,
                    'eps': 25.94,
                    'book_value': 179.32,
                    'roe': 14.47,
                    'car': 12.17,
                    'npl': 5.86,
                    'cost_of_funds': 4.79,
                    'cd_ratio': 82.65,
                    'base_rate': 6.08,
                    'interest_spread': 3.90,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 19402575.72,
                    'retained_earnings': 2780819.22,
                    'reserves': 11523494.73,
                    'total_equity': 33706889.67,
                    'total_assets': 317147016.93,
                    'deposits': 263360694.62,
                    'borrowings': 2750000.00,
                    'loans_bfis': 8888477.03,
                    'loans_customers': 210461724.38,
                    'investment_securities': 52369045.17,
                    'interest_income': 23532707.98,
                    'net_interest_income': 8822434.30,
                    'total_operating_income': 11167520.03,
                    'operating_profit': 6558016.16,
                    'net_profit': 4024431.57,
                    'distributable_profit': 2780819.22,
                    'num_shares': 194025757.16,
                    'eps': 20.74,
                    'book_value': 173.72,
                    'roe': 12.51,
                    'car': 11.74,
                    'npl': 5.56,
                    'cost_of_funds': 5.21,
                    'cd_ratio': 83.39,
                    'base_rate': 6.49,
                    'interest_spread': 3.69,
                },
                3: {
                    'paid_up_capital': 19402575.72,
                    'retained_earnings': 1732386.06,
                    'reserves': 10808317.73,
                    'total_equity': 31943279.51,
                    'total_assets': 299614784.27,
                    'deposits': 244802427.74,
                    'borrowings': 2754000.00,
                    'loans_bfis': 9217000.83,
                    'loans_customers': 205242089.78,
                    'investment_securities': 52459880.47,
                    'interest_income': 17623028.85,
                    'net_interest_income': 6661382.48,
                    'total_operating_income': 8343841.52,
                    'operating_profit': 3717834.76,
                    'net_profit': 2229304.14,
                    'distributable_profit': 1732386.06,
                    'num_shares': 194025757.16,
                    'eps': 15.32,
                    'book_value': 164.63,
                    'roe': 9.31,
                    'car': 11.39,
                    'npl': 5.65,
                    'cost_of_funds': 5.47,
                    'cd_ratio': 84.80,
                    'base_rate': 6.82,
                    'interest_spread': 3.65,
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
                    ticker='PCBL',
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
            f'\n✓ Successfully processed quarterly reports for PCBL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
