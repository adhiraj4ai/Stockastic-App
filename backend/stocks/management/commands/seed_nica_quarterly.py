from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds NICA quarterly financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding NICA quarterly financial data...')

        # Ensure NICA company exists
        company, _ = Company.objects.get_or_create(
            symbol='NICA',
            defaults={
                'name': 'NIC Asia Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )

        # Values provided are in RS in 000'
        # Mapping: Fiscal Year -> Quarter -> Data
        quarterly_data = {
            '082/083': {
                3: {
                    'paid_up_capital': 14917566.92,
                    'retained_earnings': -13658214.17,
                    'reserves': 24544149.96,
                    'total_equity': 25803502.71,
                    'total_assets': 386282218.79,
                    'deposits': 334375479.28,
                    'borrowings': 0,
                    'loans_bfis': 8601615.00,
                    'loans_customers': 201343299.15,
                    'investment_securities': 53768183.44,
                    'interest_income': 17487944.03,
                    'net_interest_income': 6308251.64,
                    'total_operating_income': 7679993.13,
                    'operating_profit': 672906.36,
                    'net_profit': 140324.17,
                    'distributable_profit': -13658214.17,
                    'num_shares': 149175669.22,
                    'eps': 1.25,
                    'book_value': 172.97,
                    'roe': 0.73,
                    'car': 11.45,
                    'npl': 8.85,
                    'cost_of_funds': 4.24,
                    'cd_ratio': 65.39,
                    'base_rate': 6.20,
                    'interest_spread': 3.40,
                },
                2: {
                    'paid_up_capital': 14917566.92,
                    'retained_earnings': -7399536.34,
                    'reserves': 22068176.55,
                    'total_equity': 29586207.13,
                    'total_assets': 387119586.17,
                    'deposits': 327501412.35,
                    'borrowings': 0,
                    'loans_bfis': 9634556.53,
                    'loans_customers': 209311286.79,
                    'investment_securities': 55844546.75,
                    'interest_income': 12033063.16,
                    'net_interest_income': 4363883.87,
                    'total_operating_income': 5339157.72,
                    'operating_profit': 197777.54,
                    'net_profit': 131191.67,
                    'distributable_profit': -7399536.34,
                    'num_shares': 149175669.22,
                    'eps': 1.76,
                    'book_value': 198.33,
                    'roe': 0.89,
                    'car': 14.07,
                    'npl': 7.47,
                    'cost_of_funds': 4.36,
                    'cd_ratio': 67.10,
                    'base_rate': 6.41,
                    'interest_spread': 3.85,
                },
                1: {
                    'paid_up_capital': 14917566.92,
                    'retained_earnings': -6248213.39,
                    'reserves': 20978136.68,
                    'total_equity': 29647490.21,
                    'total_assets': 395715571.83,
                    'deposits': 337314889.67,
                    'borrowings': 0,
                    'loans_bfis': 9331096.50,
                    'loans_customers': 209311286.79, # Wait, YoY Growth Loan Customers -13.75%. Table has: 212,221,805.45 for Q1. Let me verify: yes, 212,221,805.45.
                    'loans_customers_verified': 212221805.45,
                    'investment_securities': 45245039.21,
                    'interest_income': 6335002.94,
                    'net_interest_income': 2286038.41,
                    'total_operating_income': 2779091.43,
                    'operating_profit': 193522.28,
                    'net_profit': 122160.86,
                    'distributable_profit': -6248213.39,
                    'num_shares': 149175669.22,
                    'eps': 8.69,
                    'book_value': 198.74,
                    'roe': 1.65,
                    'car': 14.03,
                    'npl': 6.99,
                    'cost_of_funds': 4.60,
                    'cd_ratio': 66.08,
                    'base_rate': 6.60,
                    'interest_spread': 3.99,
                }
            },
            '081/082': {
                4: {
                    'paid_up_capital': 14917566.92,
                    'retained_earnings': -5211822.27,
                    'reserves': 19816012.85,
                    'total_equity': 29521757.50,
                    'total_assets': 378764241.97,
                    'deposits': 319065897.44,
                    'borrowings': 0,
                    'loans_bfis': 9899208.00,
                    'loans_customers': 224121856.10,
                    'investment_securities': 47488617.56,
                    'interest_income': 28816212.12,
                    'net_interest_income': 10256235.57,
                    'total_operating_income': 11772497.65,
                    'operating_profit': 1272125.86,
                    'net_profit': 161573.23,
                    'distributable_profit': -5211822.27,
                    'num_shares': 149175669.22,
                    'eps': 1.08,
                    'book_value': 197.90,
                    'roe': 0.55,
                    'car': 14.00,
                    'npl': 6.28,
                    'cost_of_funds': 4.92,
                    'cd_ratio': 73.97,
                    'base_rate': 7.04,
                    'interest_spread': 3.99,
                },
                3: {
                    'paid_up_capital': 14917566.92,
                    'retained_earnings': -3569202.81,
                    'reserves': 18382299.29,
                    'total_equity': 29730663.40,
                    'total_assets': 354314718.72,
                    'deposits': 294060129.59,
                    'borrowings': 0,
                    'loans_bfis': 10285159.50,
                    'loans_customers': 233434321.80,
                    'investment_securities': 59204570.82,
                    'interest_income': 22469316.15,
                    'net_interest_income': 7962519.14,
                    'total_operating_income': 9192248.14,
                    'operating_profit': 1290509.87,
                    'net_profit': 156775.96,
                    'distributable_profit': -3569202.81,
                    'num_shares': 149175669.22,
                    'eps': 1.40,
                    'book_value': 199.30,
                    'roe': 0.70,
                    'car': 13.42,
                    'npl': 5.75,
                    'cost_of_funds': 5.12,
                    'cd_ratio': 83.47,
                    'base_rate': 7.20,
                    'interest_spread': 4.00,
                }
            }
        }

        created_count = 0
        updated_count = 0

        for fiscal_year, quarters in quarterly_data.items():
            formatted_fy = fiscal_year.replace('/', '-')
            for quarter, d in quarters.items():
                loans_customers_val = d.get('loans_customers_verified', d['loans_customers'])
                # Prepare JSON data conforming to BANK_QUARTERLY template structure
                balance_sheet = {
                    'SUMMARY': {
                        'placement_bfis': d['loans_bfis'] * 1000,
                        'loans_customers': loans_customers_val * 1000,
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
                    ticker='NICA',
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
            f'\n✓ Successfully processed quarterly reports for NICA'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
