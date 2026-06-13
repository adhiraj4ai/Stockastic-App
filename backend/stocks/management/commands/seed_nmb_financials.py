from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds NMB annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding NMB financial data...')

        # Ensure NMB company exists
        company, created = Company.objects.get_or_create(
            symbol='NMB',
            defaults={
                'name': 'NMB Bank Limited',
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
                    'cash_equivalent': 1491275494,
                    'due_from_nrb': 6395815135,
                    'placement_bfis': 2637105481,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 53749132753,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 1357283772,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 75682348874,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 64944730681,
                    'borrowings': 2148502579,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': 500000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 68748529738,
                },
                'EQUITY': {
                    'share_capital': 5518635934,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 1415183202,
                    'total_equity': 6933819136,
                    'total_liabilities_equity': 75682348874,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 5499968622,
                    'due_from_nrb': 9242454991,
                    'placement_bfis': 681934928,
                    'derivative_assets': 5425634220,
                    'trading_assets': 298280000,
                    'loans_bfis': 1869100231,
                    'loans_customers': 59886961418,
                    'investment_securities': 7480981172,
                    'current_tax_assets': 719526541,
                    'subsidiaries': 148552000,
                    'associates': None,
                    'investment_property': 77488827,
                    'property_equipment': 1436619106,
                    'intangible_assets': 15697146,
                    'deferred_tax_assets': None,
                    'other_assets': 291223308,
                    'total_assets': 93074422511,
                },
                'LIABILITIES': {
                    'due_to_bfis': 906395995,
                    'due_to_nrb': 1110558800,
                    'derivative_liabilities': 5393031265,
                    'deposits_customers': 72317666604,
                    'borrowings': 55374308,
                    'current_tax_liabilities': 588774303,
                    'provisions': 9804595,
                    'deferred_tax_liabilities': 69197225,
                    'other_liabilities': 1203837692,
                    'debt_securities': 517547945,
                    'subordinated_liabilities': None,
                    'total_liabilities': 82172161732,
                },
                'EQUITY': {
                    'share_capital': 6461774334,
                    'share_premium': 1424857947,
                    'retained_earnings': 1364948851,
                    'reserves_reserves': 1650679647,
                    'total_equity': 10902260779,
                    'total_liabilities_equity': 93074422511,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 5183938214,
                    'due_from_nrb': 6840510937,
                    'placement_bfis': 276407171,
                    'derivative_assets': 7506751485,
                    'trading_assets': 321720000,
                    'loans_bfis': 2497567769,
                    'loans_customers': 72711771766,
                    'investment_securities': 9448446725,
                    'current_tax_assets': 763884764,
                    'subsidiaries': 248552000,
                    'associates': None,
                    'investment_property': 59774627,
                    'property_equipment': 1559569574,
                    'intangible_assets': 22054209,
                    'deferred_tax_assets': 66869011,
                    'other_assets': 4883611861,
                    'total_assets': 112391000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1036268951,
                    'due_to_nrb': 660071641,
                    'derivative_liabilities': 7477483892,
                    'deposits_customers': 83970867219,
                    'borrowings': None,
                    'current_tax_liabilities': 824302920,
                    'provisions': 9078444,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1405999800,
                    'debt_securities': 517547945,
                    'subordinated_liabilities': None,
                    'total_liabilities': 95901620812,
                },
                'EQUITY': {
                    'share_capital': 7603290634,
                    'share_premium': 4061366586,
                    'retained_earnings': 2339181597,
                    'reserves_reserves': 2485970484,
                    'total_equity': 16489809301,
                    'total_liabilities_equity': 112391000000,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 8096354503,
                    'due_from_nrb': 10829181584,
                    'placement_bfis': 2172967239,
                    'derivative_assets': 8595482282,
                    'trading_assets': 340390000,
                    'loans_bfis': 3317961987,
                    'loans_customers': 88485031394,
                    'investment_securities': 10316351016,
                    'current_tax_assets': None,
                    'subsidiaries': 248552000,
                    'associates': None,
                    'investment_property': 102915862,
                    'property_equipment': 1577898704,
                    'intangible_assets': 115408800,
                    'deferred_tax_assets': 70040593,
                    'other_assets': 1201873611,
                    'total_assets': 135470000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1875151251,
                    'due_to_nrb': 3203523072,
                    'derivative_liabilities': 8458374429,
                    'deposits_customers': 96641515712,
                    'borrowings': 3468060000,
                    'current_tax_liabilities': 35578570,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2145955868,
                    'debt_securities': 2239236412,
                    'subordinated_liabilities': None,
                    'total_liabilities': 118067000000,
                },
                'EQUITY': {
                    'share_capital': 9618162652,
                    'share_premium': 2512798517,
                    'retained_earnings': 1780326613,
                    'reserves_reserves': 3491726477,
                    'total_equity': 17403014259,
                    'total_liabilities_equity': 135470000000,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 11098349234,
                    'due_from_nrb': 15249998507,
                    'placement_bfis': 3304233792,
                    'derivative_assets': 10066295972,
                    'trading_assets': 266890000,
                    'loans_bfis': 4665864579,
                    'loans_customers': 115668000000,
                    'investment_securities': 14998756047,
                    'current_tax_assets': 61460881,
                    'subsidiaries': 372487600,
                    'associates': None,
                    'investment_property': 79648242,
                    'property_equipment': 1755794235,
                    'intangible_assets': 125848936,
                    'deferred_tax_assets': 264421080,
                    'other_assets': 1473393132,
                    'total_assets': 179452000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3150014840,
                    'due_to_nrb': 4832501544,
                    'derivative_liabilities': 10008212670,
                    'deposits_customers': 131660000000,
                    'borrowings': 3416310000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3169287821,
                    'debt_securities': 2279834432,
                    'subordinated_liabilities': None,
                    'total_liabilities': 158517000000,
                },
                'EQUITY': {
                    'share_capital': 13950987467,
                    'share_premium': 120167470,
                    'retained_earnings': 1737219751,
                    'reserves_reserves': 5127010555,
                    'total_equity': 20935385243,
                    'total_liabilities_equity': 179452000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 13887370526,
                    'due_from_nrb': 19218505528,
                    'placement_bfis': 2717148715,
                    'derivative_assets': 17161392134,
                    'trading_assets': 2660000,
                    'loans_bfis': 5194470677,
                    'loans_customers': 151014000000,
                    'investment_securities': 17453562933,
                    'current_tax_assets': 92745534,
                    'subsidiaries': 372487600,
                    'associates': None,
                    'investment_property': 97942260,
                    'property_equipment': 1741914965,
                    'intangible_assets': 112540746,
                    'deferred_tax_assets': 249009565,
                    'other_assets': 2230983328,
                    'total_assets': 231547000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1964515728,
                    'due_to_nrb': 7597982045,
                    'derivative_liabilities': 17127036376,
                    'deposits_customers': 164489000000,
                    'borrowings': 7443810000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3686459641,
                    'debt_securities': 5293994350,
                    'subordinated_liabilities': None,
                    'total_liabilities': 207603000000,
                },
                'EQUITY': {
                    'share_capital': 16325960853,
                    'share_premium': None,
                    'retained_earnings': 2515343348,
                    'reserves_reserves': 5102470254,
                    'total_equity': 23943774455,
                    'total_liabilities_equity': 231547000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 12787637052,
                    'due_from_nrb': 13747313630,
                    'placement_bfis': 3782288743,
                    'derivative_assets': 5293773328,
                    'trading_assets': None,
                    'loans_bfis': 5920094816,
                    'loans_customers': 174948356284,
                    'investment_securities': 31724846753,
                    'current_tax_assets': 55328905,
                    'subsidiaries': 372487600,
                    'associates': None,
                    'investment_property': 295161520,
                    'property_equipment': 1764130341,
                    'intangible_assets': 226513150,
                    'deferred_tax_assets': 338964764,
                    'other_assets': 3893713394,
                    'total_assets': 255150610280,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2082436338,
                    'due_to_nrb': 8996366529,
                    'derivative_liabilities': 5351098092,
                    'deposits_customers': 184817106463,
                    'borrowings': 12997400000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 5907387378,
                    'debt_securities': 8127853522,
                    'subordinated_liabilities': None,
                    'total_liabilities': 228279648322,
                },
                'EQUITY': {
                    'share_capital': 18366705959,
                    'share_premium': None,
                    'retained_earnings': 1550781367,
                    'reserves_reserves': 6953474633,
                    'total_equity': 26870961958,
                    'total_liabilities_equity': 255150610280,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 23958279935,
                    'due_from_nrb': 15059500883,
                    'placement_bfis': 755846186,
                    'derivative_assets': 10850079131,
                    'trading_assets': 24750000,
                    'loans_bfis': 7116529163,
                    'loans_customers': 189035400388,
                    'investment_securities': 32374914828,
                    'current_tax_assets': 44947624,
                    'subsidiaries': 772487600,
                    'associates': None,
                    'investment_property': 697707520,
                    'property_equipment': 1752799263,
                    'intangible_assets': 178689829,
                    'deferred_tax_assets': 448411030,
                    'other_assets': 4706797314,
                    'total_assets': 287777140694,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2737257510,
                    'due_to_nrb': 3285987203,
                    'derivative_liabilities': 11060344567,
                    'deposits_customers': 210304687147,
                    'borrowings': 14814903379,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 5227597491,
                    'debt_securities': 11911942000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 259342719296,
                },
                'EQUITY': {
                    'share_capital': 18366705959,
                    'share_premium': None,
                    'retained_earnings': 1140830240,
                    'reserves_reserves': 8926885198,
                    'total_equity': 28434421397,
                    'total_liabilities_equity': 287777140694,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 22570602707,
                    'due_from_nrb': 14710491269,
                    'placement_bfis': 3035765321,
                    'derivative_assets': 7583922347,
                    'trading_assets': None,
                    'loans_bfis': 8130436626,
                    'loans_customers': 194304185821,
                    'investment_securities': 33772796064,
                    'current_tax_assets': 145037389,
                    'subsidiaries': 772487600,
                    'associates': None,
                    'investment_property': 851436700,
                    'property_equipment': 3758590533,
                    'intangible_assets': 148628163,
                    'deferred_tax_assets': 424642054,
                    'other_assets': 4659139126,
                    'total_assets': 294868161721,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3163179932,
                    'due_to_nrb': 2948951134,
                    'derivative_liabilities': 7710799737,
                    'deposits_customers': 223942591903,
                    'borrowings': 11552656301,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 4196471161,
                    'debt_securities': 12382000301,
                    'subordinated_liabilities': None,
                    'total_liabilities': 265896650469,
                },
                'EQUITY': {
                    'share_capital': 18366705959,
                    'share_premium': None,
                    'retained_earnings': -93840782,
                    'reserves_reserves': 10698646074,
                    'total_equity': 28971511252,
                    'total_liabilities_equity': 294868161721,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 33385654314,
                    'due_from_nrb': 16489122616,
                    'placement_bfis': 10264420143,
                    'derivative_assets': 8681415598,
                    'trading_assets': None,
                    'loans_bfis': 10497119302,
                    'loans_customers': 228456303846,
                    'investment_securities': 32508745183,
                    'current_tax_assets': 166787121,
                    'subsidiaries': 772487600,
                    'associates': None,
                    'investment_property': 1784192730,
                    'property_equipment': 3800677507,
                    'intangible_assets': 127174017,
                    'deferred_tax_assets': 316475091,
                    'other_assets': 4341932137,
                    'total_assets': 351592507206,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6029457168,
                    'due_to_nrb': None,
                    'derivative_liabilities': 8695559581,
                    'deposits_customers': 280926467853,
                    'borrowings': 3987500055,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 7394345466,
                    'debt_securities': 12384568926,
                    'subordinated_liabilities': None,
                    'total_liabilities': 319417599049,
                },
                'EQUITY': {
                    'share_capital': 18366705959,
                    'share_premium': None,
                    'retained_earnings': 1901381344,
                    'reserves_reserves': 11906520854,
                    'total_equity': 32174608156,
                    'total_liabilities_equity': 351592507206,
                }
            }
        }

        # Profit & Loss Data (FY 072-073 to 081-082)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 4143146162,
                    'interest_expense': 2055161286,
                    'net_interest_income': 2087984876,
                    'total_operating_income': 2736126682,
                },
                'EXPENSES': {
                    'personnel_expenses': 509111123,
                    'operating_profit': 1146379205,
                    'net_profit': 1167124147,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 6109326827,
                    'interest_expense': 3505347281,
                    'net_interest_income': 2603979546,
                    'fee_income': 635069204,
                    'fee_expense': 51082047,
                    'net_fee_income': 583987157,
                    'net_int_fee_income': 3187966703,
                    'trading_income': 154789626,
                    'other_operating_income': 121978264,
                    'total_operating_income': 3464734593,
                },
                'EXPENSES': {
                    'impairment_charge': 13569888,
                    'personnel_expenses': 826873970,
                    'other_operating_expenses': 492213506,
                    'depreciation': 115783837,
                    'operating_profit': 2016293392,
                    'non_operating_income': 136349614,
                    'non_operating_expense': 48225932,
                    'pbt': 2104417074,
                    'tax': 615799984,
                    'net_profit': 1488617090,
                },
                'REGULATORY': {
                    'cd_ratio': 85.50,
                    'core_capital': 12.39,
                    'supplementary_capital': 1.22,
                    'capital_fund': 13.61,
                    'liquidity_crr': 7.72,
                    'npl_ratio': 1.68,
                    'base_rate': 10.12,
                    'spread': 3.89,
                    'total_employees': 918,
                    'branches': 80,
                    'atms': 66,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 8728699831,
                    'interest_expense': 5824685753,
                    'net_interest_income': 2904014078,
                    'fee_income': 794250068,
                    'fee_expense': 62708027,
                    'net_fee_income': 731542041,
                    'net_int_fee_income': 3635556119,
                    'trading_income': 299605983,
                    'other_operating_income': 164962228,
                    'total_operating_income': 4100124330,
                },
                'EXPENSES': {
                    'impairment_charge': -219650789,
                    'personnel_expenses': 1021570435,
                    'other_operating_expenses': 589394199,
                    'depreciation': 147695238,
                    'operating_profit': 2561115247,
                    'non_operating_income': 43140193,
                    'non_operating_expense': 37935379,
                    'pbt': 2566320061,
                    'tax': 712527308,
                    'net_profit': 1853792753,
                },
                'REGULATORY': {
                    'cd_ratio': 90.46,
                    'core_capital': 14.78,
                    'supplementary_capital': 0.97,
                    'capital_fund': 15.75,
                    'liquidity_crr': 6.68,
                    'npl_ratio': 0.88,
                    'base_rate': 10.70,
                    'spread': 3.45,
                    'total_employees': 1080,
                    'branches': 110,
                    'atms': 96,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 11082059031,
                    'interest_expense': 6838038085,
                    'net_interest_income': 4244020946,
                    'fee_income': 1003530866,
                    'fee_expense': 93955270,
                    'net_fee_income': 909575596,
                    'net_int_fee_income': 5153596542,
                    'trading_income': 352049490,
                    'other_operating_income': 210373919,
                    'total_operating_income': 5716019951,
                },
                'EXPENSES': {
                    'impairment_charge': 166272634,
                    'personnel_expenses': 1415793493,
                    'other_operating_expenses': 708661406,
                    'depreciation': 176793355,
                    'operating_profit': 3248499062,
                    'non_operating_income': 17090672,
                    'non_operating_expense': 17585901,
                    'pbt': 3248003833,
                    'tax': 990727807,
                    'net_profit': 2257276026,
                },
                'REGULATORY': {
                    'cd_ratio': 94.61,
                    'core_capital': 13.11,
                    'supplementary_capital': 2.35,
                    'capital_fund': 15.45,
                    'liquidity_crr': 4.19,
                    'npl_ratio': 0.82,
                    'base_rate': 9.86,
                    'spread': 3.54,
                    'total_employees': 1120,
                    'branches': 110,
                    'atms': 103,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 14442972567,
                    'interest_expense': 8946752652,
                    'net_interest_income': 5496219915,
                    'fee_income': 914369723,
                    'fee_expense': 107917283,
                    'net_fee_income': 806452440,
                    'net_int_fee_income': 6302672355,
                    'trading_income': 384157101,
                    'other_operating_income': 215364793,
                    'total_operating_income': 6902194249,
                },
                'EXPENSES': {
                    'impairment_charge': 1627165235,
                    'personnel_expenses': 1647497921,
                    'other_operating_expenses': 935573915,
                    'depreciation': 241683371,
                    'operating_profit': 2450273807,
                    'non_operating_income': 18512709,
                    'non_operating_expense': 33981887,
                    'pbt': 2434804629,
                    'tax': 722028108,
                    'net_profit': 1712776521,
                },
                'REGULATORY': {
                    'cd_ratio': 92.31,
                    'core_capital': 13.00,
                    'supplementary_capital': 2.08,
                    'capital_fund': 15.08,
                    'liquidity_crr': 5.93,
                    'npl_ratio': 2.68,
                    'cost_of_funds': 6.99,
                    'base_rate': 8.95,
                    'spread': 3.68,
                    'total_employees': 1654,
                    'branches': 160,
                    'atms': 133,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 13983693533,
                    'interest_expense': 8323034232,
                    'net_interest_income': 5660659301,
                    'fee_income': 1177641945,
                    'fee_expense': 138024766,
                    'net_fee_income': 1039617179,
                    'net_int_fee_income': 6700276480,
                    'trading_income': 364108314,
                    'other_operating_income': 351973665,
                    'total_operating_income': 7416358459,
                },
                'EXPENSES': {
                    'impairment_charge': 382410393,
                    'personnel_expenses': 2089704278,
                    'other_operating_expenses': 853748763,
                    'depreciation': 269478145,
                    'operating_profit': 3821016879,
                    'non_operating_income': 39071786,
                    'non_operating_expense': 15212626,
                    'pbt': 3844876039,
                    'tax': 1133802331,
                    'net_profit': 2711073708,
                },
                'REGULATORY': {
                    'cd_ratio': 96.69,
                    'core_capital': 11.42,
                    'supplementary_capital': 3.66,
                    'capital_fund': 15.08,
                    'liquidity_crr': 5.66,
                    'npl_ratio': 2.27,
                    'cost_of_funds': 5.79,
                    'base_rate': 7.33,
                    'spread': 2.92,
                    'total_employees': 1744,
                    'branches': 181,
                    'atms': 137,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 19168862594,
                    'interest_expense': 12781322752,
                    'net_interest_income': 6387539842,
                    'fee_income': 1689472559,
                    'fee_expense': 216241035,
                    'net_fee_income': 1473231524,
                    'net_int_fee_income': 7860771366,
                    'trading_income': 272406509,
                    'other_operating_income': 406766685,
                    'total_operating_income': 8539944560,
                },
                'EXPENSES': {
                    'impairment_charge': -37225724,
                    'personnel_expenses': 2539345989,
                    'other_operating_expenses': 1087916122,
                    'depreciation': 290521503,
                    'operating_profit': 4659386670,
                    'non_operating_income': 2656853,
                    'non_operating_expense': 46755749,
                    'pbt': 4615287774,
                    'tax': 1324193604,
                    'net_profit': 3291094170,
                },
                'REGULATORY': {}
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 26622460214,
                    'interest_expense': 1828000292, # Wait, table value is: 18,280,000,292.00. Oh, 18280000292.
                    'net_interest_income': 8342459922,
                    'fee_income': 1833472617,
                    'fee_expense': 286611105,
                    'net_fee_income': 1546861512,
                    'net_int_fee_income': 9889321434,
                    'trading_income': 236285430,
                    'other_operating_income': 204146509,
                    'total_operating_income': 10329753373,
                },
                'EXPENSES': {
                    'impairment_charge': 1453820570,
                    'personnel_expenses': 2689175176,
                    'other_operating_expenses': 1192033693,
                    'depreciation': 319402402,
                    'operating_profit': 4675321533,
                    'non_operating_income': 9985780,
                    'non_operating_expense': 76148097,
                    'pbt': 4609159216,
                    'tax': None,
                    'net_profit': 3222547292,
                },
                'REGULATORY': {
                    'cd_ratio': 82.36,
                    'core_capital': 10.15,
                    'supplementary_capital': 3.18,
                    'capital_fund': 13.33,
                    'liquidity_crr': 5.63,
                    'npl_ratio': 2.75,
                    'base_rate': 10.37,
                    'spread': 3.99,
                    'total_employees': 1980,
                    'branches': 201,
                    'atms': 141,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 25682542888,
                    'interest_expense': 18465800355,
                    'net_interest_income': 7216742533,
                    'fee_income': 1987207424,
                    'fee_expense': 311233067,
                    'net_fee_income': 1675974357,
                    'net_int_fee_income': 8892716590,
                    'trading_income': 242411149,
                    'other_operating_income': 264011431,
                    'total_operating_income': 9399139470,
                },
                'EXPENSES': {
                    'impairment_charge': 2037966876,
                    'personnel_expenses': 2634448065,
                    'other_operating_expenses': 1015554807,
                    'depreciation': 458071858,
                    'operating_profit': 3253097865,
                    'non_operating_income': 3442011,
                    'non_operating_expense': 20990648,
                    'pbt': 3235549228,
                    'tax': None,
                    'net_profit': 2244395304,
                },
                'REGULATORY': {
                    'cd_ratio': 82.51,
                    'core_capital': 9.72,
                    'supplementary_capital': 3.12,
                    'capital_fund': 12.84,
                    'liquidity_crr': 4.47,
                    'npl_ratio': 3.40,
                    'base_rate': 8.42,
                    'spread': 3.99,
                    'total_employees': 1952,
                    'branches': 201,
                    'atms': 187,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 22267952343,
                    'interest_expense': 14247058349,
                    'net_interest_income': 8020893994,
                    'fee_income': 2426661053,
                    'fee_expense': 242074632,
                    'net_fee_income': 2184586421,
                    'net_int_fee_income': 10205480415,
                    'trading_income': 360570942,
                    'other_operating_income': 318466228,
                    'total_operating_income': 10884517585,
                },
                'EXPENSES': {
                    'impairment_charge': 1638170232,
                    'personnel_expenses': 3012762127,
                    'other_operating_expenses': 1109003642,
                    'depreciation': 384593178,
                    'operating_profit': 4739988406,
                    'non_operating_income': 3950977,
                    'non_operating_expense': 658746389,
                    'pbt': 4085192995,
                    'tax': None,
                    'net_profit': 2854638357,
                },
                'REGULATORY': {
                    'core_capital': 9.05,
                    'supplementary_capital': 2.86,
                    'capital_fund': 11.92,
                    'liquidity_crr': 4.45,
                    'npl_ratio': 4.11,
                    'base_rate': 6.22,
                    'spread': 3.82,
                    'branches': 202,
                    'atms': 187,
                }
            }
        }

        # Modify FY 079-080 interest_expense to correct value
        profit_loss_data['079-080']['INCOME']['interest_expense'] = 18280000292

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 19.00, 'cash': 1.00, 'book_close': '2016-12-22'},
            '073-074': {'bonus': 15.00, 'cash': 0.7895, 'book_close': '2018-08-02'},
            '074-075': {'bonus': 10.00, 'cash': 20.00, 'book_close': '2018-12-25'},
            '075-076': {'bonus': 21.00, 'cash': 14.00, 'book_close': '2019-12-20'},
            '076-077': {'bonus': 13.00, 'cash': 3.20, 'book_close': '2020-12-31'},
            '077-078': {'bonus': 12.50, 'cash': 3.30, 'book_close': '2021-12-22'},
            '078-079': {'bonus': 0.00, 'cash': 8.25, 'book_close': '2022-12-26'},
            '079-080': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '080-081': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '081-082': {'bonus': 5.00, 'cash': 5.00, 'book_close': '2025-12-24'},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2081/2082', 'bonus': 5.00, 'cash': 5.00, 'book_close': '2025-12-24'},
            {'fy': '2078/2079', 'bonus': 0.00, 'cash': 8.25, 'book_close': '2022-12-26'},
            {'fy': '2077/2078', 'bonus': 12.50, 'cash': 3.30, 'book_close': '2021-12-22'},
            {'fy': '2076/2077', 'bonus': 13.00, 'cash': 3.20, 'book_close': '2020-12-31'},
            {'fy': '2075/2076', 'bonus': 21.00, 'cash': 14.00, 'book_close': '2019-12-20'},
            {'fy': '2074/2075', 'bonus': 10.00, 'cash': 20.00, 'book_close': '2018-12-25'},
            {'fy': '2073/2074', 'bonus': 15.00, 'cash': 0.7895, 'book_close': '2018-08-02'},
            {'fy': '2072/2073', 'bonus': 19.00, 'cash': 1.00, 'book_close': '2016-12-22'},
            {'fy': '2071/2072', 'bonus': 8.00, 'cash': 0.42, 'book_close': '2016-01-26'},
            {'fy': '2070/2071', 'bonus': 20.00, 'cash': 1.05, 'book_close': '2014-11-13'},
            {'fy': '2069/2070', 'bonus': 0.00, 'cash': 10.00, 'book_close': '2013-12-01'},
            {'fy': '2067/2068', 'bonus': 0.00, 'cash': 9.00, 'book_close': '2011-12-04'},
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
                ticker='NMB',
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
            f'NMB annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='NMB',
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
            f'NMB dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
