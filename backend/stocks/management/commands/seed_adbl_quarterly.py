from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds ADBL quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding ADBL quarterly financial data...')
        
        # Ensure ADBL company exists
        company, _ = Company.objects.get_or_create(
            symbol='ADBL',
            defaults={
                'name': 'Agricultural Development Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 19738231.09,
                    'retained_earnings': 1251442.84,
                    'reserves': 17416235.95,
                    'total_equity': 38405909.87,
                    'total_assets': 399787449.61,
                    'deposits': 330728410.98,
                    'borrowings': 2803271.85,
                    'loans_bfis': 2189627.52,
                    'loans_customers': 226749550.90,
                    'investment_securities': 116359692.97,
                    'interest_income': 15446740.24,
                    'net_interest_income': 6634494.24,
                    'total_operating_income': 8119033.53,
                    'operating_profit': 2120920.01,
                    'net_profit': 1393973.95,
                    'distributable_profit': 1251442.84,
                    'num_shares': 197382310.90,
                    'eps': 9.42,
                    'book_value': 194.58,
                    'roe': 4.84,
                    'car': 13.42,
                    'npl': 5.06,
                    'cost_of_funds': 3.35,
                    'cd_ratio': 65.44,
                    'base_rate': 5.01,
                    'interest_spread': 3.47,
                },
                2: {
                    'paid_up_capital': 19738231.09,
                    'retained_earnings': 719876.63,
                    'reserves': 17071799.48,
                    'total_equity': 37529907.20,
                    'total_assets': 392157175.81,
                    'deposits': 323444667.04,
                    'borrowings': 2803771.85,
                    'loans_bfis': 2234738.23,
                    'loans_customers': 218272232.64,
                    'investment_securities': 103457862.87,
                    'interest_income': 10460525.85,
                    'net_interest_income': 4518161.97,
                    'total_operating_income': 5221134.47,
                    'operating_profit': 1009249.49,
                    'net_profit': 707426.59,
                    'distributable_profit': 719876.63,
                    'num_shares': 143055190.90,
                    'eps': 9.89,
                    'book_value': 224.37,
                    'roe': 4.41,
                    'car': 13.12,
                    'npl': 4.65,
                    'cost_of_funds': 3.31,
                    'cd_ratio': 64.33,
                    'base_rate': 5.02,
                    'interest_spread': 3.89,
                },
                1: {
                    'paid_up_capital': 19287936.30,
                    'retained_earnings': 2484736.45,
                    'reserves': 16846601.67,
                    'total_equity': 38619274.42,
                    'total_assets': 377307473.63,
                    'deposits': 309377760.35,
                    'borrowings': 2803771.85,
                    'loans_bfis': 2313782.82,
                    'loans_customers': 212438164.38,
                    'investment_securities': 109488206.66,
                    'interest_income': 5495815.26,
                    'net_interest_income': 2424395.43,
                    'total_operating_income': 2623231.42,
                    'operating_profit': -63233.73,
                    'net_profit': 5738.89,
                    'distributable_profit': 2484736.45,
                    'num_shares': 138552243.00,
                    'eps': 0.17,
                    'book_value': 278.73,
                    'roe': 0.06,
                    'car': 13.63,
                    'npl': 4.78,
                    'cost_of_funds': 3.68,
                    'cd_ratio': 65.13,
                    'base_rate': 5.42,
                    'interest_spread': 3.92,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 19287936.30,
                    'retained_earnings': 2877975.62,
                    'reserves': 16990026.80,
                    'total_equity': 39155938.71,
                    'total_assets': 362502073.67,
                    'deposits': 293574843.87,
                    'borrowings': 2804657.06,
                    'loans_bfis': 2900424.32,
                    'loans_customers': 213142809.41,
                    'investment_securities': 96447099.08,
                    'interest_income': 22822486.83,
                    'net_interest_income': 9821484.00,
                    'total_operating_income': 11995821.27,
                    'operating_profit': 5847627.93,
                    'net_profit': 4154475.79,
                    'distributable_profit': 2877975.62,
                    'num_shares': 192879363.00,
                    'eps': 21.54,
                    'book_value': 203.01,
                    'roe': 10.61,
                    'car': 13.36,
                    'npl': 3.26,
                    'cost_of_funds': 3.81,
                    'cd_ratio': 68.68,
                    'base_rate': 5.87,
                    'interest_spread': 3.96,
                },
                3: {
                    'paid_up_capital': 19287963.30,
                    'retained_earnings': 1911031.57,
                    'reserves': 15496583.93,
                    'total_equity': 36695551.79,
                    'total_assets': 335081735.04,
                    'deposits': 254716079.30,
                    'borrowings': 10385452.28,
                    'loans_bfis': 3104375.15,
                    'loans_customers': 207239517.43,
                    'investment_securities': 75340673.78,
                    'interest_income': 16128971.58,
                    'net_interest_income': 6125943.62,
                    'total_operating_income': 7716544.57,
                    'operating_profit': 2598700.31,
                    'net_profit': 1844360.36,
                    'distributable_profit': 1911031.57,
                    'num_shares': 192879633.00,
                    'eps': 15.40,
                    'book_value': 190.25,
                    'roe': 6.70,
                    'car': 13.12,
                    'npl': 4.98,
                    'cost_of_funds': 4.15,
                    'cd_ratio': 76.33,
                    'base_rate': 6.09,
                    'interest_spread': 3.93,
                },
                2: {
                    'paid_up_capital': 19287936.30,
                    'retained_earnings': 1229875.35,
                    'reserves': 15244429.63,
                    'total_equity': 35762241.28,
                    'total_assets': 320150123.09,
                    'deposits': 251272784.13,
                    'borrowings': 1982117.50,
                    'loans_bfis': 3056962.71,
                    'loans_customers': 204111191.59,
                    'investment_securities': 73915597.19,
                    'interest_income': 10529483.51,
                    'net_interest_income': 3483879.85,
                    'total_operating_income': 4868863.73,
                    'operating_profit': 1347764.68,
                    'net_profit': 957549.68,
                    'distributable_profit': 1229875.35,
                    'num_shares': 192879363.00,
                    'eps': 9.93,
                    'book_value': 185.41,
                    'roe': 5.36,
                    'car': 13.10,
                    'npl': 4.90,
                    'cost_of_funds': 4.38,
                    'cd_ratio': 76.13,
                    'base_rate': 6.60,
                    'interest_spread': 3.89,
                }
            }
        }

        created_count = 0
        updated_count = 0

        for fiscal_year, quarters in quarterly_data.items():
            for quarter, d in quarters.items():
                # Prepare JSON data
                # Multiply by 1000 for relevant fields
                balance_sheet = {
                    'ASSETS': {
                        'total_assets': d['total_assets'] * 1000,
                        'loans_bfis': d['loans_bfis'] * 1000,
                        'loans_customers': d['loans_customers'] * 1000,
                        'investment_securities': d['investment_securities'] * 1000,
                    },
                    'LIABILITIES': {
                        'deposits_customers': d['deposits'] * 1000,
                        'borrowings': d['borrowings'] * 1000,
                    },
                    'EQUITY': {
                        'share_capital': d['paid_up_capital'] * 1000,
                        'retained_earnings': d['retained_earnings'] * 1000,
                        'reserves': d['reserves'] * 1000,
                        'total_equity': d['total_equity'] * 1000,
                    }
                }

                profit_loss = {
                    'REVENUE': {
                        'interest_income': d['interest_income'] * 1000,
                        'net_interest_income': d['net_interest_income'] * 1000,
                        'total_operating_income': d['total_operating_income'] * 1000,
                    },
                    'EXPENSES': {
                        'net_profit': d['net_profit'] * 1000,
                        'distributable_profit': d['distributable_profit'] * 1000,
                    }
                }

                key_ratios = {
                    'REGULATORY': {
                        'car': d['car'],
                        'npl': d['npl'],
                        'cost_of_funds': d['cost_of_funds'],
                        'cd_ratio': d['cd_ratio'],
                        'base_rate': d['base_rate'],
                        'interest_spread': d['interest_spread'],
                    }
                }

                # Create or update report
                report, created = FinancialReport.objects.update_or_create(
                    ticker='ADBL',
                    fiscal_year=fiscal_year,
                    report_type='QUARTERLY',
                    quarter=quarter,
                    defaults={
                        'is_audited': False,
                        'report_template': 'BANK',
                        'balance_sheet': balance_sheet,
                        'profit_loss': profit_loss,
                        'key_ratios': key_ratios,
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
                    self.stdout.write(self.style.SUCCESS(f'✓ Created report for FY {fiscal_year} Q{quarter}'))
                else:
                    updated_count += 1
                    self.stdout.write(self.style.WARNING(f'⟳ Updated report for FY {fiscal_year} Q{quarter}'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Successfully processed quarterly reports for ADBL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
