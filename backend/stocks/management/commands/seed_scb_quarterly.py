from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds SCB quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding SCB quarterly financial data...')

        # Ensure SCB company exists
        company, _ = Company.objects.get_or_create(
            symbol='SCB',
            defaults={
                'name': 'Standard Chartered Bank Nepal Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 10042368.00,
                    'retained_earnings': 1354747.00,
                    'reserves': 10554318.00,
                    'total_equity': 21951433.00,
                    'total_assets': 175457304.00,
                    'deposits': 145014876.00,
                    'borrowings': 0.0,
                    'loans_bfis': 8791401.00,
                    'loans_customers': 68479095.00,
                    'investment_securities': 26585186.00,
                    'interest_income': 5496601.00,
                    'net_interest_income': 2914742.00,
                    'total_operating_income': 4646764.00,
                    'operating_profit': 2971438.00,
                    'net_profit': 2081621.00,
                    'distributable_profit': 1354747.00,
                    'num_shares': 100423680.00,
                    'eps': 27.64,
                    'book_value': 218.59,
                    'roe': 12.64,
                    'car': 17.82,
                    'npl': 1.81,
                    'cost_of_funds': 2.61,
                    'cd_ratio': 52.95,
                    'base_rate': 4.37,
                    'interest_spread': 3.67,
                },
                2: {
                    'paid_up_capital': 10042368.00,
                    'retained_earnings': 912547.00,
                    'reserves': 10231354.00,
                    'total_equity': 21186269.00,
                    'total_assets': 168355336.00,
                    'deposits': 137427348.00,
                    'borrowings': 0.0,
                    'loans_bfis': 14759022.00,
                    'loans_customers': 68542328.00,
                    'investment_securities': 26005852.00,
                    'interest_income': 3727076.00,
                    'net_interest_income': 1974216.00,
                    'total_operating_income': 3127082.00,
                    'operating_profit': 1966434.00,
                    'net_profit': 1373324.00,
                    'distributable_profit': 912547.00,
                    'num_shares': 100423680.00,
                    'eps': 27.35,
                    'book_value': 210.97,
                    'roe': 12.96,
                    'car': 17.72,
                    'npl': 1.88,
                    'cost_of_funds': 2.71,
                    'cd_ratio': 59.99,
                    'base_rate': 4.76,
                    'interest_spread': 3.35,
                },
                1: {
                    'paid_up_capital': 10042368.00,
                    'retained_earnings': 2411048.00,
                    'reserves': 9911923.00,
                    'total_equity': 22365339.00,
                    'total_assets': 161706155.00,
                    'deposits': 129627210.00,
                    'borrowings': 1800000.00,
                    'loans_bfis': 14885683.00,
                    'loans_customers': 70117984.00,
                    'investment_securities': 12255519.00,
                    'interest_income': 1977443.00,
                    'net_interest_income': 1072450.00,
                    'total_operating_income': 1681658.00,
                    'operating_profit': 989377.00,
                    'net_profit': 692169.00,
                    'distributable_profit': 2411048.00,
                    'num_shares': 100423680.00,
                    'eps': 27.57,
                    'book_value': 222.71,
                    'roe': 12.38,
                    'car': 18.6,
                    'npl': 1.71,
                    'cost_of_funds': 2.89,
                    'cd_ratio': 65.15,
                    'base_rate': 4.27,
                    'interest_spread': 3.63,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 10042368.00,
                    'retained_earnings': 1993326.00,
                    'reserves': 9751774.00,
                    'total_equity': 21787468.00,
                    'total_assets': 155203119.00,
                    'deposits': 125338848.00,
                    'borrowings': 700000.00,
                    'loans_bfis': 14951265.00,
                    'loans_customers': 72712229.00,
                    'investment_securities': 13571456.00,
                    'interest_income': 8337194.00,
                    'net_interest_income': 4488425.00,
                    'total_operating_income': 6597470.00,
                    'operating_profit': 4710124.00,
                    'net_profit': 3029303.00,
                    'distributable_profit': 1993326.00,
                    'num_shares': 100423680.00,
                    'eps': 30.17,
                    'book_value': 216.96,
                    'roe': 14.18,
                    'car': 17.82,
                    'npl': 1.47,
                    'cost_of_funds': 3.22,
                    'cd_ratio': 69.48,
                    'base_rate': 4.99,
                    'interest_spread': 3.53,
                },
                3: {
                    'paid_up_capital': 10042368.00,
                    'retained_earnings': 1471651.00,
                    'reserves': 9417731.00,
                    'total_equity': 20931750.00,
                    'total_assets': 150606466.00,
                    'deposits': 122603744.00,
                    'borrowings': 0.0,
                    'loans_bfis': 12596338.00,
                    'loans_customers': 77257645.00,
                    'investment_securities': 15256846.00,
                    'interest_income': 6129603.00,
                    'net_interest_income': 3240777.00,
                    'total_operating_income': 4863979.00,
                    'operating_profit': 3321867.00,
                    'net_profit': 2173776.00,
                    'distributable_profit': 1471651.00,
                    'num_shares': 100423680.00,
                    'eps': 28.86,
                    'book_value': 208.43,
                    'roe': 13.85,
                    'car': 17.44,
                    'npl': 1.44,
                    'cost_of_funds': 3.30,
                    'cd_ratio': 72.94,
                    'base_rate': 5.09,
                    'interest_spread': 4.00,
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
                    ticker='SCB',
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
            f'\n✓ Successfully processed quarterly reports for SCB'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
