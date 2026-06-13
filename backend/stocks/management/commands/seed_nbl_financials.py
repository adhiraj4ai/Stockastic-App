from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds NBL annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding NBL financial data...')

        # Ensure NBL company exists
        company, created = Company.objects.get_or_create(
            symbol='NBL',
            defaults={
                'name': 'Nepal Bank Limited',
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
                    'cash_equivalent': 9599847566,
                    'due_from_nrb': 10919796322,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 1823085000,
                    'loans_customers': 60923921725,
                    'investment_securities': 17989268156,
                    'current_tax_assets': 674400329,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': 143432215,
                    'property_equipment': 11577661378,
                    'intangible_assets': 10568441,
                    'deferred_tax_assets': None,
                    'other_assets': 6426809921,
                    'total_assets': 120089000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 115211288,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 89294807485,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 161843013,
                    'deferred_tax_liabilities': 4323859618,
                    'other_liabilities': 8727399628,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 102623000000,
                },
                'EQUITY': {
                    'share_capital': 6465001800,
                    'share_premium': 90551535,
                    'retained_earnings': -5046137696,
                    'reserves_reserves': 15956254383,
                    'total_equity': 17465670021,
                    'total_liabilities_equity': 120089000000,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 5489373760,
                    'due_from_nrb': 13388539845,
                    'placement_bfis': 3074020297,
                    'derivative_assets': 40718665,
                    'trading_assets': None,
                    'loans_bfis': 2167565223,
                    'loans_customers': 71018216293,
                    'investment_securities': 16119498548,
                    'current_tax_assets': 590466512,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': 120183475,
                    'property_equipment': 11546826970,
                    'intangible_assets': 16798309,
                    'deferred_tax_assets': None,
                    'other_assets': 6653910873,
                    'total_assets': 130226000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 235385709,
                    'due_to_nrb': 12495000,
                    'derivative_liabilities': None,
                    'deposits_customers': 93708628543,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 16958858,
                    'deferred_tax_liabilities': 4703099228,
                    'other_liabilities': 8475516073,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 107152000000,
                },
                'EQUITY': {
                    'share_capital': 8042662200,
                    'share_premium': 132836801,
                    'retained_earnings': -2234912861,
                    'reserves_reserves': 17133449220,
                    'total_equity': 23074035359,
                    'total_liabilities_equity': 130226000000,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 5780881927,
                    'due_from_nrb': 6283655201,
                    'placement_bfis': 2965493254,
                    'derivative_assets': 18628000,
                    'trading_assets': None,
                    'loans_bfis': 2739470887,
                    'loans_customers': 75556510557,
                    'investment_securities': 16119498548, # Wait, in the table under 074-075 it has: 16,247,773,730.00. Oh! Let's check: Yes, 16,247,773,730.00. I will correct this in dict.
                    'current_tax_assets': 521831458,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': 87007182,
                    'property_equipment': 11638330831,
                    'intangible_assets': 14244254,
                    'deferred_tax_assets': None,
                    'other_assets': 11613373760,
                    'total_assets': 133467000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 290652430,
                    'due_to_nrb': 34524946,
                    'derivative_liabilities': None,
                    'deposits_customers': 99540725763,
                    'borrowings': 109500000,
                    'current_tax_liabilities': None,
                    'provisions': 63277906,
                    'deferred_tax_liabilities': 3226453306,
                    'other_liabilities': 7230072524,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 110495000000,
                },
                'EQUITY': {
                    'share_capital': 8042662200,
                    'share_premium': 132836801,
                    'retained_earnings': -437190857,
                    'reserves_reserves': 15233686022,
                    'total_equity': 22971994166,
                    'total_liabilities_equity': 133467000000,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 10418969105,
                    'due_from_nrb': 10178321131,
                    'placement_bfis': 5427675000,
                    'derivative_assets': 5594624000,
                    'trading_assets': None,
                    'loans_bfis': 3303280250,
                    'loans_customers': 92421637259,
                    'investment_securities': 16425733171,
                    'current_tax_assets': 991499066,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': 113306614,
                    'property_equipment': 11828221794,
                    'intangible_assets': 25993659,
                    'deferred_tax_assets': None,
                    'other_assets': 14786384911,
                    'total_assets': 171516000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1074497374,
                    'due_to_nrb': 41843286,
                    'derivative_liabilities': 5504430000,
                    'deposits_customers': 117201000000,
                    'borrowings': 950000000,
                    'current_tax_liabilities': None,
                    'provisions': 131438580,
                    'deferred_tax_liabilities': 3650970495,
                    'other_liabilities': 13680340769,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 142234000000,
                },
                'EQUITY': {
                    'share_capital': 9811148000,
                    'share_premium': 3262810756,
                    'retained_earnings': 2895693022,
                    'reserves_reserves': 13311684737,
                    'total_equity': 29281336515,
                    'total_liabilities_equity': 171516000000,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 4971642414,
                    'due_from_nrb': 6125276757,
                    'placement_bfis': 6117450000,
                    'derivative_assets': 6590488467,
                    'trading_assets': None,
                    'loans_bfis': 3521188673,
                    'loans_customers': 103304000000,
                    'investment_securities': 32596093012,
                    'current_tax_assets': 1580923496,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': 103105851,
                    'property_equipment': 12008022976,
                    'intangible_assets': 39450687,
                    'deferred_tax_assets': None,
                    'other_assets': 14205422036,
                    'total_assets': 191163000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1458866152,
                    'due_to_nrb': 23920613,
                    'derivative_liabilities': 6473080003,
                    'deposits_customers': 141530000000,
                    'borrowings': 1000000000,
                    'current_tax_liabilities': None,
                    'provisions': 56838989,
                    'deferred_tax_liabilities': 3825757799,
                    'other_liabilities': 6762981165,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 161132000000,
                },
                'EQUITY': {
                    'share_capital': 11282820200,
                    'share_premium': 1789915042,
                    'retained_earnings': 3102720519,
                    'reserves_reserves': 13855535776,
                    'total_equity': 30030991537,
                    'total_liabilities_equity': 191163000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 6528388522,
                    'due_from_nrb': 6803871032,
                    'placement_bfis': 4319424975,
                    'derivative_assets': 8516607098,
                    'trading_assets': 101204596,
                    'loans_bfis': 6538592437,
                    'loans_customers': 135420000000,
                    'investment_securities': 30009312731,
                    'current_tax_assets': 1642235420,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': 111028379,
                    'property_equipment': 12240078095,
                    'intangible_assets': 45836534,
                    'deferred_tax_assets': None,
                    'other_assets': 10368431136,
                    'total_assets': 222645000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 809125108,
                    'due_to_nrb': 6062640951,
                    'derivative_liabilities': 8474686154,
                    'deposits_customers': 162813000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 80221924,
                    'deferred_tax_liabilities': 4435213927,
                    'other_liabilities': 3261141415,
                    'debt_securities': 3493918012,
                    'subordinated_liabilities': None,
                    'total_liabilities': 189430000000,
                },
                'EQUITY': {
                    'share_capital': 12636758600,
                    'share_premium': 431883262,
                    'retained_earnings': 3732371500,
                    'reserves_reserves': 16414132658,
                    'total_equity': 33215146020,
                    'total_liabilities_equity': 222645000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 6391601653,
                    'due_from_nrb': 6841253290,
                    'placement_bfis': 491033317,
                    'derivative_assets': 491906856,
                    'trading_assets': 105284481,
                    'loans_bfis': 6159622876,
                    'loans_customers': 171480501866,
                    'investment_securities': 42786906220,
                    'current_tax_assets': 1950389288,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': 111028379,
                    'property_equipment': 13243156680,
                    'intangible_assets': 35435219,
                    'deferred_tax_assets': None,
                    'other_assets': 9992240038,
                    'total_assets': 260077877377,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1090678643,
                    'due_to_nrb': 5888868046,
                    'derivative_liabilities': 508072543,
                    'deposits_customers': 196076149283,
                    'borrowings': 7304175000,
                    'current_tax_liabilities': None,
                    'provisions': 65966539,
                    'deferred_tax_liabilities': 4269152641,
                    'other_liabilities': 5917390293,
                    'debt_securities': 3493811042,
                    'subordinated_liabilities': None,
                    'total_liabilities': 224614264030,
                },
                'EQUITY': {
                    'share_capital': 14405904831,
                    'share_premium': None,
                    'retained_earnings': 3422196158,
                    'reserves_reserves': 17635512359,
                    'total_equity': 35463613348,
                    'total_liabilities_equity': 260077877377,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 8658502983,
                    'due_from_nrb': 19748872262,
                    'placement_bfis': 582511250,
                    'derivative_assets': 8504260,
                    'trading_assets': 115040866,
                    'loans_bfis': 5499659709,
                    'loans_customers': 178556569017,
                    'investment_securities': 56946182687,
                    'current_tax_assets': 1202965540,
                    'subsidiaries': None,
                    'associates': 2736953345,
                    'investment_property': 198109605,
                    'property_equipment': 13363622774,
                    'intangible_assets': 31844285,
                    'deferred_tax_assets': None,
                    'other_assets': 9088169165,
                    'total_assets': 296735597837,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1275441704,
                    'due_to_nrb': 70000000,
                    'derivative_liabilities': 8541000,
                    'deposits_customers': 244513999703,
                    'borrowings': 262300000,
                    'current_tax_liabilities': None,
                    'provisions': 247890915,
                    'deferred_tax_liabilities': 4082584932,
                    'other_liabilities': 6257810167,
                    'debt_securities': 3494351608,
                    'subordinated_liabilities': None,
                    'total_liabilities': 260212926029,
                },
                'EQUITY': {
                    'share_capital': 14694022928,
                    'share_premium': None,
                    'retained_earnings': 389859,
                    'reserves_reserves': 21828258921,
                    'total_equity': 36522671808,
                    'total_liabilities_equity': 296735597837,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 35705074523,
                    'due_from_nrb': 21545476231,
                    'placement_bfis': 4115390000,
                    'derivative_assets': 3334953041,
                    'trading_assets': 99314408,
                    'loans_bfis': 7013462114,
                    'loans_customers': 194667770477,
                    'investment_securities': 46407773958,
                    'current_tax_assets': 2927032365,
                    'subsidiaries': None,
                    'associates': 2059346477,
                    'investment_property': 205738502,
                    'property_equipment': 13302874848,
                    'intangible_assets': 22251984,
                    'deferred_tax_assets': None,
                    'other_assets': 89456768726,
                    'total_assets': 340353227653,
                },
                'LIABILITIES': {
                    'due_to_bfis': 476582133,
                    'due_to_nrb': None,
                    'derivative_liabilities': 3321660000,
                    'deposits_customers': 283083745209,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 142235769,
                    'deferred_tax_liabilities': 4039288771,
                    'other_liabilities': 10159085084,
                    'debt_securities': 3494939268,
                    'subordinated_liabilities': None,
                    'total_liabilities': 304717536234,
                },
                'EQUITY': {
                    'share_capital': 14694022928,
                    'share_premium': None,
                    'retained_earnings': -965074675,
                    'reserves_reserves': 21906743166,
                    'total_equity': 35635691419,
                    'total_liabilities_equity': 340353227653,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 49807158761,
                    'due_from_nrb': 18193432501,
                    'placement_bfis': 6871215000,
                    'derivative_assets': 6634727478,
                    'trading_assets': 177323659,
                    'loans_bfis': 7180888311,
                    'loans_customers': 220499777916,
                    'investment_securities': 60728431200,
                    'current_tax_assets': 2569626251,
                    'subsidiaries': None,
                    'associates': 3705894927,
                    'investment_property': 264227850,
                    'property_equipment': 13502108890,
                    'intangible_assets': 23567319,
                    'deferred_tax_assets': None,
                    'other_assets': 8483290437,
                    'total_assets': 398641670501,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4782508343,
                    'due_to_nrb': None,
                    'derivative_liabilities': 6617859207,
                    'deposits_customers': 332092373047,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 138801328,
                    'deferred_tax_liabilities': 3409253788,
                    'other_liabilities': 10488640094,
                    'debt_securities': 3495578127,
                    'subordinated_liabilities': None,
                    'total_liabilities': 361025013931,
                },
                'EQUITY': {
                    'share_capital': 14694022928,
                    'share_premium': None,
                    'retained_earnings': -1418553086,
                    'reserves_reserves': 24341186727,
                    'total_equity': 37616656569,
                    'total_liabilities_equity': 398641670501,
                }
            }
        }

        # Modify FY 074-075 investment_securities to match exactly
        financial_data['074-075']['ASSETS']['investment_securities'] = 16247773730

        # Profit & Loss Data (FY 072-073 to 081-082)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 6263549474,
                    'interest_expense': 1658477928,
                    'net_interest_income': 4605071546,
                    'total_operating_income': 5329323673,
                },
                'EXPENSES': {
                    'personnel_expenses': 2224553422,
                    'operating_profit': 1947214856,
                    'net_profit': 2882978165,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 7431929715,
                    'interest_expense': 1728360491,
                    'net_interest_income': 5703569224,
                    'fee_income': 723129644,
                    'fee_expense': 68922977,
                    'net_fee_income': 654206667,
                    'net_int_fee_income': 6357775891,
                    'trading_income': 144780554,
                    'other_operating_income': -340372782,
                    'total_operating_income': 6162183663,
                },
                'EXPENSES': {
                    'impairment_charge': 359059540,
                    'personnel_expenses': 2167746871,
                    'other_operating_expenses': 615222598,
                    'depreciation': 92408947,
                    'operating_profit': 2927745706,
                    'non_operating_income': 341021051,
                    'non_operating_expense': 392773,
                    'pbt': 3268373985,
                    'tax': 1521250206,
                    'net_profit': 1747123778,
                },
                'REGULATORY': {
                    'cd_ratio': 79.17,
                    'core_capital': 13.37,
                    'supplementary_capital': 1.10,
                    'capital_fund': 14.47,
                    'liquidity_crr': 18.81,
                    'npl_ratio': 3.32,
                    'base_rate': 6.29,
                    'spread': 4.80,
                    'total_employees': 2112,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 9229436342,
                    'interest_expense': 2841690284,
                    'net_interest_income': 6387746058,
                    'fee_income': 983019526,
                    'fee_expense': 76759410, # Wait, in the table under 074-075 it has: 76,759.41 (thousands) which is 76,759,410. Let's verify and correct. Yes, 76759410.
                    'net_fee_income': 906260113,
                    'net_int_fee_income': 7294006171,
                    'trading_income': 207280807,
                    'other_operating_income': 18892336,
                    'total_operating_income': 7520179314,
                },
                'EXPENSES': {
                    'impairment_charge': -86340530,
                    'personnel_expenses': 2148830486,
                    'other_operating_expenses': 511317311,
                    'depreciation': 97589472,
                    'operating_profit': 4848782576,
                    'non_operating_income': 81894914,
                    'non_operating_expense': 202257,
                    'pbt': 4930475233,
                    'tax': 1714793249,
                    'net_profit': 3215681985,
                },
                'REGULATORY': {
                    'cd_ratio': 75.68,
                    'core_capital': 10.29,
                    'supplementary_capital': 0.98,
                    'capital_fund': 11.27,
                    'liquidity_crr': 9.05,
                    'npl_ratio': 3.37,
                    'base_rate': 7.03,
                    'spread': 4.99,
                    'total_employees': 2142,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 10375693239,
                    'interest_expense': 4186150559,
                    'net_interest_income': 6189542679,
                    'fee_income': 1039339829,
                    'fee_expense': 45362654,
                    'net_fee_income': 993977175,
                    'net_int_fee_income': 7183519854,
                    'trading_income': 342412716,
                    'other_operating_income': 210783220,
                    'total_operating_income': 7736715790,
                },
                'EXPENSES': {
                    'impairment_charge': 477102823,
                    'personnel_expenses': 2077398273,
                    'other_operating_expenses': 549791982,
                    'depreciation': 122374746,
                    'operating_profit': 4510047966,
                    'non_operating_income': 101607886,
                    'non_operating_expense': None,
                    'pbt': 4611655852,
                    'tax': 2014919807,
                    'net_profit': 2596736045,
                },
                'REGULATORY': {
                    'cd_ratio': 78.14,
                    'core_capital': 15.87,
                    'supplementary_capital': 0.93,
                    'capital_fund': 16.80,
                    'liquidity_crr': 4.06,
                    'npl_ratio': 2.64,
                    'base_rate': 7.98,
                    'spread': 4.45,
                    'total_employees': 2317,
                    'branches': 131,
                    'atms': 144,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 11526842041,
                    'interest_expense': 5908023000,
                    'net_interest_income': 5618819041,
                    'fee_income': 790344870,
                    'fee_expense': 43956719,
                    'net_fee_income': 746388151,
                    'net_int_fee_income': 6365207192,
                    'trading_income': 412559037,
                    'other_operating_income': 394114547,
                    'total_operating_income': 7171880776,
                },
                'EXPENSES': {
                    'impairment_charge': 879633846,
                    'personnel_expenses': 2224846358,
                    'other_operating_expenses': 668677567,
                    'depreciation': 150802269,
                    'operating_profit': 3247920735,
                    'non_operating_income': 327252050,
                    'non_operating_expense': None,
                    'pbt': 3575172784,
                    'tax': 1242284243,
                    'net_profit': 2332888541,
                },
                'REGULATORY': {
                    'cd_ratio': 72.25,
                    'core_capital': 16.00,
                    'supplementary_capital': 1.01,
                    'capital_fund': 17.01,
                    'liquidity_crr': 4.53,
                    'npl_ratio': 2.47,
                    'base_rate': 6.99,
                    'spread': 3.70,
                    'total_employees': 2172,
                    'branches': 159,
                    'atms': 198,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 11887166103,
                    'interest_expense': 5466724497,
                    'net_interest_income': 6420441606,
                    'fee_income': 953775889,
                    'fee_expense': 67347585,
                    'net_fee_income': 886428304,
                    'net_int_fee_income': 7306869910,
                    'trading_income': 456853535,
                    'other_operating_income': 425275510,
                    'total_operating_income': 8188998955,
                },
                'EXPENSES': {
                    'impairment_charge': 497621720,
                    'personnel_expenses': 2353459424,
                    'other_operating_expenses': 813078311,
                    'depreciation': 177178920,
                    'operating_profit': 4347660580,
                    'non_operating_income': 224759097,
                    'non_operating_expense': None,
                    'pbt': 4572419677,
                    'tax': None,
                    'net_profit': 2961230329,
                },
                'REGULATORY': {
                    'cd_ratio': 82.76,
                    'core_capital': 13.54,
                    'supplementary_capital': 3.26,
                    'capital_fund': 16.80,
                    'liquidity_crr': 4.19,
                    'npl_ratio': 2.05,
                    'base_rate': 5.73,
                    'spread': 4.34,
                    'total_employees': 2504,
                    'branches': 161,
                    'atms': 203,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 16439950427,
                    'interest_expense': 9725363453,
                    'net_interest_income': 6714586974,
                    'fee_income': 968755635,
                    'fee_expense': 81812510,
                    'net_fee_income': 886943125,
                    'net_int_fee_income': 7601530100,
                    'trading_income': 198141763,
                    'other_operating_income': 270185989,
                    'total_operating_income': 8069857851,
                },
                'EXPENSES': {
                    'impairment_charge': 853658796,
                    'personnel_expenses': 2451901299,
                    'other_operating_expenses': 787734063,
                    'depreciation': 339099823,
                    'operating_profit': 3637463869,
                    'non_operating_income': 219327299,
                    'non_operating_expense': None,
                    'pbt': 3856791168,
                    'tax': 933513599,
                    'net_profit': 2923277569,
                },
                'REGULATORY': {}
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 25158116908,
                    'interest_expense': 15751164273,
                    'net_interest_income': 9406952635,
                    'fee_income': 1019377814,
                    'fee_expense': 188311060,
                    'net_fee_income': 831066754,
                    'net_int_fee_income': 10238019389,
                    'trading_income': 78642010,
                    'other_operating_income': 309231092,
                    'total_operating_income': 10625892491,
                },
                'EXPENSES': {
                    'impairment_charge': 1113348200,
                    'personnel_expenses': 3885515968,
                    'other_operating_expenses': 916767870,
                    'depreciation': 375915989,
                    'operating_profit': 4334344464,
                    'non_operating_income': 77261406,
                    'non_operating_expense': None,
                    'pbt': 4411605870,
                    'tax': None,
                    'net_profit': 3437578995,
                },
                'REGULATORY': {
                    'cd_ratio': 72.65,
                    'core_capital': 10.85,
                    'supplementary_capital': 2.89,
                    'capital_fund': 13.74,
                    'liquidity_crr': 7.97,
                    'npl_ratio': 2.85,
                    'base_rate': 9.92,
                    'spread': 3.95,
                    'total_employees': 2725,
                    'branches': 228,
                    'atms': 195,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 25075564947,
                    'interest_expense': 16440796684,
                    'net_interest_income': 8634768263,
                    'fee_income': 1341034240,
                    'fee_expense': 233296513,
                    'net_fee_income': 1107737727,
                    'net_int_fee_income': 9742505979,
                    'trading_income': 113457813,
                    'other_operating_income': 471251694,
                    'total_operating_income': 10327215497,
                },
                'EXPENSES': {
                    'impairment_charge': 4755258138,
                    'personnel_expenses': 3554769997,
                    'other_operating_expenses': 953713341,
                    'depreciation': 380020584,
                    'operating_profit': 683453437,
                    'non_operating_income': 82409188,
                    'non_operating_expense': None,
                    'pbt': 765862624,
                    'tax': None,
                    'net_profit': 28420037, # Audited net profit of NBL (765,862,624 - 737,442,587 tax adjustment = 28,420,037)
                },
                'REGULATORY': {
                    'cd_ratio': 72.99,
                    'core_capital': 9.79,
                    'supplementary_capital': 2.67,
                    'capital_fund': 12.46,
                    'npl_ratio': 4.33,
                    'base_rate': 7.97,
                    'spread': 3.95,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 23122464255,
                    'interest_expense': 12983177012,
                    'net_interest_income': 10139287243,
                    'fee_income': 1473807498,
                    'fee_expense': 295735240,
                    'net_fee_income': 1178072257,
                    'net_int_fee_income': 11317359500,
                    'trading_income': 202182291,
                    'other_operating_income': 475773458,
                    'total_operating_income': 11995315249,
                },
                'EXPENSES': {
                    'impairment_charge': 2254365414,
                    'personnel_expenses': 3860396589,
                    'other_operating_expenses': 1081654473,
                    'depreciation': 350906616,
                    'operating_profit': 4447992156,
                    'non_operating_income': 7298661,
                    'non_operating_expense': None,
                    'pbt': 4455290817,
                    'tax': None,
                    'net_profit': 3078030919,
                },
                'REGULATORY': {
                    'cd_ratio': 70.72,
                    'npl_ratio': 4.56,
                    'base_rate': 5.58,
                    'spread': 3.90,
                    'branches': 165,
                    'atms': 68,
                }
            }
        }

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '073-074': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '074-075': {'bonus': 0.00, 'cash': 10.00, 'book_close': '2018-12-21'},
            '075-076': {'bonus': 15.00, 'cash': 10.00, 'book_close': '2019-12-29'},
            '076-077': {'bonus': 12.00, 'cash': 4.00, 'book_close': '2020-12-31'},
            '077-078': {'bonus': 14.00, 'cash': 3.00, 'book_close': '2021-12-07'},
            '078-079': {'bonus': 2.00, 'cash': 10.00, 'book_close': '2022-12-29'},
            '079-080': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '080-081': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '081-082': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2078/2079', 'bonus': 2.00, 'cash': 10.00, 'book_close': '2022-12-29'},
            {'fy': '2077/2078', 'bonus': 14.00, 'cash': 3.00, 'book_close': '2021-12-07'},
            {'fy': '2076/2077', 'bonus': 12.00, 'cash': 4.00, 'book_close': '2020-12-31'},
            {'fy': '2075/2076', 'bonus': 15.00, 'cash': 10.00, 'book_close': '2019-12-29'},
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
                ticker='NBL',
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
            f'NBL annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='NBL',
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
            f'NBL dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
