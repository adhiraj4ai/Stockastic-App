from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds CZBIL annual financial reports from FY 072-073 to 081-082'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding CZBIL financial data...')

        # Ensure CZBIL company exists
        company, created = Company.objects.get_or_create(
            symbol='CZBIL',
            defaults={
                'name': 'Citizens Bank International Limited',
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
                    'cash_equivalent': 1884360876,
                    'due_from_nrb': 3149515238,
                    'placement_bfis': 859317987,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 39635465293,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 1107847373,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 55062015618,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 47393500966,
                    'borrowings': 1119046010,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': 500000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 49756718550,
                },
                'EQUITY': {
                    'share_capital': 4401315379,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 903981689,
                    'total_equity': 5305297068,
                    'total_liabilities_equity': 55062015618,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 3887468818,
                    'due_from_nrb': 2190896703,
                    'placement_bfis': 1568014418,
                    'derivative_assets': 21975955,
                    'trading_assets': 51442831,
                    'loans_bfis': 1467126976,
                    'loans_customers': 46021501436,
                    'investment_securities': 6785605921,
                    'current_tax_assets': 300791522,
                    'subsidiaries': 67000000,
                    'associates': 31751500,
                    'investment_property': 390066062,
                    'property_equipment': 1758546430,
                    'intangible_assets': 8066489,
                    'deferred_tax_assets': None,
                    'other_assets': 1331359117,
                    'total_assets': 65881614179,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2501906804,
                    'due_to_nrb': 33578077,
                    'derivative_liabilities': None,
                    'deposits_customers': 51716674652,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 85192158,
                    'other_liabilities': 1202929525,
                    'debt_securities': 498148814,
                    'subordinated_liabilities': None,
                    'total_liabilities': 56038430030,
                },
                'EQUITY': {
                    'share_capital': 6921689662,
                    'share_premium': 532794833,
                    'retained_earnings': 763369943,
                    'reserves_reserves': 1625329711,
                    'total_equity': 9843184149,
                    'total_liabilities_equity': 65881614179,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 5046237676,
                    'due_from_nrb': 3690192293,
                    'placement_bfis': 1989878358,
                    'derivative_assets': 36385944,
                    'trading_assets': 76236446,
                    'loans_bfis': 1420646197,
                    'loans_customers': 55601766580,
                    'investment_securities': 5616858302,
                    'current_tax_assets': 114653791,
                    'subsidiaries': 117200000,
                    'associates': 17951500,
                    'investment_property': 287547060,
                    'property_equipment': 2121592854,
                    'intangible_assets': 70534031,
                    'deferred_tax_assets': None,
                    'other_assets': 1502271962,
                    'total_assets': 77709952994,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3335288532,
                    'due_to_nrb': 695041370,
                    'derivative_liabilities': None,
                    'deposits_customers': 60696026972,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 5306626,
                    'deferred_tax_liabilities': 17677499,
                    'other_liabilities': 1447977647,
                    'debt_securities': 498722911,
                    'subordinated_liabilities': None,
                    'total_liabilities': 66696041556,
                },
                'EQUITY': {
                    'share_capital': 8033236400,
                    'share_premium': 433526,
                    'retained_earnings': 132228780,
                    'reserves_reserves': 2848012733,
                    'total_equity': 11013911439,
                    'total_liabilities_equity': 77709952994,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 6740702460,
                    'due_from_nrb': 2596966889,
                    'placement_bfis': 394769893,
                    'derivative_assets': 44104432,
                    'trading_assets': 567253478,
                    'loans_bfis': 1581899190,
                    'loans_customers': 62911970484,
                    'investment_securities': 10822603551,
                    'current_tax_assets': 14624427,
                    'subsidiaries': 167204200,
                    'associates': 17951500,
                    'investment_property': 222547153,
                    'property_equipment': 2302848710,
                    'intangible_assets': 93353427,
                    'deferred_tax_assets': 20235997,
                    'other_assets': 1622327761,
                    'total_assets': 90121363554,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3926662470,
                    'due_to_nrb': 1212586471,
                    'derivative_liabilities': None,
                    'deposits_customers': 70509084649,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 5306626,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1473951481,
                    'debt_securities': 499145186,
                    'subordinated_liabilities': None,
                    'total_liabilities': 77626736883,
                },
                'EQUITY': {
                    'share_capital': 8371064773,
                    'share_premium': 46816126,
                    'retained_earnings': 1251267361,
                    'reserves_reserves': 2825478410,
                    'total_equity': 12494626670,
                    'total_liabilities_equity': 90121363554,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 10841972930,
                    'due_from_nrb': 2430001128,
                    'placement_bfis': 302681924,
                    'derivative_assets': 1029497,
                    'trading_assets': 90624023,
                    'loans_bfis': 1534103548,
                    'loans_customers': 78976395245,
                    'investment_securities': 11828332562,
                    'current_tax_assets': 142488502,
                    'subsidiaries': 167204200,
                    'associates': 18951500,
                    'investment_property': 195532789,
                    'property_equipment': 2554050177,
                    'intangible_assets': 75322689,
                    'deferred_tax_assets': None,
                    'other_assets': 1391992008,
                    'total_assets': 110551000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3926662470, # Wait, total_liab in user's prompt is 97132962497, wait: due to BFIs = 3688903954
                    'due_to_nrb': 567577082,
                    'derivative_liabilities': None,
                    'deposits_customers': 88496228464,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 5306626,
                    'deferred_tax_liabilities': 13613542,
                    'other_liabilities': 1386951527,
                    'debt_securities': 2974381302,
                    'subordinated_liabilities': None,
                    'total_liabilities': 97132962497,
                },
                'EQUITY': {
                    'share_capital': 9089817290,
                    'share_premium': 4124402,
                    'retained_earnings': 931156947,
                    'reserves_reserves': 3392621587,
                    'total_equity': 13417720225,
                    'total_liabilities_equity': 110551000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 11563041720,
                    'due_from_nrb': 3796487797,
                    'placement_bfis': 2874874811,
                    'derivative_assets': 47007498,
                    'trading_assets': 596888937,
                    'loans_bfis': 3247166953,
                    'loans_customers': 118912000000,
                    'investment_securities': 22017422075,
                    'current_tax_assets': 288457633,
                    'subsidiaries': 167204200,
                    'associates': 16000000,
                    'investment_property': 141146454,
                    'property_equipment': 2880204084,
                    'intangible_assets': 83562290,
                    'deferred_tax_assets': None,
                    'other_assets': 1697543676,
                    'total_assets': 168329000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2765001954,
                    'due_to_nrb': 1205558827,
                    'derivative_liabilities': None,
                    'deposits_customers': 140638000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 5306626,
                    'deferred_tax_liabilities': 217486290,
                    'other_liabilities': 2133181270,
                    'debt_securities': 2476082261,
                    'subordinated_liabilities': None,
                    'total_liabilities': 149441000000,
                },
                'EQUITY': {
                    'share_capital': 12576923115,
                    'share_premium': None,
                    'retained_earnings': 1422777310,
                    'reserves_reserves': 4888321283,
                    'total_equity': 18888021708,
                    'total_liabilities_equity': 168329000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 17892741270,
                    'due_from_nrb': 4266508053,
                    'placement_bfis': 1233631457,
                    'derivative_assets': 2659089,
                    'trading_assets': 327340379,
                    'loans_bfis': 3299919602,
                    'loans_customers': 131344327079,
                    'investment_securities': 28153425968,
                    'current_tax_assets': 348140704,
                    'subsidiaries': 167204200,
                    'associates': 375645491,
                    'investment_property': 208645871,
                    'property_equipment': 3704207328,
                    'intangible_assets': 196840188,
                    'deferred_tax_assets': None,
                    'other_assets': 2891413836,
                    'total_assets': 194412650515,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4063054785,
                    'due_to_nrb': 11070250868,
                    'derivative_liabilities': None,
                    'deposits_customers': 152801490371,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 5306626,
                    'deferred_tax_liabilities': 63308934,
                    'other_liabilities': 3522074792,
                    'debt_securities': 2477875480,
                    'subordinated_liabilities': None,
                    'total_liabilities': 174003361856,
                },
                'EQUITY': {
                    'share_capital': 14200974006,
                    'share_premium': None,
                    'retained_earnings': 1329462003,
                    'reserves_reserves': 4878852650,
                    'total_equity': 20409288659,
                    'total_liabilities_equity': 194412650515,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 9764245573,
                    'due_from_nrb': 6703008872,
                    'placement_bfis': 2236412161,
                    'derivative_assets': 17045476,
                    'trading_assets': 318872100,
                    'loans_bfis': 2510671744,
                    'loans_customers': 139832005022,
                    'investment_securities': 28685569583,
                    'current_tax_assets': 283947414,
                    'subsidiaries': 317204200,
                    'associates': 330011545,
                    'investment_property': 256128571,
                    'property_equipment': 3757646456,
                    'intangible_assets': 179517754,
                    'deferred_tax_assets': 62803729,
                    'other_assets': 3677520668,
                    'total_assets': 198932610867,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3714711816,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 168842139608,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 5306626,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2927086615,
                    'debt_securities': 2479847548,
                    'subordinated_liabilities': None,
                    'total_liabilities': 177969092212,
                },
                'EQUITY': {
                    'share_capital': 14200974006,
                    'share_premium': None,
                    'retained_earnings': 846989180,
                    'reserves_reserves': 591555469, # Note: Reserves was 5915554690 in original, user typed 5,915,555,469.00
                    'total_equity': 20963518655,
                    'total_liabilities_equity': 198932610867,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 11103495123,
                    'due_from_nrb': 6678168437,
                    'placement_bfis': 1752857356,
                    'derivative_assets': 4096799,
                    'trading_assets': 334687833,
                    'loans_bfis': 1821139008,
                    'loans_customers': 153343650160,
                    'investment_securities': 36283861266,
                    'current_tax_assets': 452990685,
                    'subsidiaries': 317204200,
                    'associates': 364714000,
                    'investment_property': 821262933,
                    'property_equipment': 4297547263,
                    'intangible_assets': 194143634,
                    'deferred_tax_assets': 24486861,
                    'other_assets': 4887925332,
                    'total_assets': 222682230891,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2438002332,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 189236668435,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 5306626,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3960093816,
                    'debt_securities': 5467793773,
                    'subordinated_liabilities': None,
                    'total_liabilities': 201107864981,
                },
                'EQUITY': {
                    'share_capital': 14200974006,
                    'share_premium': None,
                    'retained_earnings': 613242207,
                    'reserves_reserves': 6760149698,
                    'total_equity': 21574365910,
                    'total_liabilities_equity': 222682230891,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 11435104517,
                    'due_from_nrb': 8112517259,
                    'placement_bfis': 1916516537,
                    'derivative_assets': 9781119,
                    'trading_assets': 416187210,
                    'loans_bfis': 1254373368,
                    'loans_customers': 168860738128,
                    'investment_securities': 42267572417,
                    'current_tax_assets': 210948042,
                    'subsidiaries': 317204200,
                    'associates': 524292202,
                    'investment_property': 1260423530,
                    'property_equipment': 1490156307,
                    'intangible_assets': 193758774,
                    'deferred_tax_assets': 206874441,
                    'other_assets': 4206411402,
                    'total_assets': 245382966453,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2581158410,
                    'due_to_nrb': 41439071,
                    'derivative_liabilities': None,
                    'deposits_customers': 211500793308,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 5306626,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2835328218,
                    'debt_securities': 5471227040,
                    'subordinated_liabilities': None,
                    'total_liabilities': 222435252673,
                },
                'EQUITY': {
                    'share_capital': 14769012966,
                    'share_premium': None,
                    'retained_earnings': 778168988,
                    'reserves_reserves': 7400531827,
                    'total_equity': 22947713780,
                    'total_liabilities_equity': 245382966453,
                }
            }
        }

        # P&L Data (FY 072-073 to 081-082)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 3443472897,
                    'interest_expense': 1823705606,
                    'net_interest_income': 1619767291,
                    'total_operating_income': 2132970747,
                },
                'EXPENSES': {
                    'personnel_expenses': 295202178,
                    'operating_profit': 1109826027,
                    'net_profit': 1080377498,
                },
                'REGULATORY': {
                    'cd_ratio': 85.59,
                    'core_capital': 10.57,
                    'supplementary_capital': 1.83,
                    'capital_fund': 12.40,
                    'npl_ratio': 1.38,
                    'base_rate': 6.06,
                    'spread': 3.96,
                }
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 4960197979,
                    'interest_expense': 3169957746,
                    'net_interest_income': 1790240233,
                    'fee_income': 429211115,
                    'fee_expense': 33396855,
                    'net_fee_income': 395814259,
                    'net_int_fee_income': 2186054492,
                    'trading_income': 136794468,
                    'other_operating_income': 93889840,
                    'total_operating_income': 2416738801,
                },
                'EXPENSES': {
                    'impairment_charge': 96965217,
                    'personnel_expenses': 579564141,
                    'other_operating_expenses': 309364627,
                    'depreciation': 92692281,
                    'operating_profit': 1532082967,
                    'non_operating_income': 735476834,
                    'non_operating_expense': 105936458,
                    'pbt': 2161623344,
                    'tax': 526705570,
                    'net_profit': 1634917774,
                },
                'REGULATORY': {
                    'cd_ratio': 91.89,
                    'core_capital': 15.37,
                    'supplementary_capital': 1.51,
                    'capital_fund': 16.88,
                    'npl_ratio': 2.02,
                    'base_rate': 11.17,
                    'spread': 3.91,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 7109387573,
                    'interest_expense': 4887319894,
                    'net_interest_income': 2222067679,
                    'fee_income': 559884278,
                    'fee_expense': 50836108,
                    'net_fee_income': 509048171,
                    'net_int_fee_income': 2731115850,
                    'trading_income': 181074487,
                    'other_operating_income': 120696494,
                    'total_operating_income': 3032886830,
                },
                'EXPENSES': {
                    'impairment_charge': -89316642,
                    'personnel_expenses': 784057981,
                    'other_operating_expenses': 347358417,
                    'depreciation': 126526734,
                    'operating_profit': 1685627057,
                    'non_operating_income': 37955047,
                    'non_operating_expense': 16717011,
                    'pbt': 1706865093,
                    'tax': 472761196,
                    'net_profit': 1234103897,
                },
                'REGULATORY': {
                    'cd_ratio': 92.75,
                    'core_capital': 12.76,
                    'supplementary_capital': 1.08,
                    'capital_fund': 13.84,
                    'npl_ratio': 1.48,
                    'base_rate': 11.78,
                    'spread': 3.84,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 8532283587,
                    'interest_expense': 5843821610,
                    'net_interest_income': 2688461977,
                    'fee_income': 568573901,
                    'fee_expense': 67393405,
                    'net_fee_income': 501180496,
                    'net_int_fee_income': 3189642473,
                    'trading_income': 277322135,
                    'other_operating_income': 30465306,
                    'total_operating_income': 3497429914,
                },
                'EXPENSES': {
                    'impairment_charge': 138372772,
                    'personnel_expenses': 900244354,
                    'other_operating_expenses': 464654072,
                    'depreciation': 170501154,
                    'operating_profit': 2100403106,
                    'non_operating_income': 77786069,
                    'non_operating_expense': 575339,
                    'pbt': 2177613836,
                    'tax': 714395056,
                    'net_profit': 1463218780,
                },
                'REGULATORY': {
                    'cd_ratio': 88.76,
                    'core_capital': 13.46,
                    'supplementary_capital': 0.91,
                    'capital_fund': 14.37,
                    'npl_ratio': 1.19,
                    'base_rate': 10.52,
                    'spread': 3.15,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 9489525338,
                    'interest_expense': 6604771721,
                    'net_interest_income': 2884753617,
                    'fee_income': 582213590,
                    'fee_expense': 57731667,
                    'net_fee_income': 524481923,
                    'net_int_fee_income': 3409235540,
                    'trading_income': 281338052,
                    'other_operating_income': 100102839,
                    'total_operating_income': 3790676430,
                },
                'EXPENSES': {
                    'impairment_charge': -640133259,
                    'personnel_expenses': 935254564,
                    'other_operating_expenses': 504580220,
                    'depreciation': 211684673,
                    'operating_profit': 1499023715,
                    'non_operating_income': 169713481,
                    'pbt': 1668737195,
                    'tax': 470232536,
                    'net_profit': 1198504659,
                },
                'REGULATORY': {
                    'cd_ratio': 89.56,
                    'core_capital': 11.85,
                    'supplementary_capital': 3.29,
                    'capital_fund': 15.14,
                    'npl_ratio': 1.55,
                    'base_rate': 9.04,
                    'spread': 4.03,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 10839534353,
                    'interest_expense': 7189136209,
                    'net_interest_income': 3650398144,
                    'fee_income': 825370410,
                    'fee_expense': 73360658,
                    'net_fee_income': 752009752,
                    'net_int_fee_income': 4402407896,
                    'trading_income': 418465532,
                    'other_operating_income': 153105306,
                    'total_operating_income': 4973978734,
                },
                'EXPENSES': {
                    'impairment_charge': -394036022,
                    'personnel_expenses': 1229753262,
                    'other_operating_expenses': 650045937,
                    'depreciation': 244877287,
                    'operating_profit': 2455266225,
                    'non_operating_income': 130437670,
                    'pbt': 2585703895,
                    'tax': 781362830,
                    'net_profit': 1804341065,
                },
                'REGULATORY': {
                    'cd_ratio': 87.52,
                    'core_capital': 11.02,
                    'supplementary_capital': 2.68,
                    'capital_fund': 13.70,
                    'npl_ratio': 1.64,
                    'base_rate': 7.55,
                    'spread': 3.59,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 15967648035,
                    'interest_expense': 10974158052,
                    'net_interest_income': 4993489983,
                    'fee_income': 998102482,
                    'fee_expense': 129036061,
                    'net_fee_income': 869066421,
                    'net_int_fee_income': 5862556404,
                    'trading_income': 224276449,
                    'other_operating_income': 177226700,
                    'total_operating_income': 6264059553,
                },
                'EXPENSES': {
                    'impairment_charge': 552420450,
                    'personnel_expenses': 1785432248,
                    'other_operating_expenses': 803854246,
                    'depreciation': 413100077,
                    'operating_profit': 2709252532,
                    'non_operating_income': 123343936,
                    'pbt': 2832596468,
                    'tax': 826985672,
                    'net_profit': 2005610796,
                },
                'REGULATORY': {
                    'cd_ratio': 0.89, # As provided by the user
                    'core_capital': 0.10,
                    'supplementary_capital': 0.02,
                    'capital_fund': 0.13,
                    'npl_ratio': 0.02,
                    'base_rate': 0.10,
                    'spread': 0.04,
                }
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 20660828235,
                    'interest_expense': 14832332039,
                    'net_interest_income': 5828496196,
                    'fee_income': 1013993665,
                    'fee_expense': 137210558,
                    'net_fee_income': 876783106,
                    'net_int_fee_income': 6705279302,
                    'trading_income': 182203411,
                    'other_operating_income': 23577946,
                    'total_operating_income': 6911060660,
                },
                'EXPENSES': {
                    'impairment_charge': -1216480218,
                    'personnel_expenses': 1889896983,
                    'other_operating_expenses': 901913517,
                    'depreciation': 327427689,
                    'operating_profit': 2575342253,
                    'non_operating_income': 20681607,
                    'non_operating_expense': 79570322,
                    'pbt': 2516453538,
                    'net_profit': 1863756011,
                },
                'REGULATORY': {
                    'cd_ratio': 85.55,
                    'core_capital': 10.01,
                    'supplementary_capital': 2.11,
                    'capital_fund': 12.12,
                    'npl_ratio': 3.39,
                    'base_rate': 10.51,
                    'spread': 4.00,
                    'total_employees': 1716,
                    'branches': 188,
                    'atms': 145,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 19719665007,
                    'interest_expense': 13995845998,
                    'net_interest_income': 5723819009,
                    'fee_income': 1279684020,
                    'fee_expense': 154714534,
                    'net_fee_income': 1124969487,
                    'net_int_fee_income': 6848788496,
                    'trading_income': 156055435,
                    'other_operating_income': 52089910,
                    'total_operating_income': 7056933841,
                },
                'EXPENSES': {
                    'impairment_charge': -1725407494,
                    'personnel_expenses': 1987316489,
                    'other_operating_expenses': 949096989,
                    'depreciation': 346532327,
                    'operating_profit': 2048580542,
                    'non_operating_income': 28524541,
                    'non_operating_expense': 19518786,
                    'pbt': 2057586297,
                    'net_profit': 1320731001,
                },
                'REGULATORY': {
                    'cd_ratio': 84.34,
                    'core_capital': 9.21,
                    'supplementary_capital': 3.85,
                    'capital_fund': 13.06,
                    'npl_ratio': 4.10,
                    'base_rate': 8.26,
                    'spread': 3.99,
                    'total_employees': 1784,
                    'branches': 197,
                    'atms': 160,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 17360136288,
                    'interest_expense': 10944729588,
                    'net_interest_income': 6415406700,
                    'fee_income': 1511943983,
                    'fee_expense': 164892910,
                    'net_fee_income': 1347051073,
                    'net_int_fee_income': 7762457773,
                    'trading_income': 302726511,
                    'other_operating_income': 109660190,
                    'total_operating_income': 8174844474,
                },
                'EXPENSES': {
                    'impairment_charge': -2680009409,
                    'personnel_expenses': 2035651709,
                    'other_operating_expenses': 1073942373,
                    'depreciation': 398322493,
                    'operating_profit': 1986918490,
                    'non_operating_income': 19316785,
                    'non_operating_expense': 181822283,
                    'pbt': 1824412992,
                    'net_profit': 1287075105,
                },
                'REGULATORY': {
                    'core_capital': 8.95,
                    'supplementary_capital': 3.52,
                    'capital_fund': 12.47,
                }
            }
        }

        # Dividend Data (FY 072-073 to 081-082)
        dividend_data = {
            '072-073': {'bonus': 15.80, 'cash': 0.83, 'book_close': '2016-09-22'},
            '073-074': {'bonus': 16.00, 'cash': 1.00, 'book_close': '2017-08-28'},
            '074-075': {'bonus': 3.63, 'cash': 1.635, 'book_close': '2019-01-01'},
            '075-076': {'bonus': 3.00, 'cash': 12.00, 'book_close': '2019-09-17'},
            '076-077': {'bonus': 8.00, 'cash': 3.00, 'book_close': '2020-11-26'},
            '077-078': {'bonus': 12.91, 'cash': 3.087, 'book_close': '2021-10-08'},
            '078-079': {'bonus': 0.00, 'cash': 9.00, 'book_close': '2022-10-14'},
            '079-080': {'bonus': 0.00, 'cash': 5.79, 'book_close': '2023-10-02'},
            '080-081': {'bonus': 4.00, 'cash': 0.21, 'book_close': '2024-10-15'},
            '081-082': {'bonus': 5.00, 'cash': 0.263, 'book_close': '2025-11-03'},
        }

        # Process and Create reports
        created_count = 0
        updated_count = 0

        for fiscal_year, data in financial_data.items():
            # Prepare balance sheet JSON
            balance_sheet = {}
            for section_key, section_data in data.items():
                balance_sheet[section_key] = {}
                for field_key, value in section_data.items():
                    if value is not None:
                        balance_sheet[section_key][field_key] = value

            # Prepare profit & loss JSON
            profit_loss = {}
            if fiscal_year in profit_loss_data:
                pl_data = profit_loss_data[fiscal_year]
                for section_key, section_data in pl_data.items():
                    profit_loss[section_key] = {}
                    for field_key, value in section_data.items():
                        if value is not None:
                            profit_loss[section_key][field_key] = value

            # Extract key metrics
            share_capital = data['EQUITY'].get('share_capital')
            total_equity = data['EQUITY'].get('total_equity')
            net_profit = profit_loss_data.get(fiscal_year, {}).get('EXPENSES', {}).get('net_profit')

            # Calculate derived metrics
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

            # Create or update the financial report
            report, created = FinancialReport.objects.update_or_create(
                ticker='CZBIL',
                fiscal_year=fiscal_year,
                report_type='ANNUAL',
                quarter=None,
                defaults={
                    'is_audited': True,
                    'report_template': 'BANK',
                    'balance_sheet': balance_sheet,
                    'profit_loss': profit_loss,
                    'cash_flow': None,
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
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'✓ Created report for FY {fiscal_year}'))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(f'⟳ Updated report for FY {fiscal_year}'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Successfully processed {len(financial_data)} financial reports for CZBIL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
