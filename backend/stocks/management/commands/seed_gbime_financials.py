from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds GBIME annual financial reports from FY 072-073 to 081-082'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding GBIME financial data...')

        # Ensure GBIME company exists
        company, created = Company.objects.get_or_create(
            symbol='GBIME',
            defaults={
                'name': 'Global IME Bank Limited',
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
                    'cash_equivalent': 7951720437,
                    'due_from_nrb': 5436424014,
                    'placement_bfis': 1626073355,
                    'derivative_assets': 64905009,
                    'trading_assets': None,
                    'loans_bfis': 2175502166,
                    'loans_customers': 57363187377,
                    'investment_securities': 11752068999,
                    'current_tax_assets': 645646478,
                    'subsidiaries': 60000000,
                    'associates': 44000000,
                    'investment_property': 146707979,
                    'property_equipment': 934939965,
                    'intangible_assets': 31262121,
                    'deferred_tax_assets': None,
                    'other_assets': 450126778,
                    'total_assets': 88682564668,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3683919798,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 73398997418,
                    'borrowings': None,
                    'current_tax_liabilities': 597876049,
                    'provisions': None,
                    'deferred_tax_liabilities': 3115971,
                    'other_liabilities': 1653428460,
                    'debt_securities': 400000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 79737376696,
                },
                'EQUITY': {
                    'share_capital': 6164267536,
                    'share_premium': None,
                    'retained_earnings': 1129702776,
                    'reserves_reserves': 1651256660,
                    'total_equity': 8945226972,
                    'total_liabilities_equity': 88682564668,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 9364024369,
                    'due_from_nrb': 14809251159,
                    'placement_bfis': 572623011,
                    'derivative_assets': 99487367,
                    'trading_assets': None,
                    'loans_bfis': 2331288696,
                    'loans_customers': 77135881061,
                    'investment_securities': 10154592358,
                    'current_tax_assets': 951113247,
                    'subsidiaries': 219775000,
                    'associates': 263837500,
                    'investment_property': 144690079,
                    'property_equipment': 1030664732,
                    'intangible_assets': 28731164,
                    'deferred_tax_assets': 907696,
                    'other_assets': 787077429,
                    'total_assets': 117894000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1738945338,
                    'due_to_nrb': 39376400,
                    'derivative_liabilities': None,
                    'deposits_customers': 100172000000,
                    'borrowings': None,
                    'current_tax_liabilities': 889367811,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2278282871,
                    'debt_securities': 400000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 105518000000,
                },
                'EQUITY': {
                    'share_capital': 8080341661,
                    'share_premium': None,
                    'retained_earnings': 1957821861,
                    'reserves_reserves': 2338269656,
                    'total_equity': 12376433178,
                    'total_liabilities_equity': 117894000000,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 8027502157,
                    'due_from_nrb': 4768987025,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 3474259480,
                    'loans_customers': 88878095645,
                    'investment_securities': 16320652832,
                    'current_tax_assets': 1010327239,
                    'subsidiaries': 219775000,
                    'associates': 298057200,
                    'investment_property': 91917079,
                    'property_equipment': 1324470731,
                    'intangible_assets': 31946435,
                    'deferred_tax_assets': 177846130,
                    'other_assets': 1223595394,
                    'total_assets': 125847000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1659926258,
                    'due_to_nrb': 1034648590,
                    'derivative_liabilities': 45256669,
                    'deposits_customers': 104851000000,
                    'borrowings': None,
                    'current_tax_liabilities': 948515777,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3329896365,
                    'debt_securities': 400000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 112269000000,
                },
                'EQUITY': {
                    'share_capital': 8888375827,
                    'share_premium': None,
                    'retained_earnings': 1460832125,
                    'reserves_reserves': 3229470345,
                    'total_equity': 13578678296,
                    'total_liabilities_equity': 125847000000,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 11531556889,
                    'due_from_nrb': 5217312678,
                    'placement_bfis': None,
                    'derivative_assets': 4112517152,
                    'trading_assets': None,
                    'loans_bfis': 4054633604,
                    'loans_customers': 108978000000,
                    'investment_securities': 13153151992,
                    'current_tax_assets': 1259701665,
                    'subsidiaries': 219775000,
                    'associates': 319577861,
                    'investment_property': 118685464,
                    'property_equipment': 1373573734,
                    'intangible_assets': 28288609,
                    'deferred_tax_assets': 212078419,
                    'other_assets': 1075101633,
                    'total_assets': 151654000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4410876030,
                    'due_to_nrb': 1231800211,
                    'derivative_liabilities': 3879901668,
                    'deposits_customers': 120088000000,
                    'borrowings': None,
                    'current_tax_liabilities': 1202570465,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3011351016,
                    'debt_securities': 1496452596,
                    'subordinated_liabilities': None,
                    'total_liabilities': 135321000000,
                },
                'EQUITY': {
                    'share_capital': 10310515959,
                    'share_premium': None,
                    'retained_earnings': 2663622463,
                    'reserves_reserves': 3358031915,
                    'total_equity': 16332170337,
                    'total_liabilities_equity': 151654000000,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 20083658794,
                    'due_from_nrb': 11775494215,
                    'placement_bfis': None,
                    'derivative_assets': 8876123504,
                    'trading_assets': None,
                    'loans_bfis': 7672036520,
                    'loans_customers': 190337000000,
                    'investment_securities': 26401401393,
                    'current_tax_assets': 1639870182,
                    'subsidiaries': 557095250,
                    'associates': 404222561,
                    'investment_property': 335304055,
                    'property_equipment': 2543213440,
                    'intangible_assets': 240269800,
                    'deferred_tax_assets': 281572951,
                    'other_assets': 2729475798,
                    'total_assets': 273877000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 14327698147,
                    'due_to_nrb': 1339361371,
                    'derivative_liabilities': 8773443817,
                    'deposits_customers': 212315000000,
                    'borrowings': 2404000000,
                    'current_tax_liabilities': 1294604441,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3090637007,
                    'debt_securities': 1497064851,
                    'subordinated_liabilities': None,
                    'total_liabilities': 245042000000,
                },
                'EQUITY': {
                    'share_capital': 18975879857,
                    'share_premium': 5393490,
                    'retained_earnings': 1673609973,
                    'reserves_reserves': 8179513038,
                    'total_equity': 28834396358,
                    'total_liabilities_equity': 273877000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 15593942410,
                    'due_from_nrb': 25336114039,
                    'placement_bfis': None,
                    'derivative_assets': 5663649824,
                    'trading_assets': None,
                    'loans_bfis': 10367176716,
                    'loans_customers': 228651000000,
                    'investment_securities': 48901734964,
                    'current_tax_assets': 2232790396,
                    'subsidiaries': 370695250,
                    'associates': 644186910,
                    'investment_property': 354648945,
                    'property_equipment': 3252012205,
                    'intangible_assets': 239743409,
                    'deferred_tax_assets': 279385865,
                    'other_assets': 3535752722,
                    'total_assets': 345423000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 14914792251,
                    'due_to_nrb': 10893998526,
                    'derivative_liabilities': 5440370187,
                    'deposits_customers': 268434000000,
                    'borrowings': 2371769589,
                    'current_tax_liabilities': 1845212017,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 4310912217,
                    'debt_securities': 4491996856,
                    'subordinated_liabilities': None,
                    'total_liabilities': 312703000000,
                },
                'EQUITY': {
                    'share_capital': 21632503035,
                    'share_premium': None,
                    'retained_earnings': 2990203516,
                    'reserves_reserves': 8097710384,
                    'total_equity': 32720416935,
                    'total_liabilities_equity': 345423000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 18221952024,
                    'due_from_nrb': 11930868071,
                    'placement_bfis': None,
                    'derivative_assets': 1265935824,
                    'trading_assets': None,
                    'loans_bfis': 10751322217,
                    'loans_customers': 258087531601,
                    'investment_securities': 46513511373,
                    'current_tax_assets': 2238645152,
                    'subsidiaries': 370695250,
                    'associates': 652916735,
                    'investment_property': 559448275,
                    'property_equipment': 5884766979,
                    'intangible_assets': 495782678,
                    'deferred_tax_assets': 180132467,
                    'other_assets': 3383711824,
                    'total_assets': 360537220470,
                },
                'LIABILITIES': {
                    'due_to_bfis': 9594870797,
                    'due_to_nrb': 14438907756,
                    'derivative_liabilities': 1271009520,
                    'deposits_customers': 276964909623,
                    'borrowings': 5747233648,
                    'current_tax_liabilities': 2203840353,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 8084119351,
                    'debt_securities': 4492869348,
                    'subordinated_liabilities': None,
                    'total_liabilities': 322797760397,
                },
                'EQUITY': {
                    'share_capital': 23795753339,
                    'share_premium': None,
                    'retained_earnings': 3239226171,
                    'reserves_reserves': 10704480563,
                    'total_equity': 37739460073,
                    'total_liabilities_equity': 360537220470,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 28531853793,
                    'due_from_nrb': 18649052888,
                    'placement_bfis': 668727450,
                    'derivative_assets': 996239429,
                    'trading_assets': None,
                    'loans_bfis': 13660224854,
                    'loans_customers': 354466748244,
                    'investment_securities': 87591673563,
                    'current_tax_assets': 3379899906,
                    'subsidiaries': 650695250,
                    'associates': 1840164899,
                    'investment_property': 1733323553,
                    'property_equipment': 7740931938,
                    'intangible_assets': 905684124,
                    'deferred_tax_assets': 16633758,
                    'other_assets': 6050709293,
                    'total_assets': 526882562942,
                },
                'LIABILITIES': {
                    'due_to_bfis': 13023623863,
                    'due_to_nrb': 470715561,
                    'derivative_liabilities': 946946972,
                    'deposits_customers': 426325446161,
                    'borrowings': 3282545590,
                    'current_tax_liabilities': 2788102452,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 8809882484,
                    'debt_securities': 12181589400,
                    'subordinated_liabilities': None,
                    'total_liabilities': 467828852483,
                },
                'EQUITY': {
                    'share_capital': 35771059655,
                    'share_premium': None,
                    'retained_earnings': 3243361568,
                    'reserves_reserves': 20039289236,
                    'total_equity': 59053710459,
                    'total_liabilities_equity': 526882562942,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 49795637083,
                    'due_from_nrb': 21314921137,
                    'placement_bfis': None,
                    'derivative_assets': 4525346887,
                    'trading_assets': None,
                    'loans_bfis': 13763656546,
                    'loans_customers': 369424519435,
                    'investment_securities': 121300899081,
                    'current_tax_assets': 2449279483,
                    'subsidiaries': 728395250,
                    'associates': 1372623033,
                    'investment_property': 4847527889,
                    'property_equipment': 8028728790,
                    'intangible_assets': 888966880,
                    'deferred_tax_assets': None,
                    'other_assets': 6077615580,
                    'total_assets': 604518117074,
                },
                'LIABILITIES': {
                    'due_to_bfis': 17433530258,
                    'due_to_nrb': 373324105,
                    'derivative_liabilities': 4516341578,
                    'deposits_customers': 487455854812,
                    'borrowings': 12100951389,
                    'current_tax_liabilities': 2363652248,
                    'provisions': None,
                    'deferred_tax_liabilities': 521776187,
                    'other_liabilities': 7660881745,
                    'debt_securities': 10684657109,
                    'subordinated_liabilities': None,
                    'total_liabilities': 543110969431,
                },
                'EQUITY': {
                    'share_capital': 36128770252,
                    'share_premium': None,
                    'retained_earnings': 506718018,
                    'reserves_reserves': 24771659373,
                    'total_equity': 61407147643,
                    'total_liabilities_equity': 604518117074,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 52688974287,
                    'due_from_nrb': 22144468521,
                    'placement_bfis': None,
                    'derivative_assets': 11071926976,
                    'trading_assets': None,
                    'loans_bfis': 15787163343,
                    'loans_customers': 410113933500,
                    'investment_securities': 148805835221,
                    'current_tax_assets': 2441471189,
                    'subsidiaries': 728395250,
                    'associates': 1395771273,
                    'investment_property': 6056160771,
                    'property_equipment': 8264147405,
                    'intangible_assets': 865927941,
                    'deferred_tax_assets': None,
                    'other_assets': 7716222322,
                    'total_assets': 688080397999,
                },
                'LIABILITIES': {
                    'due_to_bfis': 24423550333,
                    'due_to_nrb': 331843649,
                    'derivative_liabilities': 11072389849,
                    'deposits_customers': 550628587849,
                    'borrowings': 12416419704,
                    'current_tax_liabilities': 2628672188,
                    'provisions': None,
                    'deferred_tax_liabilities': 125131567,
                    'other_liabilities': 9139078797,
                    'debt_securities': 10687316510,
                    'subordinated_liabilities': None,
                    'total_liabilities': 621452990514,
                },
                'EQUITY': {
                    'share_capital': 38115852616,
                    'share_premium': None,
                    'retained_earnings': 4054879099,
                    'reserves_reserves': 24456675770,
                    'total_equity': 66627407485,
                    'total_liabilities_equity': 688080397999,
                }
            }
        }

        # P&L Data (FY 072-073 to 081-082)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 4988276774,
                    'interest_expense': 2098723038,
                    'net_interest_income': 2889553736,
                    'total_operating_income': 3945960802,
                },
                'EXPENSES': {
                    'personnel_expenses': 658954813,
                    'operating_profit': 1850339591,
                    'net_profit': 1382223998,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 7463643573,
                    'interest_expense': 3799262121,
                    'net_interest_income': 3664381452,
                    'fee_income': 866510173,
                    'fee_expense': 164616955,
                    'net_fee_income': 701893217,
                    'net_int_fee_income': 4366274669,
                    'trading_income': 230633246,
                    'other_operating_income': 151697777,
                    'total_operating_income': 4748605692,
                },
                'EXPENSES': {
                    'impairment_charge': -18501862,
                    'personnel_expenses': 1073472925,
                    'other_operating_expenses': 602115702,
                    'depreciation': 139865680,
                    'operating_profit': 2951653247,
                    'non_operating_income': 17073242,
                    'pbt': 2968726489,
                    'tax': 907487003,
                    'net_profit': 2061239486,
                },
                'REGULATORY': {
                    'cd_ratio': 79.30,
                    'core_capital': 10.23,
                    'supplementary_capital': 1.14,
                    'capital_fund': 11.37,
                    'liquidity_crr': 33.54,
                    'npl_ratio': 1.60,
                    'spread': 3.36,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 11481732049,
                    'interest_expense': 7604848094,
                    'net_interest_income': 3876883954,
                    'fee_income': 933457252,
                    'fee_expense': 174778233,
                    'net_fee_income': 758679018,
                    'net_int_fee_income': 4635562973,
                    'trading_income': 261961095,
                    'other_operating_income': 198163937,
                    'total_operating_income': 5095688005,
                },
                'EXPENSES': {
                    'impairment_charge': -289835348,
                    'personnel_expenses': 1314224299,
                    'other_operating_expenses': 766481696,
                    'depreciation': 243744981,
                    'operating_profit': 3061072377,
                    'non_operating_income': 1888454,
                    'non_operating_expense': 150984395,
                    'pbt': 2911976436,
                    'tax': 810613286,
                    'net_profit': 2101363149,
                },
                'REGULATORY': {
                    'cd_ratio': 84.70,
                    'core_capital': 10.32,
                    'supplementary_capital': 1.15,
                    'capital_fund': 11.47,
                    'liquidity_crr': 25.34,
                    'npl_ratio': 0.77,
                    'spread': 4.86,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 13530884797,
                    'interest_expense': 8288538779,
                    'net_interest_income': 5242346018,
                    'fee_income': 1181096127,
                    'fee_expense': 216433567,
                    'net_fee_income': 964662560,
                    'net_int_fee_income': 6207008578,
                    'trading_income': 412125157,
                    'other_operating_income': 163057647,
                    'total_operating_income': 6782191382,
                },
                'EXPENSES': {
                    'impairment_charge': 198187082,
                    'personnel_expenses': 1579661879,
                    'other_operating_expenses': 859409263,
                    'depreciation': 238304434,
                    'operating_profit': 3906628724,
                    'non_operating_income': 27289531,
                    'pbt': 3933918255,
                    'tax': 1171964588,
                    'net_profit': 2761953667,
                },
                'REGULATORY': {
                    'cd_ratio': 91.62,
                    'core_capital': 10.56,
                    'supplementary_capital': 1.75,
                    'capital_fund': 12.31,
                    'liquidity_crr': 22.13,
                    'npl_ratio': 0.55,
                    'spread': 4.47,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 20489400668,
                    'interest_expense': 12267387871,
                    'net_interest_income': 8222012797,
                    'fee_income': 1472135345,
                    'fee_expense': 242005492,
                    'net_fee_income': 1230129853,
                    'net_int_fee_income': 9452142650,
                    'trading_income': 579515071,
                    'other_operating_income': 196813300,
                    'total_operating_income': 10228471021,
                },
                'EXPENSES': {
                    'impairment_charge': 1954426612,
                    'personnel_expenses': 2474636608,
                    'other_operating_expenses': 1248828973,
                    'depreciation': 304121934,
                    'operating_profit': 4246456895,
                    'non_operating_income': 641568,
                    'non_operating_expense': 79210292,
                    'pbt': 4167888171,
                    'tax': 1259223804,
                    'net_profit': 2908664367,
                },
                'REGULATORY': {
                    'cd_ratio': 88.25,
                    'core_capital': 10.81,
                    'supplementary_capital': 1.67,
                    'capital_fund': 12.48,
                    'liquidity_crr': 24.58,
                    'npl_ratio': 1.76,
                    'spread': 5.12,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 21693582784,
                    'interest_expense': 12554455241,
                    'net_interest_income': 9139127543,
                    'fee_income': 1914286460,
                    'fee_expense': 380249905,
                    'net_fee_income': 1534036555,
                    'net_int_fee_income': 10673164098,
                    'trading_income': 666455087,
                    'other_operating_income': 611276969,
                    'total_operating_income': 11950896155,
                },
                'EXPENSES': {
                    'impairment_charge': 1125258433,
                    'personnel_expenses': 3164815841,
                    'other_operating_expenses': 1369428420,
                    'depreciation': 333862753,
                    'operating_profit': 5957530707,
                    'non_operating_income': 10547342,
                    'pbt': 5968078049,
                    'tax': 1802926209,
                    'net_profit': 4165151840,
                },
                'REGULATORY': {
                    'cd_ratio': 85.59,
                    'core_capital': 10.55,
                    'supplementary_capital': 2.65,
                    'capital_fund': 13.20,
                    'liquidity_crr': 29.89,
                    'npl_ratio': 1.41,
                    'spread': 3.49,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 29058367013,
                    'interest_expense': 18768811399,
                    'net_interest_income': 10289555615,
                    'fee_income': 2217827855,
                    'fee_expense': 535516508,
                    'net_fee_income': 1682311347,
                    'net_int_fee_income': 11971866961,
                    'trading_income': 594205883,
                    'other_operating_income': 472847798,
                    'total_operating_income': 13038920643,
                },
                'EXPENSES': {
                    'impairment_charge': 466431088,
                    'personnel_expenses': 3290725813,
                    'other_operating_expenses': 1446858511,
                    'depreciation': 647131708,
                    'operating_profit': 7187773523,
                    'non_operating_income': 3268779,
                    'non_operating_expense': 164457354,
                    'pbt': 7026584948,
                    'tax': 2067360204,
                    'net_profit': 4959224743,
                },
                'REGULATORY': {
                    'cd_ratio': 0.95,
                    'core_capital': 0.10,
                    'supplementary_capital': 0.10,
                    'capital_fund': 0.13,
                    'liquidity_crr': 0.24,
                    'npl_ratio': 0.01,
                    'spread': 0.04,
                    'total_employees': 2966,
                }
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 48210079805,
                    'interest_expense': 31103088791,
                    'net_interest_income': 17106991014,
                    'fee_income': 2744142023,
                    'fee_expense': 683570414,
                    'net_fee_income': 2060571609,
                    'net_int_fee_income': 19167562623,
                    'trading_income': 474601196,
                    'other_operating_income': 215026625,
                    'total_operating_income': 19857190444,
                },
                'EXPENSES': {
                    'impairment_charge': 3426139062,
                    'personnel_expenses': 4234417863,
                    'other_operating_expenses': 1875361351,
                    'depreciation': 790774873,
                    'operating_profit': 9530497295,
                    'non_operating_income': 8525937,
                    'non_operating_expense': 273499043,
                    'pbt': 9265524189,
                    'net_profit': 6694357795,
                },
                'REGULATORY': {
                    'cd_ratio': 83.47,
                    'core_capital': 10.92,
                    'supplementary_capital': 2.42,
                    'capital_fund': 13.34,
                    'liquidity_crr': 25.24,
                    'npl_ratio': 3.15,
                    'spread': 4.66,
                    'total_employees': 3677,
                    'branches': 358,
                    'atms': 367,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 51680018941,
                    'interest_expense': 34823692035,
                    'net_interest_income': 16856326906,
                    'fee_income': 3447294523,
                    'fee_expense': 764999768,
                    'net_fee_income': 2682294755,
                    'net_int_fee_income': 19538621661,
                    'trading_income': 580852726,
                    'other_operating_income': 534455988,
                    'total_operating_income': 20653930375,
                },
                'EXPENSES': {
                    'impairment_charge': 3616608492,
                    'personnel_expenses': 4782108008,
                    'other_operating_expenses': 2245000976,
                    'depreciation': 991254520,
                    'operating_profit': 9018958379,
                    'non_operating_income': 7344142,
                    'non_operating_expense': 158912814,
                    'pbt': 8867389707,
                    'net_profit': 6137454261,
                },
                'REGULATORY': {
                    'core_capital': 10.32,
                    'supplementary_capital': 2.07,
                    'capital_fund': 12.39,
                    'liquidity_crr': 37.11,
                    'npl_ratio': 4.17,
                    'spread': 4.19,
                    'total_employees': 3789,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 43930150342,
                    'interest_expense': 27250211285,
                    'net_interest_income': 16679939057,
                    'fee_income': 4187048744,
                    'fee_expense': 965306298,
                    'net_fee_income': 3221742446,
                    'net_int_fee_income': 19901681503,
                    'trading_income': 916893149,
                    'other_operating_income': 430592473,
                    'total_operating_income': 21249167125,
                },
                'EXPENSES': {
                    'impairment_charge': 5976595811,
                    'personnel_expenses': 4691555650,
                    'other_operating_expenses': 2493812259,
                    'depreciation': 854030682,
                    'operating_profit': 7233172723,
                    'non_operating_income': 29782229,
                    'non_operating_expense': 16318895,
                    'pbt': 7246636057,
                    'net_profit': 5076303895,
                },
                'REGULATORY': {
                    'cd_ratio': 76.07,
                    'core_capital': 10.34,
                    'supplementary_capital': 2.31,
                    'capital_fund': 12.65,
                    'npl_ratio': 4.86,
                    'base_rate': 5.76,
                    'spread': 3.87,
                    'total_employees': 3807,
                }
            }
        }

        # Dividend Data (FY 072-073 to 081-082)
        dividend_data = {
            '072-073': {'bonus': 16.00, 'cash': 0.00, 'book_close': '2017-03-20'},
            '073-074': {'bonus': 10.00, 'cash': 10.00, 'book_close': '2017-10-25'},
            '074-075': {'bonus': 16.00, 'cash': 0.00, 'book_close': '2018-12-28'},
            '075-076': {'bonus': 12.75, 'cash': 12.75, 'book_close': '2019-11-07'},
            '076-077': {'bonus': 14.00, 'cash': 2.00, 'book_close': '2020-12-30'},
            '077-078': {'bonus': 10.00, 'cash': 3.50, 'book_close': '2021-11-29'},
            '078-079': {'bonus': 3.00, 'cash': 10.60, 'book_close': '2022-11-23'},
            '079-080': {'bonus': 1.00, 'cash': 8.00, 'book_close': '2023-11-29'},
            '080-081': {'bonus': 5.50, 'cash': 0.00, 'book_close': '2024-11-24'},
            '081-082': {'bonus': 0.00, 'cash': 8.00, 'book_close': '2025-11-02'},
        }

        # Cash Flow Data (FY 077-078 to 081-082)
        cash_flow_data = {
            '077-078': {
                'OPERATING': {
                    'interest_received': 20438863025,
                    'fees_received': 1989454446,
                    'other_receipts': 754011688,
                    'interest_paid': -12359594233,
                    'fees_paid': -380249905,
                    'employee_payments': -2757122835,
                    'other_payments': -1372433897,
                    'operating_cash_before_changes': 6312928289,
                    'change_nrb': -13560619825,
                    'change_placements': 0,
                    'change_loans_bfis': -2753689890,
                    'change_loans_customers': -39793661588,
                    'change_other_assets': 2316661333,
                    'change_due_bfis': 587094103,
                    'change_due_nrb': 9554637155,
                    'change_deposits': 56118406543,
                    'change_borrowings': 0,
                    'change_other_liabilities': -2729500884,
                    'operating_cash_before_tax': 63530636917,
                    'tax_paid': 16052255236,
                    'net_operating_cash': -1886853864,
                },
                'INVESTING': {
                    'purchase_investments': -22533913783,
                    'sale_investments': 683586341,
                    'purchase_ppe': -829272923,
                    'sale_ppe': 0,
                    'purchase_intangibles': -30280816,
                    'net_investing_cash': -21180984030,
                },
                'FINANCING': {
                    'issue_debt_securities': 2994253246,
                    'dividends_paid': -446266685,
                    'net_financing_cash': 2452890990,
                },
                'SUMMARY': {
                    'net_change_cash': -4562691668,
                    'cash_beginning': 20083658794,
                    'cash_ending': 15593942410,
                }
            },
            '078-079': {
                'OPERATING': {
                    'interest_received': 26280535393,
                    'fees_received': 2074739467,
                    'other_receipts': 866367485,
                    'interest_paid': -18327046994,
                    'fees_paid': -535516508,
                    'employee_payments': -2905531187,
                    'other_payments': -1448354959,
                    'operating_cash_before_changes': 6005192697,
                    'change_nrb': 13405245969,
                    'change_placements': 0,
                    'change_loans_bfis': -389816850,
                    'change_loans_customers': -29700943977,
                    'change_other_assets': 4350031149,
                    'change_due_bfis': -5319921454,
                    'change_due_nrb': 3544909230,
                    'change_deposits': 8531118020,
                    'change_borrowings': 3375464059,
                    'change_other_liabilities': -422223262,
                    'operating_cash_before_tax': 3355169872,
                    'tax_paid': -1812759177,
                    'net_operating_cash': 1542410695,
                },
                'INVESTING': {
                    'purchase_investments': 2488395309,
                    'sale_investments': 327542518,
                    'purchase_ppe': -2602682157,
                    'purchase_intangibles': -21705690,
                    'net_investing_cash': 2138680894,
                },
                'FINANCING': {
                    'dividends_paid': -724097591,
                    'net_financing_cash': -1131454962,
                },
                'SUMMARY': {
                    'net_change_cash': 2549636627,
                    'cash_beginning': 15593942410,
                    'cash_ending': 18221952024,
                }
            },
            '079-080': {
                'OPERATING': {
                    'interest_received': 40203453374,
                    'fees_received': 2744142023,
                    'other_receipts': 580355465,
                    'interest_paid': -29981982451,
                    'fees_paid': -29981982451,
                    'employee_payments': -3104166022,
                    'other_payments': -2010727579,
                    'operating_cash_before_changes': 7747504396,
                    'change_nrb': -6718184817,
                    'change_placements': -668727450,
                    'change_loans_bfis': 616461123,
                    'change_loans_customers': 5968290678,
                    'change_other_assets': -2321590691,
                    'change_due_bfis': 2650154364,
                    'change_due_nrb': -13968192195,
                    'change_deposits': 36688215473,
                    'change_borrowings': -3778688057,
                    'change_other_liabilities': -129850370,
                    'operating_cash_before_tax': 26085392454,
                    'tax_paid': -3345095106,
                    'net_operating_cash': 22740297348,
                },
                'INVESTING': {
                    'purchase_investments': -24504862541,
                    'purchase_ppe': -540429386,
                    'purchase_intangibles': -43208779,
                    'purchase_investment_property': -1171326234,
                    'net_investing_cash': -22380325428,
                },
                'FINANCING': {
                    'issue_debt_securities': 4991536157,
                    'dividends_paid': -2521057202,
                    'other_financing_receipts': 8389904270,
                    'net_financing_cash': 9955315081,
                },
                'SUMMARY': {
                    'net_change_cash': 10315287001,
                    'cash_beginning': 18198066315,
                    'cash_ending': 28531853793,
                }
            },
            '080-081': {
                'OPERATING': {
                    'interest_received': 42532826236,
                    'fees_received': 3447294523,
                    'other_receipts': 698631864,
                    'interest_paid': -33069454353,
                    'fees_paid': -764999768,
                    'employee_payments': -5906121353,
                    'other_payments': -2403913790,
                    'operating_cash_before_changes': 4534263359,
                    'change_nrb': -2665868249,
                    'change_placements': 668727450,
                    'change_loans_bfis': -90814797,
                    'change_loans_customers': -16552628796,
                    'change_other_assets': -3592229111,
                    'change_due_bfis': 4409906395,
                    'change_due_nrb': -97391456,
                    'change_deposits': 61130408651,
                    'change_borrowings': 8818405799,
                    'change_other_liabilities': 3090654647,
                    'net_operating_cash': 56480418143,
                },
                'INVESTING': {
                    'purchase_investments': -33047357884,
                    'sale_investments': 316199057,
                    'purchase_ppe': -1233567828,
                    'purchase_intangibles': -23256857,
                    'purchase_investment_property': -3113715747,
                    'net_investing_cash': -29631652599,
                },
                'FINANCING': {
                    'dividends_paid': -2513621327,
                    'net_financing_cash': -5589187269,
                },
                'SUMMARY': {
                    'net_change_cash': 21259578274,
                    'cash_beginning': 28531853794,
                    'cash_ending': 49795637083,
                }
            },
            '081-082': {
                'OPERATING': {
                    'interest_received': 38843129481,
                    'fees_received': 4187982869,
                    'other_receipts': 1187795782,
                    'interest_paid': -25148053950,
                    'fees_paid': -965306298,
                    'employee_payments': -4750819910,
                    'other_payments': -2510131154,
                    'operating_cash_before_changes': 10844596820,
                    'change_nrb': -829547384,
                    'change_loans_bfis': -2016121199,
                    'change_loans_customers': -48462917308,
                    'change_other_assets': -8185186834,
                    'change_due_bfis': 6990020075,
                    'change_due_nrb': -41480456,
                    'change_deposits': 63172733037,
                    'change_borrowings': 315468315,
                    'change_other_liabilities': 8056576807,
                    'net_operating_cash': 27488297920,
                },
                'INVESTING': {
                    'purchase_investments': -27237121233,
                    'sale_investments': 14987789,
                    'purchase_ppe': -1048918463,
                    'purchase_intangibles': -16966565,
                    'purchase_investment_property': -1160060418,
                    'net_investing_cash': -22542686533,
                },
                'FINANCING': {
                    'dividends_paid': -2063499212,
                    'net_financing_cash': -2063499212,
                },
                'SUMMARY': {
                    'net_change_cash': 2882112174,
                    'cash_beginning': 8412011302,
                    'cash_ending': 52688974287,
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
                ticker='GBIME',
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
            f'\n✓ Successfully processed {len(financial_data)} financial reports for GBIME'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
