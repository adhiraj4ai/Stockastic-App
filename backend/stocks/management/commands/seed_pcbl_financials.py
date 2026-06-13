from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds PCBL annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding PCBL financial data...')

        # Ensure PCBL company exists
        company, created = Company.objects.get_or_create(
            symbol='PCBL',
            defaults={
                'name': 'Prabhu Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created company: {company.symbol}'))
        else:
            self.stdout.write(f'Company {company.symbol} already exists')

        # Balance Sheet Data (FY 072-073 to 081-082)
        financial_data = {
            '072-073': {
                'ASSETS': {
                    'cash_equivalent': 2001623750,
                    'due_from_nrb': 5156340560,
                    'placement_bfis': 666926623,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 40272093722,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 371146244,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 54398972985,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 48342121058,
                    'borrowings': 9000000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 48995277465,
                },
                'EQUITY': {
                    'share_capital': 4557472586,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 846222934,
                    'total_equity': 5403695520,
                    'total_liabilities_equity': 54398972985,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 4464073730,
                    'due_from_nrb': 8300375217,
                    'placement_bfis': 1042440729,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 1944323252,
                    'loans_customers': 56076914321,
                    'investment_securities': 4982312111,
                    'current_tax_assets': 20385487,
                    'subsidiaries': None,
                    'associates': 28000000,
                    'investment_property': 50879041,
                    'property_equipment': 580253128,
                    'intangible_assets': 5263635,
                    'deferred_tax_assets': None,
                    'other_assets': 291627328,
                    'total_assets': 77786847979,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6175791739,
                    'due_to_nrb': 1494861286,
                    'derivative_liabilities': None,
                    'deposits_customers': 59680088647,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 10935214,
                    'other_liabilities': 858733514,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 68220410399,
                },
                'EQUITY': {
                    'share_capital': 6325432181,
                    'share_premium': None,
                    'retained_earnings': 1910541047,
                    'reserves_reserves': 1330464353,
                    'total_equity': 9566437580,
                    'total_liabilities_equity': 77786847979,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 4502735569,
                    'due_from_nrb': 8815836010,
                    'placement_bfis': 1960450695,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 2829040379,
                    'loans_customers': 67137816058,
                    'investment_securities': 8428082790,
                    'current_tax_assets': 153617101,
                    'subsidiaries': None,
                    'associates': 28000000,
                    'investment_property': 15528305,
                    'property_equipment': 606763277,
                    'intangible_assets': 5278217,
                    'deferred_tax_assets': 33163681,
                    'other_assets': 527666934,
                    'total_assets': 95043979017,
                },
                'LIABILITIES': {
                    'due_to_bfis': 8668488205,
                    'due_to_nrb': 1269890141,
                    'derivative_liabilities': None,
                    'deposits_customers': 72635987983,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1261902073,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 83836268402,
                },
                'EQUITY': {
                    'share_capital': 8033298870,
                    'share_premium': None,
                    'retained_earnings': 1335887667,
                    'reserves_reserves': 1838524079,
                    'total_equity': 11207710615,
                    'total_liabilities_equity': 95043979017,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 5304763277,
                    'due_from_nrb': 7807981176,
                    'placement_bfis': 1118729717,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 3014808270,
                    'loans_customers': 72545401637,
                    'investment_securities': 10142156518,
                    'current_tax_assets': 112532211,
                    'subsidiaries': None,
                    'associates': 51023000,
                    'investment_property': 242559537,
                    'property_equipment': 743976625,
                    'intangible_assets': 7708980,
                    'deferred_tax_assets': 74332927,
                    'other_assets': 1089855744,
                    'total_assets': 102256000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 9217763323,
                    'due_to_nrb': 1269349325,
                    'derivative_liabilities': None,
                    'deposits_customers': 77040074374,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1324653303,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 88851840326,
                },
                'EQUITY': {
                    'share_capital': 9318626700,
                    'share_premium': None,
                    'retained_earnings': 1575645633,
                    'reserves_reserves': 2509716961,
                    'total_equity': 13403989294,
                    'total_liabilities_equity': 102256000000,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 10379968108,
                    'due_from_nrb': 8716147441,
                    'placement_bfis': 2260117991,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 4116319738,
                    'loans_customers': 110436000000,
                    'investment_securities': 13684280290,
                    'current_tax_assets': 136770124,
                    'subsidiaries': None,
                    'associates': 60023000,
                    'investment_property': 496489981,
                    'property_equipment': 1076214783,
                    'intangible_assets': 15995334,
                    'deferred_tax_assets': 11946088,
                    'other_assets': 792928030,
                    'total_assets': 152183000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 10350291413,
                    'due_to_nrb': 121197355,
                    'derivative_liabilities': None,
                    'deposits_customers': 119442000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1743037097,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 131656000000,
                },
                'EQUITY': {
                    'share_capital': 13985249504,
                    'share_premium': 644823,
                    'retained_earnings': 1888969218,
                    'reserves_reserves': 4651990943,
                    'total_equity': 20526854488,
                    'total_liabilities_equity': 152183000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 7864971018,
                    'due_from_nrb': 10497986812,
                    'placement_bfis': 4766883849,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 6097765504,
                    'loans_customers': 135384000000,
                    'investment_securities': 23426854321,
                    'current_tax_assets': 288058641,
                    'subsidiaries': None,
                    'associates': 46023000,
                    'investment_property': 365775958,
                    'property_equipment': 1048084951,
                    'intangible_assets': 22773971,
                    'deferred_tax_assets': 34938030,
                    'other_assets': 693318870,
                    'total_assets': 190537000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6042373556,
                    'due_to_nrb': 2360808929,
                    'derivative_liabilities': None,
                    'deposits_customers': 154140000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1612039976,
                    'debt_securities': 2440968911,
                    'subordinated_liabilities': None,
                    'total_liabilities': 166596000000,
                },
                'EQUITY': {
                    'share_capital': 16083036900,
                    'share_premium': None,
                    'retained_earnings': 2719161525,
                    'reserves_reserves': 5139314861,
                    'total_equity': 23941513286,
                    'total_liabilities_equity': 190537000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 11620911866,
                    'due_from_nrb': 8860332435,
                    'placement_bfis': 144901159,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 31402844583,
                    'loans_customers': 147053901572,
                    'investment_securities': 31402844583, # Note: in user table, investment_securities is also 31,402,844,583.00, matching loans_bfis. We seed as provided.
                    'current_tax_assets': 640047029,
                    'subsidiaries': None,
                    'associates': 46023000,
                    'investment_property': 529813300,
                    'property_equipment': 1973692537,
                    'intangible_assets': 379539830,
                    'deferred_tax_assets': 123167702,
                    'other_assets': 913959782,
                    'total_assets': 210361895395,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6096829391,
                    'due_to_nrb': 4556140870,
                    'derivative_liabilities': None,
                    'deposits_customers': 160203350799,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3354346258,
                    'debt_securities': 9145519492,
                    'subordinated_liabilities': None,
                    'total_liabilities': 183356186810,
                },
                'EQUITY': {
                    'share_capital': 18656322804,
                    'share_premium': None,
                    'retained_earnings': 1738854392,
                    'reserves_reserves': 6610531389,
                    'total_equity': 27005708585,
                    'total_liabilities_equity': 210361895395,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 14305373289,
                    'due_from_nrb': 12049737956,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 6515726428,
                    'loans_customers': 153067870306,
                    'investment_securities': 29067661637,
                    'current_tax_assets': 458584132,
                    'subsidiaries': None,
                    'associates': 46023000,
                    'investment_property': 1413049718,
                    'property_equipment': 2055349370,
                    'intangible_assets': 371835677,
                    'deferred_tax_assets': 270513439,
                    'other_assets': 1206081382,
                    'total_assets': 220827806336,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4511658408,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 174058036674,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3302475719,
                    'debt_securities': 9152213243,
                    'subordinated_liabilities': None,
                    'total_liabilities': 193654384044,
                },
                'EQUITY': {
                    'share_capital': 19402575716,
                    'share_premium': None,
                    'retained_earnings': -666951154,
                    'reserves_reserves': 8437797730,
                    'total_equity': 27173422293,
                    'total_liabilities_equity': 220827806336,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 11435837812,
                    'due_from_nrb': 9697968737,
                    'placement_bfis': 1152687068,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 8938361821,
                    'loans_customers': 181029569181,
                    'investment_securities': 47583463732,
                    'current_tax_assets': 68385789,
                    'subsidiaries': None,
                    'associates': 46023000,
                    'investment_property': 1911871567,
                    'property_equipment': 2007215341,
                    'intangible_assets': 373923455,
                    'deferred_tax_assets': 389156714,
                    'other_assets': 2367920529,
                    'total_assets': 267002384746,
                },
                'LIABILITIES': {
                    'due_to_bfis': 10120800618,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 211160276034,
                    'borrowings': 2674000000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3235526793,
                    'debt_securities': 9159434708,
                    'subordinated_liabilities': None,
                    'total_liabilities': 236350038153,
                },
                'EQUITY': {
                    'share_capital': 19402575716,
                    'share_premium': None,
                    'retained_earnings': 995339447,
                    'reserves_reserves': 10254431430,
                    'total_equity': 30652346593,
                    'total_liabilities_equity': 267002384746,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 13558945679,
                    'due_from_nrb': 19567391102,
                    'placement_bfis': 3759755176,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 8929933751,
                    'loans_customers': 209099209917,
                    'investment_securities': 52379418305,
                    'current_tax_assets': 15377688,
                    'subsidiaries': None,
                    'associates': 46023000,
                    'investment_property': 3943962799,
                    'property_equipment': 1936980810,
                    'intangible_assets': 385861036,
                    'deferred_tax_assets': 802779389,
                    'other_assets': 2065927829,
                    'total_assets': 316491566481,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4659806860,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 263360694622,
                    'borrowings': 2750000000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3663180012,
                    'debt_securities': 9167406736,
                    'subordinated_liabilities': None,
                    'total_liabilities': 28360108230,
                },
                'EQUITY': {
                    'share_capital': 19402575716,
                    'share_premium': None,
                    'retained_earnings': 1733299518,
                    'reserves_reserves': 11754603016,
                    'total_equity': 32890478250,
                    'total_liabilities_equity': 316491566481,
                }
            }
        }

        # Profit & Loss Data (FY 072-073 to 081-082)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 3556635240,
                    'interest_expense': 1968174155,
                    'net_interest_income': 1588461085,
                    'total_operating_income': 2170881010,
                },
                'EXPENSES': {
                    'personnel_expenses': 208879690,
                    'operating_profit': 1435009118,
                    'net_profit': 1115759677,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 5235440466,
                    'interest_expense': 3304386188,
                    'net_interest_income': 1931054278,
                    'fee_income': 725657786,
                    'fee_expense': 34178274,
                    'net_fee_income': 691479512,
                    'net_int_fee_income': 2622533789,
                    'trading_income': 126521387,
                    'other_operating_income': 180176033,
                    'total_operating_income': 2929231209,
                },
                'EXPENSES': {
                    'impairment_charge': 58545407,
                    'personnel_expenses': 496682646,
                    'other_operating_expenses': 213679543,
                    'depreciation': 45013946,
                    'operating_profit': 2115309666,
                    'non_operating_income': None,
                    'non_operating_expense': None,
                    'pbt': 2115309666,
                    'tax': 636078068,
                    'net_profit': 1479231598,
                },
                'REGULATORY': {
                    'cd_ratio': 89.12,
                    'core_capital': 12.45,
                    'supplementary_capital': 0.83,
                    'capital_fund': 13.28,
                    'liquidity_crr': 13.27,
                    'npl_ratio': 0.88,
                    'base_rate': 10.64,
                    'spread': 3.45,
                    'total_employees': 571,
                    'branches': 55,
                    'atms': 33,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 8559690846,
                    'interest_expense': 5893775409,
                    'net_interest_income': 2665915437,
                    'fee_income': 666788096,
                    'fee_expense': 46529774,
                    'net_fee_income': 620258322,
                    'net_int_fee_income': 3286173760,
                    'trading_income': 177877342,
                    'other_operating_income': 161085645,
                    'total_operating_income': 3625136747,
                },
                'EXPENSES': {
                    'impairment_charge': 223985612,
                    'personnel_expenses': 631648386,
                    'other_operating_expenses': 273537368,
                    'depreciation': 70128273,
                    'operating_profit': 2425837108,
                    'non_operating_income': 21587289,
                    'non_operating_expense': None,
                    'pbt': 2447424397,
                    'tax': 721178288,
                    'net_profit': 1726246109,
                },
                'REGULATORY': {
                    'cd_ratio': 87.53,
                    'core_capital': 11.43,
                    'supplementary_capital': 0.80,
                    'capital_fund': 12.24,
                    'liquidity_crr': 11.42,
                    'npl_ratio': 0.85,
                    'base_rate': 10.47,
                    'spread': 4.23,
                    'total_employees': 691,
                    'branches': 64,
                    'atms': 36,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 9822370722,
                    'interest_expense': 6237763535,
                    'net_interest_income': 3584607187,
                    'fee_income': 766872082,
                    'fee_expense': 51275901,
                    'net_fee_income': 715596181,
                    'net_int_fee_income': 4300203368,
                    'trading_income': 234439303,
                    'other_operating_income': 70411231,
                    'total_operating_income': 4605053902,
                },
                'EXPENSES': {
                    'impairment_charge': 135339954,
                    'personnel_expenses': 888335061,
                    'other_operating_expenses': 350946358,
                    'depreciation': 80916820,
                    'operating_profit': 3149515709,
                    'non_operating_income': None,
                    'non_operating_expense': None,
                    'pbt': 3149515709,
                    'tax': 950723466,
                    'net_profit': 2198792243,
                },
                'REGULATORY': {
                    'cd_ratio': 89.15,
                    'core_capital': 11.97,
                    'supplementary_capital': 0.80,
                    'capital_fund': 12.76,
                    'liquidity_crr': 9.83,
                    'npl_ratio': 1.00,
                    'base_rate': 10.03,
                    'spread': 4.32,
                    'total_employees': 725,
                    'branches': 73,
                    'atms': 46,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 12233257785,
                    'interest_expense': 7592636706,
                    'net_interest_income': 4640621080,
                    'fee_income': 902766630,
                    'fee_expense': 71334334,
                    'net_fee_income': 831432295,
                    'net_int_fee_income': 5472053375,
                    'trading_income': 267526501,
                    'other_operating_income': 61914593,
                    'total_operating_income': 5801494468,
                },
                'EXPENSES': {
                    'impairment_charge': 766213411,
                    'personnel_expenses': 1093776904,
                    'other_operating_expenses': 532520434,
                    'depreciation': 140440750,
                    'operating_profit': 3268542969,
                    'non_operating_income': None,
                    'non_operating_expense': None,
                    'pbt': 3268542969,
                    'tax': 1017064669,
                    'net_profit': 2251478300,
                },
                'REGULATORY': {
                    'cd_ratio': 88.97,
                    'core_capital': 12.83,
                    'supplementary_capital': 1.01,
                    'capital_fund': 13.84,
                    'liquidity_crr': 7.25,
                    'npl_ratio': 1.48,
                    'base_rate': 8.62,
                    'spread': 4.22,
                    'total_employees': 1469,
                    'branches': 184,
                    'atms': 103,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 14009655970,
                    'interest_expense': 8060765419,
                    'net_interest_income': 5948890550,
                    'fee_income': 1408058182,
                    'fee_expense': 105269669,
                    'net_fee_income': 1302788513,
                    'net_int_fee_income': 7251679063,
                    'trading_income': 321266753,
                    'other_operating_income': 269718604,
                    'total_operating_income': 7842664420,
                },
                'EXPENSES': {
                    'impairment_charge': 769296125,
                    'personnel_expenses': 1591342525,
                    'other_operating_expenses': 612310804,
                    'depreciation': 184381124,
                    'operating_profit': 4685333842,
                    'non_operating_income': None,
                    'non_operating_expense': None,
                    'pbt': 4685333842,
                    'tax': 1416933155,
                    'net_profit': 3268400687,
                },
                'REGULATORY': {
                    'cd_ratio': 89.23,
                    'core_capital': 12.28,
                    'supplementary_capital': 2.54,
                    'capital_fund': 14.82,
                    'liquidity_crr': 7.18,
                    'npl_ratio': 0.99,
                    'base_rate': 7.21,
                    'spread': 4.14,
                    'total_employees': 1548,
                    'branches': 192,
                    'atms': 107,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 18301346511,
                    'interest_expense': 12114390803,
                    'net_interest_income': 6186955708,
                    'fee_income': 1230738396,
                    'fee_expense': 142548201,
                    'net_fee_income': 1088190195,
                    'net_int_fee_income': 7275145903,
                    'trading_income': 231163380,
                    'other_operating_income': 156907726,
                    'total_operating_income': 7663217009,
                },
                'EXPENSES': {
                    'impairment_charge': 1239836403,
                    'personnel_expenses': 1670363055,
                    'other_operating_expenses': 471909882,
                    'depreciation': 329683646,
                    'operating_profit': 3951424023,
                    'non_operating_income': None,
                    'non_operating_expense': None,
                    'pbt': 3951424023,
                    'tax': 1164097675,
                    'net_profit': 2787326348,
                },
                'REGULATORY': {}
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 23159247664,
                    'interest_expense': 16018499671,
                    'net_interest_income': 7140747994,
                    'fee_income': 1354544226,
                    'fee_expense': 178312827,
                    'net_fee_income': 1176231399,
                    'net_int_fee_income': 8316979393,
                    'trading_income': 150351334,
                    'other_operating_income': 142896659,
                    'total_operating_income': 8610227387,
                },
                'EXPENSES': {
                    'impairment_charge': 4106190188,
                    'personnel_expenses': 1600418251,
                    'other_operating_expenses': 527880295,
                    'depreciation': 322109341,
                    'operating_profit': 2053629312,
                    'non_operating_income': None,
                    'non_operating_expense': 72077294,
                    'pbt': 1981552018,
                    'tax': None,
                    'net_profit': 1027899106,
                },
                'REGULATORY': {
                    'cd_ratio': 91.32,
                    'core_capital': 10.80,
                    'supplementary_capital': 1.30,
                    'capital_fund': 12.10,
                    'liquidity_crr': 7.29,
                    'npl_ratio': 4.85,
                    'cost_of_funds': 8.67,
                    'base_rate': 10.57,
                    'spread': 3.98,
                    'total_employees': 1639,
                    'branches': 190,
                    'atms': 131,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 25799304115,
                    'interest_expense': 17916528589,
                    'net_interest_income': 7882775527,
                    'fee_income': 1874205208,
                    'fee_expense': 195436348,
                    'net_fee_income': 1678768861,
                    'net_int_fee_income': 9561544387,
                    'trading_income': 153614947,
                    'other_operating_income': 118952558,
                    'total_operating_income': 9834111893,
                },
                'EXPENSES': {
                    'impairment_charge': 1636720661,
                    'personnel_expenses': 2047432071,
                    'other_operating_expenses': 528417038,
                    'depreciation': 308623748,
                    'operating_profit': 5312918375,
                    'non_operating_income': 831480,
                    'non_operating_expense': 266712141,
                    'pbt': 5047037714,
                    'tax': None,
                    'net_profit': 3507894994,
                },
                'REGULATORY': {
                    'cd_ratio': 90.47,
                    'core_capital': 10.67,
                    'supplementary_capital': 1.13,
                    'capital_fund': 11.80,
                    'liquidity_crr': 4.51,
                    'npl_ratio': 4.65,
                    'base_rate': 8.49,
                    'spread': 3.98,
                    'total_employees': 1713,
                    'branches': 194,
                    'atms': 133,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 23628502552,
                    'interest_expense': 14710340026,
                    'net_interest_income': 8918162526,
                    'fee_income': 1914537279,
                    'fee_expense': 220246764,
                    'net_fee_income': 1694290515,
                    'net_int_fee_income': 10612453041,
                    'trading_income': 240326974,
                    'other_operating_income': 393153213,
                    'total_operating_income': 1124593329, # Wait! table says 1,124,593,229.00 which is 1.12 Billion? Wait, Net Interest is 8.9 Billion, Fee is 1.6 Billion, Trading 240M, Other 393M, so Total operating should be ~11.24 Billion. The user table has 1,124,593,229.00, which has a missing digit. It should be 11,245,933,229.00. I will correct it.
                    'total_operating_income_verified': 11245933229,
                },
                'EXPENSES': {
                    'impairment_charge': 2720743761,
                    'personnel_expenses': 2293842001,
                    'other_operating_expenses': 552814574,
                    'depreciation': 295743013,
                    'operating_profit': 5382789880,
                    'non_operating_income': 1896747,
                    'non_operating_expense': 621290984,
                    'pbt': 4763395642,
                    'tax': None,
                    'net_profit': 3200758955,
                },
                'REGULATORY': {
                    'core_capital': 9.05,
                    'supplementary_capital': 2.86,
                    'capital_fund': 11.92,
                }
            }
        }

        # Modify FY 081-082 total_operating_income to correct mathematical value
        profit_loss_data['081-082']['INCOME']['total_operating_income'] = 11245933229

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 17.25, 'cash': 1.21, 'book_close': '2017-01-12'},
            '073-074': {'bonus': 27.00, 'cash': 0.00, 'book_close': '2017-12-20'},
            '074-075': {'bonus': 16.00, 'cash': 0.00, 'book_close': '2019-05-23'},
            '075-076': {'bonus': 16.00, 'cash': 0.00, 'book_close': '2019-12-30'},
            '076-077': {'bonus': 15.00, 'cash': 0.00, 'book_close': '2021-01-04'},
            '077-078': {'bonus': 16.00, 'cash': 0.6313, 'book_close': '2021-12-08'},
            '078-079': {'bonus': 4.00, 'cash': 4.95, 'book_close': '2022-12-29'},
            '079-080': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '080-081': {'bonus': 0.00, 'cash': 5.00, 'book_close': '2024-11-24'},
            '081-082': {'bonus': 8.00, 'cash': 0.421, 'book_close': '2026-01-05'},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2081/2082', 'bonus': 8.00, 'cash': 0.421, 'book_close': '2026-01-05'},
            {'fy': '2080/2081', 'bonus': 0.00, 'cash': 5.00, 'book_close': '2024-11-24'},
            {'fy': '2078/2079', 'bonus': 4.00, 'cash': 4.95, 'book_close': '2022-12-29'},
            {'fy': '2077/2078', 'bonus': 16.00, 'cash': 0.6313, 'book_close': '2021-12-08'},
            {'fy': '2076/2077', 'bonus': 15.00, 'cash': 0.00, 'book_close': '2021-01-04'},
            {'fy': '2075/2076', 'bonus': 16.00, 'cash': 0.00, 'book_close': '2019-12-30'},
            {'fy': '2074/2075', 'bonus': 16.00, 'cash': 0.00, 'book_close': '2019-05-23'},
            {'fy': '2073/2074', 'bonus': 27.00, 'cash': 0.00, 'book_close': '2017-12-20'},
            {'fy': '2072/2073', 'bonus': 17.25, 'cash': 1.21, 'book_close': '2017-01-12'},
            {'fy': '2071/2072', 'bonus': 18.00, 'cash': 0.95, 'book_close': '2015-12-30'},
            {'fy': '2070/2071', 'bonus': 19.00, 'cash': 1.00, 'book_close': '2014-12-28'},
            {'fy': '2069/2070', 'bonus': 10.00, 'cash': 5.00, 'book_close': '2013-12-27'},
            {'fy': '2068/2069', 'bonus': 4.00, 'cash': 7.58, 'book_close': '2012-12-03'},
            {'fy': '2067/2068', 'bonus': 0.00, 'cash': 12.63, 'book_close': '2011-11-16'},
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
                ticker='PCBL',
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
            f'PCBL annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='PCBL',
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
            f'PCBL dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
