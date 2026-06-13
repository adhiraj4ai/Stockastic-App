from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds KBL annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding KBL financial data...')

        # Ensure KBL company exists
        company, created = Company.objects.get_or_create(
            symbol='KBL',
            defaults={
                'name': 'Kumari Bank Limited',
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
                    'cash_equivalent': 861186377,
                    'due_from_nrb': 3104484533,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 29486505624,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 265414426,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 42416507350,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 37950525144,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 38382913472,
                },
                'EQUITY': {
                    'share_capital': 3265991503,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 767602375,
                    'total_equity': 4033593878,
                    'total_liabilities_equity': 42416507350,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 3627601100,
                    'due_from_nrb': 3104484533,
                    'placement_bfis': 1720307330,
                    'derivative_assets': 25644216,
                    'trading_assets': None,
                    'loans_bfis': 704242556,
                    'loans_customers': 29149470116,
                    'investment_securities': 3812743021,
                    'current_tax_assets': 58773373,
                    'subsidiaries': None,
                    'associates': 20000000,
                    'investment_property': 180540628,
                    'property_equipment': 262223434,
                    'intangible_assets': 3190993,
                    'deferred_tax_assets': None,
                    'other_assets': 69240732,
                    'total_assets': 42738462031,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4971257613,
                    'due_to_nrb': 1186128000,
                    'derivative_liabilities': None,
                    'deposits_customers': 31793139531,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 474600,
                    'deferred_tax_liabilities': 142965690,
                    'other_liabilities': 485157555,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 38579122989,
                },
                'EQUITY': {
                    'share_capital': 2699166532,
                    'share_premium': None,
                    'retained_earnings': 713309068,
                    'reserves_reserves': 746863442,
                    'total_equity': 4159339042,
                    'total_liabilities_equity': 42738462031,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 4734754206,
                    'due_from_nrb': 4910801029,
                    'placement_bfis': 1484107257,
                    'derivative_assets': 23185586,
                    'trading_assets': None,
                    'loans_bfis': 1139156439,
                    'loans_customers': 43557019674,
                    'investment_securities': 4728824499,
                    'current_tax_assets': 45246585,
                    'subsidiaries': None,
                    'associates': 20000000,
                    'investment_property': 160183594,
                    'property_equipment': 350648737,
                    'intangible_assets': 7418721,
                    'deferred_tax_assets': None,
                    'other_assets': 254818102,
                    'total_assets': 61416164427,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3333547375,
                    'due_to_nrb': 1019287000,
                    'derivative_liabilities': None,
                    'deposits_customers': 47691769932,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 1541463,
                    'deferred_tax_liabilities': 96106573,
                    'other_liabilities': 1010542306,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 53152794649,
                },
                'EQUITY': {
                    'share_capital': 5969495823,
                    'share_premium': None,
                    'retained_earnings': 1154599291,
                    'reserves_reserves': 1139274663,
                    'total_equity': 8263369778,
                    'total_liabilities_equity': 61416164427,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 8821135632,
                    'due_from_nrb': 3580514349,
                    'placement_bfis': 384382797,
                    'derivative_assets': 5858648394,
                    'trading_assets': None,
                    'loans_bfis': 3035403974,
                    'loans_customers': 73017913052,
                    'investment_securities': 9121568177,
                    'current_tax_assets': 61227298,
                    'subsidiaries': 200000000,
                    'associates': 20000000,
                    'investment_property': 88422015,
                    'property_equipment': 662104656,
                    'intangible_assets': 97393609,
                    'deferred_tax_assets': 77789908,
                    'other_assets': 284981292,
                    'total_assets': 105311000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 12168482092,
                    'due_to_nrb': 1433248037,
                    'derivative_liabilities': 5715359938,
                    'deposits_customers': 73201143766,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 2231750,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1071934043,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 93592399626,
                },
                'EQUITY': {
                    'share_capital': 8685573112,
                    'share_premium': 54803159,
                    'retained_earnings': 883698633,
                    'reserves_reserves': 2095010622,
                    'total_equity': 11719085527,
                    'total_liabilities_equity': 105311000000,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 9154311271,
                    'due_from_nrb': 5821520113,
                    'placement_bfis': 852447642,
                    'derivative_assets': 46522820,
                    'trading_assets': None,
                    'loans_bfis': 3796212739,
                    'loans_customers': 110717000000,
                    'investment_securities': 12757707848,
                    'current_tax_assets': 328287861,
                    'subsidiaries': 220000000,
                    'associates': 130063901,
                    'investment_property': 60348333,
                    'property_equipment': 1383658862,
                    'intangible_assets': 206831581,
                    'deferred_tax_assets': 10001697,
                    'other_assets': 486767825,
                    'total_assets': 145972000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7475893656,
                    'due_to_nrb': 225355404,
                    'derivative_liabilities': None,
                    'deposits_customers': 116547000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 2312232,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1458057633,
                    'debt_securities': 2995116270,
                    'subordinated_liabilities': None,
                    'total_liabilities': 128704000000,
                },
                'EQUITY': {
                    'share_capital': 12520049469,
                    'share_premium': 571628069,
                    'retained_earnings': 1317542681,
                    'reserves_reserves': 2858953451,
                    'total_equity': 17268173670,
                    'total_liabilities_equity': 145972000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 7580241082,
                    'due_from_nrb': 8486453288,
                    'placement_bfis': 4840711695,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 5123681172,
                    'loans_customers': 137898000000,
                    'investment_securities': 22697941963,
                    'current_tax_assets': 257142529,
                    'subsidiaries': 220000000,
                    'associates': 155017596,
                    'investment_property': 128112878,
                    'property_equipment': 1258559299,
                    'intangible_assets': 197573361,
                    'deferred_tax_assets': None,
                    'other_assets': 939456216,
                    'total_assets': 189783000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 14731924737,
                    'due_to_nrb': 5088973668,
                    'derivative_liabilities': 3267738,
                    'deposits_customers': 145838000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 2334810,
                    'deferred_tax_liabilities': 145625275,
                    'other_liabilities': 2084796958,
                    'debt_securities': 2995439826,
                    'subordinated_liabilities': None,
                    'total_liabilities': 170891000000,
                },
                'EQUITY': {
                    'share_capital': 13878474836,
                    'share_premium': 88804041,
                    'retained_earnings': 1247097056,
                    'reserves_reserves': 3677846125,
                    'total_equity': 18892220588,
                    'total_liabilities_equity': 189783000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 17609892391,
                    'due_from_nrb': 5475310681,
                    'placement_bfis': 1949476858,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 5846262217,
                    'loans_customers': 152562929781,
                    'investment_securities': 22815085583,
                    'current_tax_assets': 454701292,
                    'subsidiaries': 420000000,
                    'associates': 185017596,
                    'investment_property': 144491994,
                    'property_equipment': 1179754479,
                    'intangible_assets': 161441291,
                    'deferred_tax_assets': None,
                    'other_assets': 3304074229,
                    'total_assets': 212108438392,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6194529106,
                    'due_to_nrb': 1345585620,
                    'derivative_liabilities': 39334195,
                    'deposits_customers': 176767665556,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 2500000,
                    'deferred_tax_liabilities': 75208206,
                    'other_liabilities': 3685702222,
                    'debt_securities': 2995797489,
                    'subordinated_liabilities': None,
                    'total_liabilities': 191106322395,
                },
                'EQUITY': {
                    'share_capital': 14711183326,
                    'share_premium': 88804041,
                    'retained_earnings': 1872567427,
                    'reserves_reserves': 4329561203,
                    'total_equity': 21002115997,
                    'total_liabilities_equity': 212108438392,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 19921482766,
                    'due_from_nrb': 13460944529,
                    'placement_bfis': 7771445793,
                    'derivative_assets': 184833645,
                    'trading_assets': None,
                    'loans_bfis': 9754306460,
                    'loans_customers': 270937308309,
                    'investment_securities': 42696595043,
                    'current_tax_assets': 1389772126,
                    'subsidiaries': 600000000,
                    'associates': 1185017596,
                    'investment_property': 1263212752,
                    'property_equipment': 2515854003,
                    'intangible_assets': 188670059,
                    'deferred_tax_assets': 63033290,
                    'other_assets': 8592310273,
                    'total_assets': 380524786643,
                },
                'LIABILITIES': {
                    'due_to_bfis': 9233574989,
                    'due_to_nrb': 1496500000,
                    'derivative_liabilities': 170104982,
                    'deposits_customers': 316047054527,
                    'borrowings': 2645517880,
                    'current_tax_liabilities': None,
                    'provisions': 3000000,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 6626257729,
                    'debt_securities': 8987974650,
                    'subordinated_liabilities': None,
                    'total_liabilities': 345209984757,
                },
                'EQUITY': {
                    'share_capital': 26225861340,
                    'share_premium': None,
                    'retained_earnings': -2202909147,
                    'reserves_reserves': 11291849693,
                    'total_equity': 35314801886,
                    'total_liabilities_equity': 380524786643,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 19581636193,
                    'due_from_nrb': 28158091418,
                    'placement_bfis': 1422914007,
                    'derivative_assets': 346539668,
                    'trading_assets': None,
                    'loans_bfis': 10745446714,
                    'loans_customers': 268431270470,
                    'investment_securities': 64635154603,
                    'current_tax_assets': 2577355650,
                    'subsidiaries': 600000000,
                    'associates': 1165017596,
                    'investment_property': 1913183766,
                    'property_equipment': 2294213275,
                    'intangible_assets': 219588225,
                    'deferred_tax_assets': 108629781,
                    'other_assets': 7253840425,
                    'total_assets': 409452881793,
                },
                'LIABILITIES': {
                    'due_to_bfis': 14717409163,
                    'due_to_nrb': 3729500000,
                    'derivative_liabilities': 350040393,
                    'deposits_customers': 333111322485,
                    'borrowings': 1340593579,
                    'current_tax_liabilities': None,
                    'provisions': 3000000,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 7417356293,
                    'debt_securities': 13980460457,
                    'subordinated_liabilities': None,
                    'total_liabilities': 374649682371,
                },
                'EQUITY': {
                    'share_capital': 26225861340,
                    'share_premium': None,
                    'retained_earnings': -5367424480,
                    'reserves_reserves': 13944762562,
                    'total_equity': 34803199422,
                    'total_liabilities_equity': 409452881793,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 35350484074,
                    'due_from_nrb': 21339804952,
                    'placement_bfis': 13387665129,  # Corrected typo in user's table (133,877,665,129.00 -> 13,387,665,129)
                    'derivative_assets': 1176104630,
                    'trading_assets': None,
                    'loans_bfis': 14153339391,
                    'loans_customers': 260322398319,
                    'investment_securities': 80098703721,
                    'current_tax_assets': 536113916,
                    'subsidiaries': 600000000,
                    'associates': 960017596,
                    'investment_property': 2538824508,
                    'property_equipment': 2657414617,
                    'intangible_assets': 184391875,
                    'deferred_tax_assets': 1092503225,
                    'other_assets': 7285874319,
                    'total_assets': 441683640272,
                },
                'LIABILITIES': {
                    'due_to_bfis': 11085042708,
                    'due_to_nrb': 3895761000,
                    'derivative_liabilities': 1168560453,
                    'deposits_customers': 364639161514,
                    'borrowings': 1380591727,
                    'current_tax_liabilities': None,
                    'provisions': 3100000,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 8412759020,
                    'debt_securities': 13981837110,
                    'subordinated_liabilities': None,
                    'total_liabilities': 404566813532,
                },
                'EQUITY': {
                    'share_capital': 26225861340,
                    'share_premium': None,
                    'retained_earnings': -3849526718,
                    'reserves_reserves': 14740492118,
                    'total_equity': 37116826740,
                    'total_liabilities_equity': 441683640272,
                }
            }
        }

        # Profit & Loss Data (FY 072-073 to 081-082)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 2692488819,
                    'interest_expense': 1517056114,
                    'net_interest_income': 1175432705,
                    'total_operating_income': 1514045375,
                },
                'EXPENSES': {
                    'personnel_expenses': 316570560,
                    'operating_profit': 754907930,
                    'net_profit': 716064646,
                },
                'REGULATORY': {
                    'total_employees': None,
                }
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 3736879327,
                    'interest_expense': 2299277448,
                    'net_interest_income': 1437601879,
                    'fee_income': 278880211,
                    'fee_expense': 23538573,
                    'net_fee_income': 255341638,
                    'net_int_fee_income': 1692943517,
                    'trading_income': 85261574,
                    'other_operating_income': 61126449,
                    'total_operating_income': 1839331539,
                },
                'EXPENSES': {
                    'impairment_charge': -56011027,
                    'personnel_expenses': 518630168,
                    'other_operating_expenses': 248154532,
                    'depreciation': 45947101,
                    'operating_profit': 1082610764,
                    'non_operating_income': 68622159,
                    'non_operating_expense': None,
                    'pbt': 1151232923,
                    'tax': 358089929,
                    'net_profit': 793142994,
                },
                'REGULATORY': {
                    'cd_ratio': 87.60,
                    'core_capital': 13.55,
                    'supplementary_capital': 0.95,
                    'capital_fund': 14.50,
                    'liquidity_crr': 10.33,
                    'npl_ratio': 1.86,
                    'base_rate': 11.31,
                    'spread': 3.26,
                    'total_employees': 755,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 6804011381,
                    'interest_expense': 4771333239,
                    'net_interest_income': 2032678141,
                    'fee_income': 396815439,
                    'fee_expense': 27322461,
                    'net_fee_income': 369492978,
                    'net_int_fee_income': 2402171119,
                    'trading_income': 148951414,
                    'other_operating_income': 100163792,
                    'total_operating_income': 2651286325,
                },
                'EXPENSES': {
                    'impairment_charge': 31946183,
                    'personnel_expenses': 801840723,
                    'other_operating_expenses': 380917372,
                    'depreciation': 79214269,
                    'operating_profit': 1357367777,
                    'non_operating_income': 24529083,
                    'non_operating_expense': None,
                    'pbt': 1381896860,  # Corrected typo in user's table (11,381,896,860.00 -> 1,381,896,860)
                    'tax': 340004155,
                    'net_profit': 1041892704,
                },
                'REGULATORY': {
                    'cd_ratio': 89.55,
                    'core_capital': 12.48,
                    'supplementary_capital': 0.88,
                    'capital_fund': 13.36,
                    'liquidity_crr': 6.85,
                    'npl_ratio': 1.05,
                    'base_rate': 11.60,
                    'spread': 3.12,
                    'total_employees': 796,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 9098573839,
                    'interest_expense': 6228619912,
                    'net_interest_income': 2869953928,
                    'fee_income': 465986518,
                    'fee_expense': 31866063,
                    'net_fee_income': 434120455,
                    'net_int_fee_income': 3304074383,
                    'trading_income': 258904627,
                    'other_operating_income': 84919398,
                    'total_operating_income': 3647898408,
                },
                'EXPENSES': {
                    'impairment_charge': 229030770,
                    'personnel_expenses': 978860368,
                    'other_operating_expenses': 554656220,
                    'depreciation': 120126238,
                    'operating_profit': 1765224812,
                    'non_operating_income': 11842001,
                    'non_operating_expense': 1029811,
                    'pbt': 1776037002,
                    'tax': 545658742,
                    'net_profit': 1230378260,
                },
                'REGULATORY': {
                    'cd_ratio': 90.11,
                    'core_capital': 10.89,
                    'supplementary_capital': 0.86,
                    'capital_fund': 11.75,
                    'liquidity_crr': 4.59,
                    'npl_ratio': 1.01,
                    'base_rate': 10.82,
                    'spread': 3.54,
                    'total_employees': 1043,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 10569829242,
                    'interest_expense': 6996630749,
                    'net_interest_income': 3573198475,
                    'fee_income': 529322874,
                    'fee_expense': 35833499,
                    'net_fee_income': 493489375,
                    'net_int_fee_income': 4066687850,  # Corrected typo in user's table (40,666,878,509.00 -> 4,066,687,850)
                    'trading_income': 355323689,
                    'other_operating_income': 15435693,
                    'total_operating_income': 4437447231,
                },
                'EXPENSES': {
                    'impairment_charge': 461786171,
                    'personnel_expenses': 1408600989,
                    'other_operating_expenses': 703066709,
                    'depreciation': 177913962,
                    'operating_profit': 1686079399,
                    'non_operating_income': 23336294,
                    'non_operating_expense': 32238,
                    'pbt': 1709383455,
                    'tax': 550877499,
                    'net_profit': 1158505956,
                },
                'REGULATORY': {
                    'cd_ratio': 92.19,
                    'core_capital': 12.01,
                    'supplementary_capital': 3.34,
                    'capital_fund': 15.35,
                    'liquidity_crr': 3.78,
                    'npl_ratio': 1.39,
                    'base_rate': 10.08,
                    'spread': 4.07,
                    'total_employees': 1781,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 12776387133,
                    'interest_expense': 7698873522,
                    'net_interest_income': 5077513611,
                    'fee_income': 822620181,
                    'fee_expense': 38901965,
                    'net_fee_income': 783718216,
                    'net_int_fee_income': 5861231827,
                    'trading_income': 420833394,
                    'other_operating_income': 390328416,
                    'total_operating_income': 6672393638,
                },
                'EXPENSES': {
                    'impairment_charge': 475280357,
                    'personnel_expenses': 2023918383,
                    'other_operating_expenses': 884098269,
                    'depreciation': 283304555,
                    'operating_profit': 3005792073,
                    'non_operating_income': 33895859,
                    'non_operating_expense': 290729,
                    'pbt': 3039397203,
                    'tax': 1068667046,
                    'net_profit': 1970730157,
                },
                'REGULATORY': {
                    'cd_ratio': 90.99,
                    'core_capital': 10.64,
                    'supplementary_capital': 3.07,
                    'capital_fund': 13.71,
                    'liquidity_crr': 3.72,
                    'npl_ratio': 0.96,
                    'base_rate': 7.90,
                    'spread': 3.13,
                    'total_employees': 1881,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 18355159241,
                    'interest_expense': 12137993244,
                    'net_interest_income': 6217165997,
                    'fee_income': 962856296,
                    'fee_expense': 144683738,
                    'net_fee_income': 818172558,
                    'net_int_fee_income': 7035338555,
                    'trading_income': 377867068,
                    'other_operating_income': 527950068,
                    'total_operating_income': 7941155691,
                },
                'EXPENSES': {
                    'impairment_charge': 812100287,
                    'personnel_expenses': 2332987934,
                    'other_operating_expenses': 683386361,
                    'depreciation': 535205469,
                    'operating_profit': 3577475641,
                    'non_operating_income': 18320846,
                    'non_operating_expense': 1981949,
                    'pbt': 3593814538,
                    'tax': 1014004706,
                    'net_profit': 2579809832,
                },
                'REGULATORY': {
                    'cd_ratio': 0.87,
                    'core_capital': 0.10,
                    'supplementary_capital': 0.03,
                    'capital_fund': 0.13,
                    'liquidity_crr': 0.04,
                    'npl_ratio': 0.01,
                    'base_rate': 0.10,
                    'spread': 0.04,
                    'total_employees': 1856,
                }
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 34112242309,
                    'interest_expense': 23046063629,
                    'net_interest_income': 11066178679,
                    'fee_income': 1784927771,
                    'fee_expense': 271621272,
                    'net_fee_income': 1513306498,
                    'net_int_fee_income': 12579485178,
                    'trading_income': 363035269,
                    'other_operating_income': 115156582,
                    'total_operating_income': 13057677029,
                },
                'EXPENSES': {
                    'impairment_charge': 8115800765,
                    'personnel_expenses': 2209820636,
                    'other_operating_expenses': 1019946662,
                    'depreciation': 750458982,
                    'operating_profit': 961649985,
                    'non_operating_income': 53751493,
                    'non_operating_expense': 13756009,
                    'pbt': 1001645469,
                    'tax': 483723858,
                    'net_profit': 517921611,
                },
                'REGULATORY': {
                    'cd_ratio': 91.49,
                    'core_capital': 6.87,
                    'supplementary_capital': 2.82,
                    'capital_fund': 9.69,
                    'npl_ratio': 2.75,
                    'base_rate': 12.63,
                    'spread': 4.31,
                    'total_employees': 1577,
                    'branches': 156,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 38609365782,
                    'interest_expense': 27806025079,
                    'net_interest_income': 10803340703,
                    'fee_income': 2437605068,
                    'fee_expense': 339520201,
                    'net_fee_income': 2098084867,
                    'net_int_fee_income': 12901425570,
                    'trading_income': 366413542,
                    'other_operating_income': 368585470,
                    'total_operating_income': 13636424583,
                },
                'EXPENSES': {
                    'impairment_charge': 6841410631,
                    'personnel_expenses': 3857072668,
                    'other_operating_expenses': 1112699626,
                    'depreciation': 851318123,
                    'operating_profit': 973923536,
                    'non_operating_income': 46751365,
                    'non_operating_expense': 21709731,
                    'pbt': 998965170,
                    'tax': 994356466,
                    'net_profit': 4608704,
                },
                'REGULATORY': {
                    'cd_ratio': 79.59,
                    'core_capital': 7.70,
                    'supplementary_capital': 3.72,
                    'capital_fund': 11.42,
                    'liquidity_crr': 4.01,
                    'npl_ratio': 5.96,
                    'base_rate': 8.89,
                    'spread': 3.95,
                    'total_employees': 3280,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 32357200352,
                    'interest_expense': 20735654382,
                    'net_interest_income': 11621545970,
                    'fee_income': 3033276978,
                    'fee_expense': 371656093,
                    'net_fee_income': 2661620885,
                    'net_int_fee_income': 14283166855,
                    'trading_income': 453177356,
                    'other_operating_income': 457678565,
                    'total_operating_income': 15194022777,
                },
                'EXPENSES': {
                    'impairment_charge': 3451421338,
                    'personnel_expenses': 4311039370,
                    'other_operating_expenses': 1051554716,
                    'depreciation': 792811818,
                    'operating_profit': 5587195535,
                    'non_operating_income': 73368067,
                    'non_operating_expense': 425943542,
                    'pbt': 5234620060,
                    'tax': 3414921412,
                    'net_profit': 1819698647,
                },
                'REGULATORY': {
                    'cd_ratio': 72.30,
                    'core_capital': 8.51,
                    'supplementary_capital': 3.80,
                    'capital_fund': 12.31,
                    'liquidity_crr': 5.06,
                    'npl_ratio': 6.95,
                    'base_rate': 6.44,
                    'spread': 3.59,
                }
            }
        }

        # Dividend Data (FY 072-073 to 081-082)
        dividend_data = {
            '072-073': {'bonus': 21.00, 'cash': 1.10, 'book_close': '2017-03-03'},
            '073-074': {'bonus': 12.75, 'cash': 0.00, 'book_close': '2019-04-19'},
            '074-075': {'bonus': 8.50, 'cash': 0.00, 'book_close': '2019-04-19'},
            '075-076': {'bonus': 10.00, 'cash': 0.52, 'book_close': '2019-09-15'},
            '076-077': {'bonus': 10.85, 'cash': 3.15, 'book_close': '2020-11-30'},
            '077-078': {'bonus': 6.00, 'cash': 2.67, 'book_close': '2021-10-25'},
            '078-079': {'bonus': 0.00, 'cash': 12.50, 'book_close': '2022-10-31'},
            '079-080': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '080-081': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '081-082': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
        }

        # Additional historical dividend records from user request
        historical_dividends = [
            {'fy': '2078/2079', 'bonus': 0.00, 'cash': 12.50, 'book_close': '2022-10-31'},
            {'fy': '2077/2078', 'bonus': 6.00, 'cash': 2.67, 'book_close': '2021-10-25'},
            {'fy': '2076/2077', 'bonus': 10.85, 'cash': 3.15, 'book_close': '2020-11-30'},
            {'fy': '2075/2076', 'bonus': 10.00, 'cash': 0.52, 'book_close': '2019-09-15'},
            {'fy': '2074/2075', 'bonus': 8.50, 'cash': 0.00, 'book_close': '2019-04-19'},
            {'fy': '2073/2074', 'bonus': 12.75, 'cash': 0.00, 'book_close': '2019-04-19'},
            {'fy': '2072/2073', 'bonus': 21.00, 'cash': 1.10, 'book_close': '2017-03-03'},
            {'fy': '2071/2072', 'bonus': 11.00, 'cash': 0.58, 'book_close': '2016-01-14'},
            {'fy': '2070/2071', 'bonus': 33.00, 'cash': 1.74, 'book_close': '2014-10-22'},
            {'fy': '2069/2070', 'bonus': 14.00, 'cash': 0.00, 'book_close': '2014-04-09'},
            {'fy': '2068/2069', 'bonus': 0.00, 'cash': 7.00, 'book_close': '2013-01-24'},
            {'fy': '2067/2068', 'bonus': 8.00, 'cash': 0.44, 'book_close': '2012-01-16'},
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
                ticker='KBL',
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
            f'KBL annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='KBL',
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
            f'KBL dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
