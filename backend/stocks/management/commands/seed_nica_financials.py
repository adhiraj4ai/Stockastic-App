from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds NICA annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding NICA financial data...')

        # Ensure NICA company exists
        company, created = Company.objects.get_or_create(
            symbol='NICA',
            defaults={
                'name': 'NIC Asia Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created company: {company.symbol}'))
        else:
            self.stdout.write(f'Company {company.symbol} already exists')

        # Balance Sheet Data (FY 072-073 to 080-081)
        financial_data = {
            '072-073': {
                'ASSETS': {
                    'cash_equivalent': 3549208278,
                    'due_from_nrb': 4396160113,
                    'placement_bfis': 1215914763,
                    'derivative_assets': 2301561462,
                    'trading_assets': None,
                    'loans_bfis': 1088666791,
                    'loans_customers': 57876398870,
                    'investment_securities': 11607520231,
                    'current_tax_assets': 10172233,
                    'subsidiaries': 100000000,
                    'associates': None,
                    'investment_property': 283985874,
                    'property_equipment': 537403660,
                    'intangible_assets': 18272015,
                    'deferred_tax_assets': None,
                    'other_assets': 588287715,
                    'total_assets': 83573552004,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7215492263,
                    'due_to_nrb': None,
                    'derivative_liabilities': 2266526366,
                    'deposits_customers': 64606790894,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 146829993,
                    'other_liabilities': 915509071,
                    'debt_securities': 515702553,
                    'subordinated_liabilities': None,
                    'total_liabilities': 75666851139,
                },
                'EQUITY': {
                    'share_capital': 4575374272,
                    'share_premium': None,
                    'retained_earnings': 1720645643,
                    'reserves_reserves': 1610680950,
                    'total_equity': 7906700865,
                    'total_liabilities_equity': 83573552004,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 3479828475,
                    'due_from_nrb': 10291445440,
                    'placement_bfis': 1493384968,
                    'derivative_assets': 3028560991,
                    'trading_assets': None,
                    'loans_bfis': 1630033602,
                    'loans_customers': 70615820219,
                    'investment_securities': 10019615155,
                    'current_tax_assets': 9857544,
                    'subsidiaries': 100000000,
                    'associates': None,
                    'investment_property': 48254332,
                    'property_equipment': 1062949674,
                    'intangible_assets': 35386546,
                    'deferred_tax_assets': None,
                    'other_assets': 1293225050,
                    'total_assets': 103108000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7772766542,
                    'due_to_nrb': None,
                    'derivative_liabilities': 2999989431,
                    'deposits_customers': 79905602416,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 55797787,
                    'other_liabilities': 1458128070,
                    'debt_securities': 501249729,
                    'subordinated_liabilities': None,
                    'total_liabilities': 92693533976,
                },
                'EQUITY': {
                    'share_capital': 6692597498,
                    'share_premium': None,
                    'retained_earnings': 1844544130,
                    'reserves_reserves': 1877686394,
                    'total_equity': 10414828022,
                    'total_liabilities_equity': 103108000000,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 8132486809,
                    'due_from_nrb': 15860733092,
                    'placement_bfis': 313929191,
                    'derivative_assets': 1266017586,
                    'trading_assets': 9652500,
                    'loans_bfis': 4658145235,
                    'loans_customers': 115805000000,
                    'investment_securities': 14132768273,
                    'current_tax_assets': None,
                    'subsidiaries': 270000000,
                    'associates': None,
                    'investment_property': 74382923,
                    'property_equipment': 1759424471,
                    'intangible_assets': 49831991,
                    'deferred_tax_assets': None,
                    'other_assets': 8611184848,
                    'total_assets': 170943000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 11629507290,
                    'due_to_nrb': 742269472,
                    'derivative_liabilities': 1721813609,
                    'deposits_customers': 139590000000,
                    'borrowings': None,
                    'current_tax_liabilities': 25025507,
                    'provisions': None,
                    'deferred_tax_liabilities': 2814629,
                    'other_liabilities': 2073775098,
                    'debt_securities': 3487908815,
                    'subordinated_liabilities': None,
                    'total_liabilities': 159273000000,
                },
                'EQUITY': {
                    'share_capital': 8031116998,
                    'share_premium': None,
                    'retained_earnings': 943654556,
                    'reserves_reserves': 2695684007,
                    'total_equity': 11670455561,
                    'total_liabilities_equity': 170943000000,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 20214540268,
                    'due_from_nrb': 16097915246,
                    'placement_bfis': 383950000,
                    'derivative_assets': 7006010607,
                    'trading_assets': 7440000,
                    'loans_bfis': 6923285128,
                    'loans_customers': 142574000000,
                    'investment_securities': 18152959017,
                    'current_tax_assets': 2836333821,
                    'subsidiaries': 1204500000,
                    'associates': None,
                    'investment_property': 275938557,
                    'property_equipment': 2583719788,
                    'intangible_assets': 110490299,
                    'deferred_tax_assets': None,
                    'other_assets': 2213615420,
                    'total_assets': 220585000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 13927924793,
                    'due_to_nrb': 314541457,
                    'derivative_liabilities': 6913408934,
                    'deposits_customers': 171428000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 178272826,
                    'other_liabilities': 5176312888,
                    'debt_securities': 7710097099,
                    'subordinated_liabilities': None,
                    'total_liabilities': 205649000000,
                },
                'EQUITY': {
                    'share_capital': 8834228698,
                    'share_premium': None,
                    'retained_earnings': 2112880839,
                    'reserves_reserves': 3988625977,
                    'total_equity': 14935735514,
                    'total_liabilities_equity': 220585000000,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 12294510663,
                    'due_from_nrb': 18721482611,
                    'placement_bfis': None,
                    'derivative_assets': 5636246706,
                    'trading_assets': 9440000,
                    'loans_bfis': 12708077852,
                    'loans_customers': 160184000000,
                    'investment_securities': 29317244034,
                    'current_tax_assets': 3627912906,
                    'subsidiaries': 1264500000,
                    'associates': None,
                    'investment_property': 496064382,
                    'property_equipment': 3223639123,
                    'intangible_assets': 112849533,
                    'deferred_tax_assets': None,
                    'other_assets': 2994104363,
                    'total_assets': 250590000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 9271522999,
                    'due_to_nrb': None,
                    'derivative_liabilities': 5601039423,
                    'deposits_customers': 201630000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 298133395,
                    'other_liabilities': 6891491116,
                    'debt_securities': 9655637044,
                    'subordinated_liabilities': None,
                    'total_liabilities': 233348000000,
                },
                'EQUITY': {
                    'share_capital': 9717651568,
                    'share_premium': None,
                    'retained_earnings': 1975813622,
                    'reserves_reserves': 5548705431,
                    'total_equity': 17242170621,
                    'total_liabilities_equity': 250590000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 23876051962,
                    'due_from_nrb': 9072897671,
                    'placement_bfis': None,
                    'derivative_assets': 5359380480,
                    'trading_assets': 11800000,
                    'loans_bfis': 14303041780, # Wait, table value is: 14,303,041,778.00
                    'loans_customers': 248811000000,
                    'investment_securities': 33061335984,
                    'current_tax_assets': 277201243,
                    'subsidiaries': 1264500000,
                    'associates': None,
                    'investment_property': 1275463444,
                    'property_equipment': 3038162554,
                    'intangible_assets': 94925233,
                    'deferred_tax_assets': None,
                    'other_assets': 5494082643,
                    'total_assets': 345940000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 13533656075,
                    'due_to_nrb': 3238618707,
                    'derivative_liabilities': 5337920000,
                    'deposits_customers': 286821000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 260890745,
                    'other_liabilities': 5215653913,
                    'debt_securities': 10740937282,
                    'subordinated_liabilities': None,
                    'total_liabilities': 325148000000,
                },
                'EQUITY': {
                    'share_capital': 11564005366,
                    'share_premium': None,
                    'retained_earnings': 1953980924,
                    'reserves_reserves': 7173980924,
                    'total_equity': 20691967214,
                    'total_liabilities_equity': 345940000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 27813319163,
                    'due_from_nrb': 12654486629,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': 162822000,
                    'loans_bfis': 14099444435,
                    'loans_customers': 252448483250,
                    'investment_securities': 39048156820,
                    'current_tax_assets': 140559743,
                    'subsidiaries': 1264500000,
                    'associates': None,
                    'investment_property': 722531322,
                    'property_equipment': 3093072139,
                    'intangible_assets': 132654932,
                    'deferred_tax_assets': None,
                    'other_assets': 6989807914,
                    'total_assets': 358569838348,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6754201873,
                    'due_to_nrb': 19727764978,
                    'derivative_liabilities': None,
                    'deposits_customers': 289903959721,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 267765003,
                    'other_liabilities': 6346643319,
                    'debt_securities': 10726356675,
                    'subordinated_liabilities': None,
                    'total_liabilities': 337726691569,
                },
                'EQUITY': {
                    'share_capital': 11564005366,
                    'share_premium': None,
                    'retained_earnings': 3427074085,
                    'reserves_reserves': 9852067328,
                    'total_equity': 24843146779,
                    'total_liabilities_equity': 358569838348,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 20245563442,
                    'due_from_nrb': 20443340655,
                    'placement_bfis': None,
                    'derivative_assets': 2965528168,
                    'trading_assets': 2060000,
                    'loans_bfis': 9966477947,
                    'loans_customers': 261772031449,
                    'investment_securities': 34321039813,
                    'current_tax_assets': 192105650,
                    'subsidiaries': 1204500000,
                    'associates': None,
                    'investment_property': 2718429789,
                    'property_equipment': 5279760580,
                    'intangible_assets': 136468255,
                    'deferred_tax_assets': None,
                    'other_assets': 4841979715,
                    'total_assets': 364089285463,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3972661638,
                    'due_to_nrb': None,
                    'derivative_liabilities': 2962156296,
                    'deposits_customers': 311367922421,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 265498143,
                    'other_liabilities': 5398514132,
                    'debt_securities': 10731576978,
                    'subordinated_liabilities': None,
                    'total_liabilities': 334698329607,
                },
                'EQUITY': {
                    'share_capital': 11564005366,
                    'share_premium': None,
                    'retained_earnings': 3534225906,
                    'reserves_reserves': 14292724584,
                    'total_equity': 29390955856,
                    'total_liabilities_equity': 364089285463,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 29752769729,
                    'due_from_nrb': 16749169067,
                    'placement_bfis': None,
                    'derivative_assets': 3753025095,
                    'trading_assets': 2800000,
                    'loans_bfis': 109849855800,
                    'loans_customers': 271253725413,
                    'investment_securities': 60089191867,
                    'current_tax_assets': 622252230,
                    'subsidiaries': 1194500000,
                    'associates': None,
                    'investment_property': 4361667053,
                    'property_equipment': 5233055005,
                    'intangible_assets': 180728337,
                    'deferred_tax_assets': None,
                    'other_assets': 6325102705,
                    'total_assets': 410467842302,
                },
                'LIABILITIES': {
                    'due_to_bfis': 8340598144,
                    'due_to_nrb': None,
                    'derivative_liabilities': 3746713025,
                    'deposits_customers': 354096864840,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 238462751,
                    'other_liabilities': 3788365647,
                    'debt_securities': 10737329063,
                    'subordinated_liabilities': None,
                    'total_liabilities': 380948333470,
                },
                'EQUITY': {
                    'share_capital': 14917566922,
                    'share_premium': None,
                    'retained_earnings': -2666972172,
                    'reserves_reserves': 17268914082,
                    'total_equity': 29519508832,
                    'total_liabilities_equity': 410467842302,
                }
            }
        }

        # Profit & Loss Data (FY 072-073 to 080-081)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 4402017966,
                    'interest_expense': 2444176252,
                    'net_interest_income': 1957841714,
                    'total_operating_income': 2613355464,
                },
                'EXPENSES': {
                    'personnel_expenses': 543319190,
                    'operating_profit': 1369473056,
                    'net_profit': 1066838638,
                },
                'REGULATORY': {
                    'cd_ratio': 85.62,
                    'core_capital': 10.69,
                    'supplementary_capital': 1.75,
                    'capital_fund': 12.44,
                    'liquidity_crr': 23.79,
                    'npl_ratio': 0.76,
                    'total_employees': 1101,
                    'branches': 67,
                    'atms': 69,
                }
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 7088588243,
                    'interest_expense': 4362929035,
                    'net_interest_income': 2725659208,
                    'fee_income': 707009657,
                    'fee_expense': 49919233,
                    'net_fee_income': 657090424,
                    'net_int_fee_income': 3382749632,
                    'trading_income': 161609119,
                    'other_operating_income': 58064578,
                    'total_operating_income': 3602423329,
                },
                'EXPENSES': {
                    'impairment_charge': -69682827,
                    'personnel_expenses': 1132927048,
                    'other_operating_expenses': 580553262,
                    'depreciation': 129184664,
                    'operating_profit': 1829441182,
                    'non_operating_income': 155409210,
                    'non_operating_expense': 31694451,
                    'pbt': 1953155942,
                    'tax': 587740349,
                    'net_profit': 1365415593,
                },
                'REGULATORY': {
                    'cd_ratio': 83.70,
                    'core_capital': 12.38,
                    'supplementary_capital': 1.45,
                    'capital_fund': 13.83,
                    'liquidity_crr': 25.80,
                    'npl_ratio': 0.36,
                    'total_employees': 1755,
                    'branches': 119,
                    'atms': 70,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 13545820277,
                    'interest_expense': 9336156241,
                    'net_interest_income': 4209664036,
                    'fee_income': 966148768,
                    'fee_expense': 96498109,
                    'net_fee_income': 869650660,
                    'net_int_fee_income': 5079314696,
                    'trading_income': 195206579,
                    'other_operating_income': 83615018,
                    'total_operating_income': 5358136293,
                },
                'EXPENSES': {
                    'impairment_charge': 304831572,
                    'personnel_expenses': 1782112947,
                    'other_operating_expenses': 1237092835,
                    'depreciation': 115804043,
                    'operating_profit': 1918294896,
                    'non_operating_income': 2500650,
                    'non_operating_expense': 110192719,
                    'pbt': 1810602827,
                    'tax': 475740900,
                    'net_profit': 1334861927,
                },
                'REGULATORY': {
                    'cd_ratio': 86.30,
                    'core_capital': 8.66,
                    'supplementary_capital': 3.58,
                    'capital_fund': 12.24,
                    'liquidity_crr': 24.45,
                    'npl_ratio': 0.06,
                    'total_employees': 2291,
                    'branches': 231,
                    'atms': 220,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 19345593620,
                    'interest_expense': 12385561034,
                    'net_interest_income': 6960032586,
                    'fee_income': 2248906357,
                    'fee_expense': 127599155,
                    'net_fee_income': 2121307202,
                    'net_int_fee_income': 9081339788,
                    'trading_income': 348920815,
                    'other_operating_income': 75974201,
                    'total_operating_income': 9506234804,
                },
                'EXPENSES': {
                    'impairment_charge': 598917799,
                    'personnel_expenses': 2476831196,
                    'other_operating_expenses': 1712836238,
                    'depreciation': 204032944,
                    'operating_profit': 4513616628,
                    'non_operating_income': 31304551,
                    'non_operating_expense': 104165473,
                    'pbt': 4440755706,
                    'tax': 1417473040,
                    'net_profit': 3023282666,
                },
                'REGULATORY': {
                    'cd_ratio': 84.55,
                    'core_capital': 8.24,
                    'supplementary_capital': 5.08,
                    'capital_fund': 13.32,
                    'liquidity_crr': 26.05,
                    'npl_ratio': 0.46,
                    'total_employees': 3472,
                    'branches': 292,
                    'atms': 302,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 20723315676,
                    'interest_expense': 13118483968,
                    'net_interest_income': 7604831708,
                    'fee_income': 2642775224,
                    'fee_expense': 159904081,
                    'net_fee_income': 2482871143,
                    'net_int_fee_income': 10087702851,
                    'trading_income': 339613196,
                    'other_operating_income': 255897375,
                    'total_operating_income': 10683213423,
                },
                'EXPENSES': {
                    'impairment_charge': 1113706373,
                    'personnel_expenses': 2910166360,
                    'other_operating_expenses': 1971775707,
                    'depreciation': 252738473,
                    'operating_profit': 4434826510,
                    'non_operating_income': 19852314,
                    'non_operating_expense': 57383872,
                    'pbt': 4397294952,
                    'tax': 1298757987,
                    'net_profit': 3098536965,
                },
                'REGULATORY': {
                    'cd_ratio': 85.75,
                    'core_capital': 8.35,
                    'supplementary_capital': 5.15,
                    'capital_fund': 13.50,
                    'liquidity_crr': 27.09,
                    'npl_ratio': 0.75,
                    'total_employees': 2908,
                    'branches': 326,
                    'atms': 464,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 23562128326,
                    'interest_expense': 14334625495,
                    'net_interest_income': 9227502831,
                    'fee_income': 1829740414,
                    'fee_expense': 216898083,
                    'net_fee_income': 1612842331,
                    'net_int_fee_income': 10840345162,
                    'trading_income': 277780325,
                    'other_operating_income': 219417431,
                    'total_operating_income': 11337542918,
                },
                'EXPENSES': {
                    'impairment_charge': 1193435172,
                    'personnel_expenses': 3363345135,
                    'other_operating_expenses': 1613718594,
                    'depreciation': 368151770,
                    'operating_profit': 4798892247,
                    'non_operating_income': 7155255,
                    'non_operating_expense': 158216336,
                    'pbt': 4647831166,
                    'tax': 1396747021,
                    'net_profit': 3251084145,
                },
                'REGULATORY': {
                    'cd_ratio': 91.65,
                    'core_capital': 7.36,
                    'supplementary_capital': 5.11,
                    'capital_fund': 12.47,
                    'liquidity_crr': 20.65,
                    'npl_ratio': 0.50,
                    'total_employees': 3792,
                    'branches': 356,
                    'atms': 472,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 32771914410,
                    'interest_expense': 21482312140,
                    'net_interest_income': 11289602270,
                    'fee_income': 2369651129,
                    'fee_expense': 347075989,
                    'net_fee_income': 2022575140,
                    'net_int_fee_income': 13312177410,
                    'trading_income': 200929858,
                    'other_operating_income': 304409423,
                    'total_operating_income': 13817516691,
                },
                'EXPENSES': {
                    'impairment_charge': 865260404,
                    'personnel_expenses': 4500746350,
                    'other_operating_expenses': 2101543675,
                    'depreciation': 384717432,
                    'operating_profit': 5965248830,
                    'non_operating_income': 62025869,
                    'non_operating_expense': 31071210,
                    'pbt': 5996203489,
                    'tax': 1781276538,
                    'net_profit': 4214926951,
                },
                'REGULATORY': {}
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 38372715652,
                    'interest_expense': 26113904428,
                    'net_interest_income': 12258811224,
                    'fee_income': 2712005254,
                    'fee_expense': 389527602,
                    'net_fee_income': 2322477652,
                    'net_int_fee_income': 14581288876,
                    'trading_income': 147037615,
                    'other_operating_income': 298385661,
                    'total_operating_income': 15026712152,
                },
                'EXPENSES': {
                    'impairment_charge': 721962851,
                    'personnel_expenses': 4961096840,
                    'other_operating_expenses': 2026034323,
                    'depreciation': 780820276,
                    'operating_profit': 6536797861,
                    'non_operating_income': 9464582,
                    'non_operating_expense': 377894311,
                    'pbt': 6168368132,
                    'tax': None,
                    'net_profit': 4444769821,
                },
                'REGULATORY': {
                    'cd_ratio': 86.17,
                    'core_capital': 9.46,
                    'supplementary_capital': 3.90,
                    'capital_fund': 13.36,
                    'liquidity_crr': 22.23,
                    'npl_ratio': 0.88,
                    'spread': 4.28,
                    'total_employees': 3943,
                    'branches': 360,
                    'atms': 517,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 38521096744,
                    'interest_expense': 27757846795,
                    'net_interest_income': 10763249949,
                    'fee_income': 2285551934,
                    'fee_expense': 317496740,
                    'net_fee_income': 1968055194,
                    'net_int_fee_income': 12731305142,
                    'trading_income': 128470262,
                    'other_operating_income': 412470262,
                    'total_operating_income': 13272428871,
                },
                'EXPENSES': {
                    'impairment_charge': 3886810538,
                    'personnel_expenses': 4468601550,
                    'other_operating_expenses': 2061810016,
                    'depreciation': 821503221,
                    'operating_profit': 2033703545,
                    'non_operating_income': 10318074,
                    'non_operating_expense': 1097300091,
                    'pbt': 946721528,
                    'tax': None,
                    'net_profit': 701497630,
                },
                'REGULATORY': {
                    'cd_ratio': 79.70,
                    'core_capital': 8.29,
                    'supplementary_capital': 2.74,
                    'capital_fund': 11.03,
                    'liquidity_crr': 28.07,
                    'npl_ratio': 3.45,
                    'spread': 3.51,
                    'total_employees': 3579,
                    'branches': 360,
                    'atms': 673,
                }
            }
        }

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 26.00, 'cash': 1.37, 'book_close': '2016-09-21'},
            '073-074': {'bonus': 20.00, 'cash': 1.05, 'book_close': '2017-09-01'},
            '074-075': {'bonus': 10.00, 'cash': 0.526, 'book_close': '2018-12-05'},
            '075-076': {'bonus': 10.00, 'cash': 11.05, 'book_close': '2019-09-15'},
            '076-077': {'bonus': 19.00, 'cash': 1.00, 'book_close': '2020-11-25'},
            '077-078': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '078-079': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
            '079-080': {'bonus': 29.00, 'cash': 1.50, 'book_close': '2023-10-03'},
            '080-081': {'bonus': 0.00, 'cash': 0.00, 'book_close': None},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2079/2080', 'bonus': 29.00, 'cash': 1.50, 'book_close': '2023-10-03'},
            {'fy': '2076/2077', 'bonus': 19.00, 'cash': 1.00, 'book_close': '2020-11-25'},
            {'fy': '2075/2076', 'bonus': 10.00, 'cash': 11.05, 'book_close': '2019-09-15'},
            {'fy': '2074/2075', 'bonus': 10.00, 'cash': 0.526, 'book_close': '2018-12-05'},
            {'fy': '2073/2074', 'bonus': 20.00, 'cash': 1.05, 'book_close': '2017-09-01'},
            {'fy': '2072/2073', 'bonus': 26.00, 'cash': 1.37, 'book_close': '2016-09-21'},
            {'fy': '2071/2072', 'bonus': 39.00, 'cash': 2.05, 'book_close': '2016-01-10'},
            {'fy': '2070/2071', 'bonus': 15.00, 'cash': 15.00, 'book_close': '2014-12-15'},
            {'fy': '2069/2070', 'bonus': 0.00, 'cash': 20.00, 'book_close': '2014-02-05'},
            {'fy': '2068/2069', 'bonus': 0.00, 'cash': 25.00, 'book_close': '2012-06-29'},
            {'fy': '2067/2068', 'bonus': 0.00, 'cash': 20.00, 'book_close': '2011-11-29'},
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
                ticker='NICA',
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
            f'NICA annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='NICA',
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
            f'NICA dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
