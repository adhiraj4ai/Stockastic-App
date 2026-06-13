from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds NIMB annual financial reports'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding NIMB financial data...')

        # Ensure NIMB company exists
        company, created = Company.objects.get_or_create(
            symbol='NIMB',
            defaults={
                'name': 'Nepal Investment Mega Bank Limited',
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
                    'cash_equivalent': 19396684984,
                    'due_from_nrb': 20554788427,
                    'placement_bfis': 15824899990,
                    'derivative_assets': 55462622,
                    'trading_assets': None,
                    'loans_bfis': 8743541751,
                    'loans_customers': 302874152554,
                    'investment_securities': 58977269289,
                    'current_tax_assets': 995881109,
                    'subsidiaries': 971500000,
                    'associates': 141158075,
                    'investment_property': 1164974230,
                    'property_equipment': 7386747711,
                    'intangible_assets': 1120146251,
                    'deferred_tax_assets': 107034716,
                    'other_assets': 7871281755,
                    'total_assets': 446185523464,
                },
                'LIABILITIES': {
                    'due_to_bfis': 5810446812,
                    'due_to_nrb': 344780000,
                    'derivative_liabilities': None,
                    'deposits_customers': 354414419888,
                    'borrowings': 11803500000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 12211739942,
                    'debt_securities': 6000000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 390584886642,
                },
                'EQUITY': {
                    'share_capital': 34128594897,
                    'share_premium': None,
                    'retained_earnings': -3471720114,
                    'reserves_reserves': 24943762039,
                    'total_equity': 55600636822,
                    'total_liabilities_equity': 446185523464,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 12470532586,
                    'due_from_nrb': 19133036776,
                    'placement_bfis': 15453817710,
                    'derivative_assets': 32468693,
                    'trading_assets': None,
                    'loans_bfis': 12225967073,
                    'loans_customers': 305494819131,
                    'investment_securities': 103529350771,
                    'current_tax_assets': 237694245,
                    'subsidiaries': 971500000,
                    'associates': 141158075,
                    'investment_property': 3016500008,
                    'property_equipment': 1104838673,
                    'intangible_assets': 1104838673,
                    'deferred_tax_assets': 1650158117,
                    'other_assets': 8359010783,
                    'total_assets': 491541734093,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3390914154,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 403416955890,
                    'borrowings': 5334000000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 9187406985,
                    'debt_securities': 10040000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 431369277029,
                },
                'EQUITY': {
                    'share_capital': 34128594897,
                    'share_premium': None,
                    'retained_earnings': -5693231880,
                    'reserves_reserves': 31737094047,
                    'total_equity': 60172457064,
                    'total_liabilities_equity': 491541734093,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 13325358240,
                    'due_from_nrb': 22293027962,
                    'placement_bfis': 24934135688,
                    'derivative_assets': 46684621,
                    'trading_assets': 172593870,
                    'loans_bfis': 15383653916,
                    'loans_customers': 323177812457,
                    'investment_securities': 138556341844,
                    'current_tax_assets': 275036942,
                    'subsidiaries': 1471500000,
                    'associates': 141158075,
                    'investment_property': 3684295489,
                    'property_equipment': 8306922105,
                    'intangible_assets': 1085493331,
                    'deferred_tax_assets': 2410867315,
                    'other_assets': 7640176299,
                    'total_assets': 562905058154,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3943305035,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 472347471581,
                    'borrowings': 2744000000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 8848232747,
                    'debt_securities': 10040000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 497923009363,
                },
                'EQUITY': {
                    'share_capital': 34128594897,
                    'share_premium': None,
                    'retained_earnings': -2455116667,
                    'reserves_reserves': 33308570561,
                    'total_equity': 64982048791,
                    'total_liabilities_equity': 562905058154,
                }
            }
        }

        # Profit & Loss Data (FY 079-080 to 081-082)
        profit_loss_data = {
            '079-080': {
                'INCOME': {
                    'interest_income': 35126122698,
                    'interest_expense': 22819024493,
                    'net_interest_income': 12307098205,
                    'fee_income': 2096408381,
                    'fee_expense': 495054437,
                    'net_fee_income': 1601353944,
                    'net_int_fee_income': 13908452149,
                    'trading_income': 507636800,
                    'other_operating_income': 352483326,
                    'total_operating_income': 14768572275,
                },
                'EXPENSES': {
                    'impairment_charge': -3200297813,
                    'personnel_expenses': 3036300648,
                    'other_operating_expenses': 1184023782,
                    'depreciation': 712323279,
                    'operating_profit': 6635626753,
                    'non_operating_income': 2272866,
                    'non_operating_expense': 1300817609,
                    'pbt': 5337082010,
                    'tax': None,
                    'net_profit': 3720833395,
                },
                'REGULATORY': {
                    'cd_ratio': 85.05,
                    'core_capital': 10.73,
                    'supplementary_capital': 2.59,
                    'capital_fund': 13.32,
                    'liquidity_crr': 3.50,
                    'npl_ratio': 4.54,
                    'spread': 4.50,
                    'total_employees': 3214,
                    'branches': 296,
                    'atms': 203,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 43153413599,
                    'interest_expense': 28036493765,
                    'net_interest_income': 15116919833,
                    'fee_income': 2332330331,
                    'fee_expense': 554337994,
                    'net_fee_income': 1777992337,
                    'net_int_fee_income': 16894912171,
                    'trading_income': 469545733,
                    'other_operating_income': 408084258,
                    'total_operating_income': 17772542162,
                },
                'EXPENSES': {
                    'impairment_charge': -5111564238,
                    'personnel_expenses': 3768832076,
                    'other_operating_expenses': 1566471635,
                    'depreciation': 933223351,
                    'operating_profit': 6392450862,
                    'non_operating_income': 4371833,
                    'non_operating_expense': 732100005,
                    'pbt': 5664722690,
                    'tax': None,
                    'net_profit': 4108892124,
                },
                'REGULATORY': {
                    'cd_ratio': 79.22,
                    'core_capital': 10.12,
                    'supplementary_capital': 2.85,
                    'capital_fund': 12.97,
                    'liquidity_crr': 4.52,
                    'npl_ratio': 4.91,
                    'spread': 4.27,
                    'total_employees': 3132,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 36175664503,
                    'interest_expense': 21976042492,
                    'net_interest_income': 14202622012,
                    'fee_income': 2767013555,
                    'fee_expense': 563775447,
                    'net_fee_income': 2203238108,
                    'net_int_fee_income': 16405860120,
                    'trading_income': 766059690,
                    'other_operating_income': 480558703,
                    'total_operating_income': 17652478512,
                },
                'EXPENSES': {
                    'impairment_charge': -4375381420,
                    'personnel_expenses': 3996510805,
                    'other_operating_expenses': 1610777987,
                    'depreciation': 938805661,
                    'operating_profit': 6731002639,
                    'non_operating_income': 36290121,
                    'non_operating_expense': 568496855,
                    'pbt': 6198795904,
                    'tax': None,
                    'net_profit': 4332281828,
                },
                'REGULATORY': {
                    'cd_ratio': 74.44,
                    'core_capital': 10.43,
                    'supplementary_capital': 2.71,
                    'capital_fund': 13.14,
                    'liquidity_crr': 4.62,
                    'npl_ratio': 6.35,
                    'spread': 3.77,
                    'branches': 272,
                    'atms': 265,
                }
            }
        }

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

            report, created = FinancialReport.objects.update_or_create(
                ticker='NIMB',
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
                    'bonus_share': 0.00,
                    'cash_dividend': 0.00,
                    'dividend_book_close_date': None,
                }
            )

            if created:
                created_reports += 1
            else:
                updated_reports += 1

        self.stdout.write(self.style.SUCCESS(
            f'NIMB annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))
