from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds EBL annual financial reports from FY 072-073 to 081-082'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding EBL financial data...')

        # Ensure EBL company exists
        company, created = Company.objects.get_or_create(
            symbol='EBL',
            defaults={
                'name': 'Everest Bank Limited',
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
                    'cash_equivalent': 2514947575,
                    'due_from_nrb': 13356018269,
                    'placement_bfis': 7246428654,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 77287764142,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 678987899,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 113885000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 93735480708,
                    'borrowings': 2500000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': 1068845000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 105371000000,
                },
                'EQUITY': {
                    'share_capital': 4606426899,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 3907661213,
                    'total_equity': 8514088112,
                    'total_liabilities_equity': 113885000000,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 8667840097,
                    'due_from_nrb': 14577083955,
                    'placement_bfis': 3350750000,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 3291101916,
                    'loans_customers': 75695621515,
                    'investment_securities': 7652704965,
                    'current_tax_assets': 17594825,
                    'subsidiaries': None,
                    'associates': 199945750,
                    'investment_property': 734341,
                    'property_equipment': 1663292059,
                    'intangible_assets': 7172273,
                    'deferred_tax_assets': None,
                    'other_assets': 1815829593,
                    'total_assets': 116946000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1074610787,
                    'due_to_nrb': 14761650,
                    'derivative_liabilities': None,
                    'deposits_customers': 94091892005,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 181650729,
                    'other_liabilities': 7307006105,
                    'debt_securities': 1068845000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 103739000000,
                },
                'EQUITY': {
                    'share_capital': 5741095399,
                    'share_premium': None,
                    'retained_earnings': 2497053940,
                    'reserves_reserves': 4969364772,
                    'total_equity': 13207514111,
                    'total_liabilities_equity': 116946000000,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 10065422666,
                    'due_from_nrb': 18938747835,
                    'placement_bfis': 3291000000,
                    'derivative_assets': 7112103,
                    'trading_assets': None,
                    'loans_bfis': 4254678027,
                    'loans_customers': 89927569569,
                    'investment_securities': 15292314230,
                    'current_tax_assets': 10915449,
                    'subsidiaries': None,
                    'associates': 259668425,
                    'investment_property': 2202745,
                    'property_equipment': 1862232350,
                    'intangible_assets': 12931944,
                    'deferred_tax_assets': None,
                    'other_assets': 893468203,
                    'total_assets': 144818000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 916078304,
                    'due_to_nrb': 26712725,
                    'derivative_liabilities': 7132295,
                    'deposits_customers': 115512000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 77263839,
                    'other_liabilities': 11076018046,
                    'debt_securities': 1068845000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 128684000000,
                },
                'EQUITY': {
                    'share_capital': 8106863347,
                    'share_premium': 238469884,
                    'retained_earnings': 1739036261,
                    'reserves_reserves': 6050137923,
                    'total_equity': 16134507415,
                    'total_liabilities_equity': 144818000000,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 7759121374,
                    'due_from_nrb': 23304568526,
                    'placement_bfis': 548500000,
                    'derivative_assets': 1486215045,
                    'trading_assets': None,
                    'loans_bfis': 7362981231,
                    'loans_customers': 104640000000,
                    'investment_securities': 21434199007,
                    'current_tax_assets': 75090726,
                    'subsidiaries': None,
                    'associates': 314441000,
                    'investment_property': 21040174,
                    'property_equipment': 2115995141,
                    'intangible_assets': 37769556,
                    'deferred_tax_assets': None,
                    'other_assets': 973410771,
                    'total_assets': 170078000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 609215244,
                    'due_to_nrb': 1206069094,
                    'derivative_liabilities': 1446389926,
                    'deposits_customers': 129568000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 92881229,
                    'other_liabilities': 18460916661,
                    'debt_securities': 1068845000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 152452000000,
                },
                'EQUITY': {
                    'share_capital': 8106863347,
                    'share_premium': 238469884,
                    'retained_earnings': 2324150968,
                    'reserves_reserves': 6955579206,
                    'total_equity': 17625063404,
                    'total_liabilities_equity': 170078000000,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 10368147712,
                    'due_from_nrb': 19972674889,
                    'placement_bfis': 2404000000,
                    'derivative_assets': 14537291,
                    'trading_assets': None,
                    'loans_bfis': 6857499851,
                    'loans_customers': 112212000000,
                    'investment_securities': 28813510026,
                    'current_tax_assets': 226712839,
                    'subsidiaries': None,
                    'associates': 379022906,
                    'investment_property': 21040174,
                    'property_equipment': 2151054185,
                    'intangible_assets': 46136457,
                    'deferred_tax_assets': None,
                    'other_assets': 1557115037,
                    'total_assets': 185023000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1182834338,
                    'due_to_nrb': 32886332,
                    'derivative_liabilities': None,
                    'deposits_customers': 143545000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 127370222,
                    'other_liabilities': 20428422168,
                    'debt_securities': 1068845000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 166386000000,
                },
                'EQUITY': {
                    'share_capital': 8510206836,
                    'share_premium': 238469884,
                    'retained_earnings': 1793065962,
                    'reserves_reserves': 8095613778,
                    'total_equity': 18637356460,
                    'total_liabilities_equity': 185023000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 9163408289,
                    'due_from_nrb': 28838572178,
                    'placement_bfis': 2144700000,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 7486023605,
                    'loans_customers': 127687000000,
                    'investment_securities': 31460033444,
                    'current_tax_assets': 441079592,
                    'subsidiaries': None,
                    'associates': 502315696,
                    'investment_property': 2202745,
                    'property_equipment': 2737912635,
                    'intangible_assets': 32837037,
                    'deferred_tax_assets': None,
                    'other_assets': 1153939649,
                    'total_assets': 211650000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 678975219,
                    'due_to_nrb': 2112184741,
                    'derivative_liabilities': 27925206,
                    'deposits_customers': 160220000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 410463546,
                    'other_liabilities': 27047993320,
                    'debt_securities': 468845000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 190967000000,
                },
                'EQUITY': {
                    'share_capital': 8933717178,
                    'share_premium': 238469884,
                    'retained_earnings': 2364207718,
                    'reserves_reserves': 9147210685,
                    'total_equity': 20683605466,
                    'total_liabilities_equity': 211650000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 14024363708,
                    'due_from_nrb': 11105032243,
                    'placement_bfis': 2875500000,
                    'derivative_assets': 15766811,
                    'trading_assets': None,
                    'loans_bfis': 9573310676,
                    'loans_customers': 145480529033,
                    'investment_securities': 35674336981,
                    'current_tax_assets': 548665100,
                    'subsidiaries': None,
                    'associates': 713659584,
                    'investment_property': 2202745,
                    'property_equipment': 3635568481,
                    'intangible_assets': 23076167,
                    'deferred_tax_assets': 111957429,
                    'other_assets': 1597353578,
                    'total_assets': 225381322534,
                },
                'LIABILITIES': {
                    'due_to_bfis': 733073213,
                    'due_to_nrb': 2919259377,
                    'derivative_liabilities': None,
                    'deposits_customers': 172739184905,
                    'borrowings': 2556000000,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 22313624529,
                    'debt_securities': 1325628000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 202586770024,
                },
                'EQUITY': {
                    'share_capital': 9467340209,
                    'share_premium': 238469884,
                    'retained_earnings': 3877116233,
                    'reserves_reserves': 9211626185,
                    'total_equity': 22794552510,
                    'total_liabilities_equity': 225381322534,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 15378247980,
                    'due_from_nrb': 13933794413,
                    'placement_bfis': 5980975000,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 8076881203,
                    'loans_customers': 159479294513,
                    'investment_securities': 40201725289,
                    'current_tax_assets': 520852132,
                    'subsidiaries': None,
                    'associates': 727809952,
                    'investment_property': None,
                    'property_equipment': 3619402714,
                    'intangible_assets': 24949153,
                    'deferred_tax_assets': None,
                    'other_assets': 2146560300,
                    'total_assets': 250090492650,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1219273691,
                    'due_to_nrb': 23767053,
                    'derivative_liabilities': 47597107,
                    'deposits_customers': 198007807066,
                    'borrowings': 2664217161,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 173207361,
                    'other_liabilities': 18979340953,
                    'debt_securities': 3603613000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 224718823391,
                },
                'EQUITY': {
                    'share_capital': 10698094436,
                    'share_premium': 238469884,
                    'retained_earnings': 4110487506,
                    'reserves_reserves': 10324617435,
                    'total_equity': 25371669260,
                    'total_liabilities_equity': 250090492650,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 8370599472,
                    'due_from_nrb': 40768261011,
                    'placement_bfis': 6482025000,
                    'derivative_assets': 1664092583,
                    'trading_assets': None,
                    'loans_bfis': 7652663431,
                    'loans_customers': 178215398721,
                    'investment_securities': 44143619543,
                    'current_tax_assets': 517746655,
                    'subsidiaries': None,
                    'associates': 836283158,
                    'investment_property': 522293275,
                    'property_equipment': 3891474615,
                    'intangible_assets': 25380760,
                    'deferred_tax_assets': None,
                    'other_assets': 2653862223,
                    'total_assets': 295743700448,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1071804697,
                    'due_to_nrb': None,
                    'derivative_liabilities': 1630408398,
                    'deposits_customers': 232316604842,
                    'borrowings': 2349196262,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 125808363,
                    'other_liabilities': 26841481149,
                    'debt_securities': 3603613000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 267938916710,
                },
                'EQUITY': {
                    'share_capital': 11767903880,
                    'share_premium': 238469884,
                    'retained_earnings': 3302368763,
                    'reserves_reserves': 12496041211,
                    'total_equity': 27804783738,
                    'total_liabilities_equity': 295743700448,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 6720639482,
                    'due_from_nrb': 64715146228,
                    'placement_bfis': 7996585181,
                    'derivative_assets': 3577723753,
                    'trading_assets': None,
                    'loans_bfis': 9781759468,
                    'loans_customers': 213438490103,
                    'investment_securities': 49443437467,
                    'current_tax_assets': 374634507,
                    'subsidiaries': None,
                    'associates': 762144319,
                    'investment_property': 564295086,
                    'property_equipment': 4177562454,
                    'intangible_assets': 191979773,
                    'deferred_tax_assets': None,
                    'other_assets': 1894847469,
                    'total_assets': 363639245291,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3436943308,
                    'due_to_nrb': None,
                    'derivative_liabilities': 3598403660,
                    'deposits_customers': 298818400190,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 42193593,
                    'other_liabilities': 19200191441,
                    'debt_securities': 6603613000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 331699745192,
                },
                'EQUITY': {
                    'share_capital': 12944694268,
                    'share_premium': 238469884,
                    'retained_earnings': 4893096198,
                    'reserves_reserves': 13863239749,
                    'total_equity': 31939500099,
                    'total_liabilities_equity': 363639245291,
                }
            }
        }

        # P&L Data (FY 072-073 to 081-082)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 5057077497,
                    'interest_expense': 1828492869,
                    'net_interest_income': 3228584628,
                    'total_operating_income': 4137295373,
                },
                'EXPENSES': {
                    'personnel_expenses': 699880930,
                    'operating_profit': 2666102674,
                    'net_profit': 1730207025,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 6816040160,
                    'interest_expense': 3009792494,
                    'net_interest_income': 3806247666,
                    'fee_income': 848335721,
                    'fee_expense': 107411596,
                    'net_fee_income': 740924125,
                    'net_int_fee_income': 4547171791,
                    'trading_income': 155715942,
                    'other_operating_income': 97630012,
                    'total_operating_income': 4800517744,
                },
                'EXPENSES': {
                    'impairment_charge': 40478123,
                    'personnel_expenses': 1163483620,
                    'other_operating_expenses': 492211307,
                    'depreciation': 83082046,
                    'operating_profit': 3021262648,
                    'non_operating_expense': 102653,
                    'pbt': 3021159995,
                    'tax': 903138475,
                    'net_profit': 2118021520,
                },
                'REGULATORY': {
                    'cd_ratio': 84.05,
                    'core_capital': 12.58,
                    'supplementary_capital': 1.97,
                    'capital_fund': 14.54,
                    'liquidity_crr': 16.52,
                    'npl_ratio': 0.25,
                    'base_rate': 7.68,
                    'spread': 4.48,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 10103451389,
                    'interest_expense': 5233687535,
                    'net_interest_income': 4869763854,
                    'fee_income': 945375352,
                    'fee_expense': 123289086,
                    'net_fee_income': 822086266,
                    'net_int_fee_income': 5691850120,
                    'trading_income': 195902137,
                    'other_operating_income': 92640636,
                    'total_operating_income': 5980392893,
                },
                'EXPENSES': {
                    'impairment_charge': 132115562,
                    'personnel_expenses': 1492670480,
                    'other_operating_expenses': 584533725,
                    'depreciation': 85372981,
                    'operating_profit': 3685700146,
                    'non_operating_expense': 3614156,
                    'pbt': 3682085990,
                    'tax': 1100404212,
                    'net_profit': 2581681778,
                },
                'REGULATORY': {
                    'cd_ratio': 81.86,
                    'core_capital': 12.65,
                    'supplementary_capital': 1.55,
                    'capital_fund': 14.20,
                    'liquidity_crr': 17.75,
                    'npl_ratio': 0.20,
                    'base_rate': 8.45,
                    'spread': 4.72,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 13019443721,
                    'interest_expense': 7320851928,
                    'net_interest_income': 5698591793,
                    'fee_income': 1025000325,
                    'fee_expense': 133605344,
                    'net_fee_income': 891394981,
                    'net_int_fee_income': 6589986775,
                    'trading_income': 306924048,
                    'other_operating_income': 99537441,
                    'total_operating_income': 6996448264,
                },
                'EXPENSES': {
                    'impairment_charge': 136755710,
                    'personnel_expenses': 1653296315,
                    'other_operating_expenses': 726832851,
                    'depreciation': 127443880,
                    'operating_profit': 4352119508,
                    'non_operating_expense': 4337697,
                    'pbt': 4347781811,
                    'tax': 1293659749,
                    'net_profit': 3054122062,
                },
                'REGULATORY': {
                    'cd_ratio': 87.01,
                    'core_capital': 12.38,
                    'supplementary_capital': 1.36,
                    'capital_fund': 13.74,
                    'liquidity_crr': 18.56,
                    'npl_ratio': 0.16,
                    'base_rate': 8.12,
                    'spread': 4.29,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 13956188913,
                    'interest_expense': 8645778418,
                    'net_interest_income': 5310410495,
                    'fee_income': 1144656716,
                    'fee_expense': 128502771,
                    'net_fee_income': 1016153945,
                    'net_int_fee_income': 632656440,
                    'trading_income': 263565607,
                    'other_operating_income': 122206758,
                    'total_operating_income': 6712336804,
                },
                'EXPENSES': {
                    'impairment_charge': 548470483,
                    'personnel_expenses': 1646839964,
                    'other_operating_expenses': 784499401,
                    'depreciation': 149835180,
                    'operating_profit': 3582691776,
                    'non_operating_expense': 612663,
                    'pbt': 3582079114,
                    'tax': 1065835404,
                    'net_profit': 2516243710,
                },
                'REGULATORY': {
                    'cd_ratio': 83.52,
                    'core_capital': 11.92,
                    'supplementary_capital': 1.46,
                    'capital_fund': 13.38,
                    'liquidity_crr': 14.43,
                    'npl_ratio': 0.22,
                    'base_rate': 8.05,
                    'spread': 3.59,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 11515527553,
                    'interest_expense': 7559208914,
                    'net_interest_income': 3956318642,
                    'fee_income': 978902083,
                    'fee_expense': 210737406,
                    'net_fee_income': 768164677,
                    'net_int_fee_income': 4724483319,
                    'trading_income': 367239043,
                    'other_operating_income': 214281809,
                    'total_operating_income': 5306004171,
                },
                'EXPENSES': {
                    'impairment_charge': 262367680,
                    'personnel_expenses': 1611061794,
                    'other_operating_expenses': 724309836,
                    'depreciation': 159856513,
                    'operating_profit': 2548408348,
                    'non_operating_expense': 86688,
                    'pbt': 2548321660,
                    'tax': 777382163,
                    'net_profit': 1770939497,
                },
                'REGULATORY': {
                    'cd_ratio': 85.30,
                    'core_capital': 11.24,
                    'supplementary_capital': 1.24,
                    'capital_fund': 12.48,
                    'liquidity_crr': 18.15,
                    'npl_ratio': 0.12,
                    'base_rate': 5.99,
                    'spread': 3.24,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 15467180397,
                    'interest_expense': 10285764016,
                    'net_interest_income': 5181416381,
                    'fee_income': 1294957645,
                    'fee_expense': 263073470,
                    'net_fee_income': 1031884175,
                    'net_int_fee_income': 6213300556,
                    'trading_income': 299490529,
                    'other_operating_income': 294287551,
                    'total_operating_income': 6807078636,
                },
                'EXPENSES': {
                    'impairment_charge': 325445856,
                    'personnel_expenses': 2045469854,
                    'other_operating_expenses': 592220619,
                    'depreciation': 293187713,
                    'operating_profit': 3550754594,
                    'non_operating_expense': 2513362,
                    'pbt': 3548241232,
                    'tax': 1042047398,
                    'net_profit': 2479400875,
                },
                'REGULATORY': {}
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 22400611241,
                    'interest_expense': 14988171055,
                    'net_interest_income': 7412440186,
                    'fee_income': 1347521410,
                    'fee_expense': 271927310,
                    'net_fee_income': 1075594100,
                    'net_int_fee_income': 8488034286,
                    'trading_income': 182784199,
                    'other_operating_income': 94188165,
                    'total_operating_income': 8765006650,
                },
                'EXPENSES': {
                    'impairment_charge': 771360504,
                    'personnel_expenses': 2129930956,
                    'other_operating_expenses': 736668961,
                    'depreciation': 309475169,
                    'operating_profit': 4817571059,
                    'non_operating_expense': 1286183,
                    'pbt': 4816284876,
                    'net_profit': 3362115439,
                },
                'REGULATORY': {
                    'core_capital': 11.17,
                    'supplementary_capital': 2.13,
                    'capital_fund': 13.30,
                    'spread': 3.97,
                    'total_employees': 1097,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 22547387207,
                    'interest_expense': 14899061720,
                    'net_interest_income': 7648325487,
                    'fee_income': 1638316134,
                    'fee_expense': 295238165,
                    'net_fee_income': 1343077969,
                    'net_int_fee_income': 8997403456,
                    'trading_income': 353739528,
                    'other_operating_income': 160337285,
                    'total_operating_income': 9505480270,
                },
                'EXPENSES': {
                    'impairment_charge': 282403883,
                    'personnel_expenses': 2410513670,
                    'other_operating_expenses': 817116746,
                    'depreciation': 332374868,
                    'operating_profit': 5663071103,
                    'non_operating_expense': 494175,
                    'pbt': 5662576928,
                    'net_profit': 3703225086,
                },
                'REGULATORY': {
                    'cd_ratio': 81.12,
                    'core_capital': 10.59,
                    'supplementary_capital': 1.71,
                    'capital_fund': 12.30,
                    'liquidity_crr': 9.23,
                    'base_rate': 7.29,
                    'spread': 3.98,
                    'total_employees': 1149,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 20814261205,
                    'interest_expense': 11711936982,
                    'net_interest_income': 9102324223,
                    'fee_income': 1877808633,
                    'fee_expense': 346312052,
                    'net_fee_income': 1530496582,
                    'net_int_fee_income': 1063282084,
                    'trading_income': 468681699,
                    'other_operating_income': 69114163,
                    'total_operating_income': 11170616666,
                },
                'EXPENSES': {
                    'impairment_charge': -155326618,
                    'personnel_expenses': 2640457450,
                    'other_operating_expenses': 1010647305,
                    'depreciation': 326421064,
                    'operating_profit': 7348417465,
                    'non_operating_income': 10687923,
                    'non_operating_expense': 2151515,
                    'pbt': 7356953872,
                    'net_profit': 4839903472,
                },
                'REGULATORY': {
                    'cd_ratio': 77.48,
                    'core_capital': 10.44,
                    'supplementary_capital': 2.73,
                    'capital_fund': 13.17,
                    'liquidity_crr': 4.39,
                    'base_rate': 5.36,
                    'spread': 3.48,
                    'total_employees': 1212,
                }
            }
        }

        # Dividend Data (FY 072-073 to 081-082)
        dividend_data = {
            '072-073': {'bonus': 70.00, 'cash': 3.675, 'book_close': '2016-12-21'},
            '073-074': {'bonus': 33.00, 'cash': 1.74, 'book_close': '2017-12-28'},
            '074-075': {'bonus': 0.00, 'cash': 20.00, 'book_close': '2018-12-12'},
            '075-076': {'bonus': 5.00, 'cash': 20.00, 'book_close': '2019-12-20'},
            '076-077': {'bonus': 5.00, 'cash': 5.53, 'book_close': '2020-12-25'},
            '077-078': {'bonus': 6.00, 'cash': 4.32, 'book_close': '2021-12-03'},
            '078-079': {'bonus': 13.00, 'cash': 7.68, 'book_close': '2022-11-29'},
            '079-080': {'bonus': 10.00, 'cash': 10.53, 'book_close': '2023-10-03'},
            '080-081': {'bonus': 10.00, 'cash': 5.53, 'book_close': '2024-09-24'},
            '081-082': {'bonus': 6.00, 'cash': 14.00, 'book_close': '2025-10-10'},
        }

        # Cash Flow Data (FY 077-078 to 081-082)
        cash_flow_data = {
            '077-078': {
                'OPERATING': {
                    'interest_received': 10338357566,
                    'fees_received': 978902083,
                    'other_receipts': 409701540,
                    'interest_paid': -7551440479,
                    'fees_paid': -210737406,
                    'employee_payments': -1634008926,
                    'other_payments': 155768799,
                    'operating_cash_before_changes': 2486543177,
                    'change_nrb': -8865897289,
                    'change_placements': 259300000,
                    'change_loans_bfis': -657856187,
                    'change_loans_customers': -15791493866,
                    'change_other_assets': 134572349,
                    'change_due_bfis': -503859119,
                    'change_due_nrb': 2079298409,
                    'change_deposits': 16674781756,
                    'change_borrowings': 0,
                    'change_other_liabilities': 6653364559,
                    'operating_cash_before_tax': 2468753789,
                    'tax_paid': -1004610750,
                    'net_operating_cash': 1464143040,
                },
                'INVESTING': {
                    'purchase_investments': -1583000466,
                    'sale_investments': 124372516,
                    'purchase_ppe': -1491998269,
                    'sale_ppe': 1060000,
                    'purchase_intangibles': -36000,
                    'net_investing_cash': -1494691031,
                },
                'FINANCING': {
                    'dividends_paid': -485143622,
                    'net_financing_cash': -1186164102,
                },
                'SUMMARY': {
                    'net_change_cash': -1216712093,
                    'cash_beginning': 10368147712,
                    'cash_ending': 9163408289,
                }
            },
            '078-079': {
                'OPERATING': {
                    'interest_received': 13445544186,
                    'fees_received': 1294957645,
                    'other_receipts': 255798512,
                    'interest_paid': -9944625501,
                    'fees_paid': -263073470,
                    'employee_payments': -1836644231,
                    'other_payments': -437453847,
                    'operating_cash_before_changes': 2514503294,
                    'change_nrb': 17733539936,
                    'change_placements': -730800000,
                    'change_loans_bfis': -2114779201,
                    'change_loans_customers': -18111389276,
                    'change_other_assets': -135640698,
                    'change_due_bfis': 54097994,
                    'change_due_nrb': 807074636,
                    'change_deposits': 12518927965,
                    'change_borrowings': 2556000000,
                    'change_other_liabilities': -5945415350,
                    'operating_cash_before_tax': 9146119300,
                    'tax_paid': -1418822084,
                    'net_operating_cash': 7727297216,
                },
                'INVESTING': {
                    'purchase_investments': -5280023339,
                    'sale_investments': 870366607,
                    'purchase_ppe': -257358308,
                    'sale_ppe': 1115055,
                    'purchase_intangibles': -3265388,
                    'net_investing_cash': -2943232978,
                },
                'FINANCING': {
                    'issue_debt_securities': 856783000,
                    'dividends_paid': -415997815,
                    'net_financing_cash': 22181348,
                },
                'SUMMARY': {
                    'net_change_cash': 4806245587,
                    'cash_beginning': 9163408289,
                    'cash_ending': 14024363708,
                }
            },
            '079-080': {
                'OPERATING': {
                    'interest_received': 19296252417,
                    'fees_received': 1347521410,
                    'other_receipts': 248148117,
                    'interest_paid': -1424468956,
                    'fees_paid': -271927310,
                    'employee_payments': -2131745283,
                    'other_payments': -752371893,
                    'operating_cash_before_changes': 3489187898,
                    'change_nrb': -2828762170,
                    'change_placements': -3105475000,
                    'change_loans_bfis': 1503246596,
                    'change_loans_customers': -15308065704,
                    'change_other_assets': -199915231,
                    'change_due_bfis': 486200478,
                    'change_due_nrb': -2912254078,
                    'change_deposits': 25268622161,
                    'change_borrowings': 86105383,
                    'change_other_liabilities': -3320899007,
                    'operating_cash_before_tax': 3157991326,
                    'tax_paid': -1403109670,
                    'net_operating_cash': 1754881655,
                },
                'INVESTING': {
                    'purchase_investments': -3749250370,
                    'purchase_ppe': -29103089,
                    'sale_ppe': 34171530,
                    'purchase_intangibles': -15702835,
                    'net_investing_cash': -1283313850,
                },
                'FINANCING': {
                    'issue_debt_securities': 2277985000,
                    'dividends_paid': -727064471,
                    'net_financing_cash': 856493230,
                },
                'SUMMARY': {
                    'net_change_cash': 1328061035,
                    'cash_beginning': 14024363708,
                    'cash_ending': 15378247980,
                }
            },
            '081-082': {
                'OPERATING': {
                    'interest_received': 17539846528,
                    'fees_received': 1877808633,
                    'other_receipts': 533733714,
                    'interest_paid': -11265806127,
                    'fees_paid': -347312052,
                    'employee_payments': -2495178187,
                    'other_payments': -908892793,
                    'operating_cash_before_changes': 4934199716,
                    'change_nrb': -23533096405,
                    'change_placements': -1369581905,
                    'change_loans_bfis': -2134954359,
                    'change_loans_customers': -35380284116,
                    'change_other_assets': 240323643,
                    'change_due_bfis': 15942349,
                    'change_deposits': 66586621055,
                    'change_other_liabilities': -7793481830,
                    'operating_cash_before_tax': 1565688148,
                    'tax_paid': -2434229296,
                    'net_operating_cash': -868541148,
                },
                'INVESTING': {
                    'purchase_investments': -5419188819,
                    'purchase_ppe': -600176875,
                    'sale_ppe': 607886,
                    'purchase_intangibles': -181082555,
                    'purchase_investment_property': -42001811,
                    'sale_investment_property': 60667894,
                    'net_investing_cash': -2645751450,
                },
                'FINANCING': {
                    'issue_debt_securities': 3000000000,
                    'dividends_paid': -694908816,
                    'net_financing_cash': 1822080587,
                },
                'SUMMARY': {
                    'net_change_cash': -1692212010,
                    'cash_beginning': 8412011302,
                    'cash_ending': 6720639482,
                }
            }
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

            # Prepare cash flow JSON
            cash_flow = {}
            if fiscal_year in cash_flow_data:
                cf_data = cash_flow_data[fiscal_year]
                for section_key, section_data in cf_data.items():
                    cash_flow[section_key] = {}
                    for field_key, value in section_data.items():
                        if value is not None:
                            cash_flow[section_key][field_key] = value

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
                ticker='EBL',
                fiscal_year=fiscal_year,
                report_type='ANNUAL',
                quarter=None,
                defaults={
                    'is_audited': True,
                    'report_template': 'BANK',
                    'balance_sheet': balance_sheet,
                    'profit_loss': profit_loss,
                    'cash_flow': cash_flow if cash_flow else None,
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
            f'\n✓ Successfully processed {len(financial_data)} financial reports for EBL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
