from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds LSL annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding LSL financial data...')

        # Ensure LSL company exists
        company, created = Company.objects.get_or_create(
            symbol='LSL',
            defaults={
                'name': 'Laxmi Sunrise Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created company: {company.symbol}'))
        else:
            self.stdout.write(f'Company {company.symbol} already exists')

        # Balance Sheet Data (FY 079-080 to 081-082)
        financial_data = {
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 18187735432,
                    'due_from_nrb': 20677440048,
                    'placement_bfis': 788700000,
                    'derivative_assets': 1899978992,
                    'trading_assets': 68190000,
                    'loans_bfis': 7687484996,
                    'loans_customers': 247870137673,
                    'investment_securities': 53360547659,
                    'current_tax_assets': 189286986,
                    'subsidiaries': 893167928,
                    'associates': None,
                    'investment_property': 1275163202,
                    'property_equipment': 4864929807,
                    'intangible_assets': 523745251,
                    'deferred_tax_assets': None,
                    'other_assets': 3379265215,
                    'total_assets': 361665773188,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4067001556,
                    'due_to_nrb': None,
                    'derivative_liabilities': 1896707957,
                    'deposits_customers': 296243475431,
                    'borrowings': 5080623999,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 242700360,
                    'other_liabilities': 7910332412,
                    'debt_securities': 8000000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 323440841715,
                },
                'EQUITY': {
                    'share_capital': 21670237860,
                    'share_premium': None,
                    'retained_earnings': 1728331728,
                    'reserves_reserves': 14826361885,
                    'total_equity': 38224931473,
                    'total_liabilities_equity': 361665773188,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 15047811674,
                    'due_from_nrb': 15510635414,
                    'placement_bfis': 6185698763,
                    'derivative_assets': 5190188038,
                    'trading_assets': None,
                    'loans_bfis': 79992354863,
                    'loans_customers': 247408112400,
                    'investment_securities': 87110568876,
                    'current_tax_assets': 129712230,
                    'subsidiaries': None,
                    'associates': 893167928,
                    'investment_property': 1563131693,
                    'property_equipment': 4562523618,
                    'intangible_assets': 602063672,
                    'deferred_tax_assets': None,
                    'other_assets': 3765922817,
                    'total_assets': 395961891988,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4468970749,
                    'due_to_nrb': None,
                    'derivative_liabilities': 5179641688,
                    'deposits_customers': 328931512100,
                    'borrowings': 3980636946,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 298015141,
                    'other_liabilities': 5601678617,
                    'debt_securities': 7000000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 355460455242,
                },
                'EQUITY': {
                    'share_capital': 23187154510,
                    'share_premium': None,
                    'retained_earnings': 1241675276,
                    'reserves_reserves': 16072606961,
                    'total_equity': 40501436746,
                    'total_liabilities_equity': 395961891988,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 10524785025,
                    'due_from_nrb': 16361433522,
                    'placement_bfis': 8742467021,
                    'derivative_assets': 11138517100,
                    'trading_assets': None,
                    'loans_bfis': 8233947995,
                    'loans_customers': 274963657124,
                    'investment_securities': 98415986685,
                    'current_tax_assets': 87260059,
                    'subsidiaries': 893167928,
                    'associates': 893167928,
                    'investment_property': 2192012100,
                    'property_equipment': 4823056049,
                    'intangible_assets': 592701665,
                    'deferred_tax_assets': None,
                    'other_assets': 6618719515,
                    'total_assets': 443587711789,
                },
                'LIABILITIES': {
                    'due_to_bfis': 5529230355,
                    'due_to_nrb': None,
                    'derivative_liabilities': 11140480994,
                    'deposits_customers': 367053706312,
                    'borrowings': 548494610,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 562957364,
                    'other_liabilities': 6368731199,
                    'debt_securities': 7000000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 398203600835,
                },
                'EQUITY': {
                    'share_capital': 24346512235,
                    'share_premium': None,
                    'retained_earnings': 2964358257,
                    'reserves_reserves': 18073240462,
                    'total_equity': 45384110954,
                    'total_liabilities_equity': 443587711789,
                }
            }
        }

        # Profit & Loss Data
        profit_loss_data = {
            '079-080': {
                'INCOME': {
                    'interest_income': 19066469766,
                    'interest_expense': 1337978995,
                    'net_interest_income': 5686690771,
                    'fee_income': 1214350589,
                    'fee_expense': 230927297,
                    'net_fee_income': 983423292,
                    'net_int_fee_income': 6670114063,
                    'trading_income': 214107234,
                    'other_operating_income': 504774045,
                    'total_operating_income': 7388995342,
                },
                'EXPENSES': {
                    'impairment_charge': 1060699532,
                    'personnel_expenses': 1884059366,
                    'other_operating_expenses': 821753267,
                    'depreciation': 346446931,
                    'operating_profit': 3276036247,
                    'non_operating_income': 8374214,
                    'non_operating_expense': 240376287,
                    'pbt': 3044034173,
                    'tax': 758795333,
                    'net_profit': 2285238841,
                },
                'REGULATORY': {
                    'cd_ratio': 86.27,
                    'core_capital': 10.04,
                    'supplementary_capital': 3.17,
                    'capital_fund': 13.21,
                    'liquidity_crr': 4.19,
                    'npl_ratio': 2.91,
                    'base_rate': 10.75,
                    'spread': 4.42,
                    'total_employees': 2712,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 35924613707,
                    'interest_expense': 23560745625,
                    'net_interest_income': 12363868082,
                    'fee_income': 2454502507,
                    'fee_expense': 465648614,
                    'net_fee_income': 1988853893,
                    'net_int_fee_income': 14352721975,
                    'trading_income': 262957924,
                    'other_operating_income': 299303066,
                    'total_operating_income': 11326922881,
                },
                'EXPENSES': {
                    'impairment_charge': 3588060084,
                    'personnel_expenses': 4950852206,
                    'other_operating_expenses': 1352021726,
                    'depreciation': 622026230,
                    'operating_profit': 4402022720,
                    'non_operating_income': 212172590,
                    'non_operating_expense': 309506933,
                    'pbt': 4304688377,
                    'tax': 1384309398,
                    'net_profit': 2920378979,
                },
                'REGULATORY': {
                    'cd_ratio': 77.65,
                    'core_capital': 10.14,
                    'supplementary_capital': 2.83,
                    'capital_fund': 12.97,
                    'liquidity_crr': 4.19,
                    'npl_ratio': 4.63,
                    'base_rate': 8.52,
                    'spread': 4.00,
                    'total_employees': 2776,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 28929621885,
                    'interest_expense': 18077637572,
                    'net_interest_income': 10851984313,
                    'fee_income': 2707586530,
                    'fee_expense': 518893406,
                    'net_fee_income': 2188693123,
                    'net_int_fee_income': 13040677436,
                    'trading_income': 520241122,
                    'other_operating_income': 599274289,
                    'total_operating_income': 14160192847,
                },
                'EXPENSES': {
                    'impairment_charge': 1258008935,
                    'personnel_expenses': 4911790309,
                    'other_operating_expenses': 1387833862,
                    'depreciation': 572137016,
                    'operating_profit': 6030422724,
                    'non_operating_income': 100413902,
                    'non_operating_expense': 430814474,
                    'pbt': 5700022152,
                    'tax': 1637977426,
                    'net_profit': 4062044726,
                },
                'REGULATORY': {
                    'cd_ratio': 77.15,
                    'core_capital': 36.99,
                    'supplementary_capital': 8.85,
                    'capital_fund': 45.84,
                    'npl_ratio': 4.35,
                    'base_rate': 6.50,
                    'branches': 254,
                    'atms': 328,
                }
            }
        }

        # Dividend Data (on financial report models)
        dividend_data = {
            '079-080': {'bonus': 7.00, 'cash': 0.37, 'book_close': '2024-01-04'},
            '080-081': {'bonus': 5.00, 'cash': 0.26, 'book_close': '2025-01-01'},
            '081-082': {'bonus': 10.00, 'cash': 0.53, 'book_close': '2025-12-16'},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2081/2082', 'bonus': 10.00, 'cash': 0.53, 'book_close': '2025-12-16'},
            {'fy': '2080/2081', 'bonus': 5.00, 'cash': 0.26, 'book_close': '2025-01-01'},
            {'fy': '2079/2080', 'bonus': 7.00, 'cash': 0.37, 'book_close': '2024-01-04'},
        ]

        # Seed Financial Reports
        created_reports = 0
        updated_reports = 0

        for fiscal_year, data in financial_data.items():
            balance_sheet = {}
            for section_key, section_data in data.items():
                balance_sheet[section_key] = {}
                for field_key, value in section_data.items():
                    if value is not None:
                        balance_sheet[section_key][field_key] = value

            profit_loss = {}
            if fiscal_year in profit_loss_data:
                pl_data = profit_loss_data[fiscal_year]
                for section_key, section_data in pl_data.items():
                    profit_loss[section_key] = {}
                    for field_key, value in section_data.items():
                        if value is not None:
                            profit_loss[section_key][field_key] = value

            share_capital = data['EQUITY'].get('share_capital')
            total_equity = data['EQUITY'].get('total_equity')
            net_profit = profit_loss_data.get(fiscal_year, {}).get('EXPENSES', {}).get('net_profit')

            eps = None
            book_value = None
            roe = None

            if share_capital and share_capital > 0:
                num_shares = share_capital / 100
                if net_profit and num_shares > 0:
                    eps = round(net_profit / num_shares, 2)
                if total_equity and num_shares > 0:
                    book_value = round(total_equity / num_shares, 2)

            if net_profit and total_equity and total_equity > 0:
                roe = round((net_profit / total_equity) * 100, 2)

            div = dividend_data.get(fiscal_year, {})

            report, created = FinancialReport.objects.update_or_create(
                ticker='LSL',
                fiscal_year=fiscal_year,
                report_type='ANNUAL',
                quarter=None,
                defaults={
                    'is_audited': True,
                    'report_template': 'BANK',
                    'balance_sheet': balance_sheet,
                    'profit_loss': profit_loss,
                    'paid_up_capital': share_capital,
                    'reserves_and_surplus': data['EQUITY'].get('reserves_reserves'),
                    'net_profit': net_profit,
                    'eps': eps,
                    'book_value': book_value,
                    'return_on_equity': roe,
                    'bonus_share': div.get('bonus'),
                    'cash_dividend': div.get('cash'),
                    'dividend_book_close_date': div.get('book_close'),
                }
            )

            if created:
                created_reports += 1
            else:
                updated_reports += 1

        self.stdout.write(self.style.SUCCESS(
            f'LSL annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='LSL',
                fiscal_year=d['fy'],
                defaults={
                    "bonus_percent": Decimal(str(d["bonus"])),
                    "cash_percent": Decimal(str(d["cash"])),
                    "total_percent": Decimal(str(d["bonus"] + d["cash"])),
                    "book_close_date": book_close_date
                }
            )
            if created:
                created_divs += 1
            else:
                updated_divs += 1

        self.stdout.write(self.style.SUCCESS(
            f'LSL dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
