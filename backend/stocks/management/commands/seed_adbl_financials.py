from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport
from decimal import Decimal


class Command(BaseCommand):
    help = 'Seeds ADBL financial reports for FY 072-073 to 081-082'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding ADBL financial data...')
        
        # Ensure ADBL company exists
        company, created = Company.objects.get_or_create(
            symbol='ADBL',
            defaults={
                'name': 'Agricultural Development Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created company: {company.symbol}'))
        else:
            self.stdout.write(f'Company {company.symbol} already exists')

        # ADBL Balance Sheet Data (FY 072-073 to 081-082)
        # All values in Rs
        financial_data = {
            '072/073': {
                'ASSETS': {
                    'cash_equivalent': 13689269833,
                    'due_from_nrb': 4711222554,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 84080371550,
                    'investment_securities': 7340593852,
                    'current_tax_assets': 9522562,
                    'subsidiaries': 28840000,
                    'associates': 69384000,
                    'investment_property': 192827508,
                    'property_equipment': 1171265297,
                    'intangible_assets': 4881100,
                    'deferred_tax_assets': None,
                    'other_assets': 2613493285,
                    'total_assets': 113912000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 450276480,
                    'due_to_nrb': 46299160,
                    'derivative_liabilities': None,
                    'deposits_customers': 86936878467,
                    'borrowings': 514439855,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 248288140,
                    'other_liabilities': 3880722287,
                    'debt_securities': 1380000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 92456904389,
                },
                'EQUITY': {
                    'share_capital': 10374400000,
                    'share_premium': None,
                    'retained_earnings': 3158349450,
                    'reserves_reserves': 6922017702,
                    'total_equity': 20454767152,
                    'total_liabilities_equity': 113912000000,
                }
            },
            '073/074': {
                'ASSETS': {
                    'cash_equivalent': 12252208074,
                    'due_from_nrb': 9929595625,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 93184410155,
                    'investment_securities': 9568494645,
                    'current_tax_assets': 67138834,
                    'subsidiaries': 28840000,
                    'associates': 69384000,
                    'investment_property': 312104309,
                    'property_equipment': 1108144115,
                    'intangible_assets': 3660825,
                    'deferred_tax_assets': None,
                    'other_assets': 1766206174,
                    'total_assets': 128290000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 300932693,
                    'due_to_nrb': 203474720,
                    'derivative_liabilities': None,
                    'deposits_customers': 99515339449,
                    'borrowings': 464458672,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 26526233,
                    'other_liabilities': 3265123292,
                    'debt_securities': 920000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 104696000000,
                },
                'EQUITY': {
                    'share_capital': 12520392000,
                    'share_premium': 540826597,
                    'retained_earnings': 3412354677,
                    'reserves_reserves': 7120758424,
                    'total_equity': 23594331698,
                    'total_liabilities_equity': 128290000000,
                }
            },
            '074/075': {
                'ASSETS': {
                    'cash_equivalent': 11227273792,
                    'due_from_nrb': 8270666878,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': 495000000,
                    'loans_customers': 100030000000,
                    'investment_securities': 12246645443,
                    'current_tax_assets': None,
                    'subsidiaries': 28840000,
                    'associates': 69384000,
                    'investment_property': 240313081,
                    'property_equipment': 1213597403,
                    'intangible_assets': 50011726,
                    'deferred_tax_assets': None,
                    'other_assets': 1547770105,
                    'total_assets': 135420000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 551886896,
                    'due_to_nrb': 195156104,
                    'derivative_liabilities': None,
                    'deposits_customers': 104216000000,
                    'borrowings': 360447613,
                    'current_tax_liabilities': 156230258,
                    'provisions': None,
                    'deferred_tax_liabilities': 139362454,
                    'other_liabilities': 2881767061,
                    'debt_securities': 460000000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 108961000000,
                },
                'EQUITY': {
                    'share_capital': 13937928000,
                    'share_premium': None,
                    'retained_earnings': 2598638414,
                    'reserves_reserves': 9921738272,
                    'total_equity': 26458304686,
                    'total_liabilities_equity': 135420000000,
                }
            },
            '075/076': {
                'ASSETS': {
                    'cash_equivalent': 11500460234,
                    'due_from_nrb': 4993659833,
                    'placement_bfis': 2858700000,
                    'derivative_assets': 118552200,
                    'trading_assets': None,
                    'loans_bfis': 1285268937,
                    'loans_customers': 108807000000,
                    'investment_securities': 16846608520,
                    'current_tax_assets': 206423340,
                    'subsidiaries': 28840000,
                    'associates': 69384000,
                    'investment_property': 258423496,
                    'property_equipment': 1264192467,
                    'intangible_assets': 69398746,
                    'deferred_tax_assets': None,
                    'other_assets': 3151122443,
                    'total_assets': 151458000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 478369715,
                    'due_to_nrb': 38424211,
                    'derivative_liabilities': None,
                    'deposits_customers': 118885000000,
                    'borrowings': 60917808,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 113536328,
                    'other_liabilities': 3528827097,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 123105000000,
                },
                'EQUITY': {
                    'share_capital': 14448240960,
                    'share_premium': None,
                    'retained_earnings': 3422037527,
                    'reserves_reserves': 10482454493,
                    'total_equity': 28352732981,
                    'total_liabilities_equity': 151458000000,
                }
            },
            '076/077': {
                'ASSETS': {
                    'cash_equivalent': 8489432167,
                    'due_from_nrb': 12567111166,
                    'placement_bfis': 5007605980,
                    'derivative_assets': 133762200,
                    'trading_assets': 17422939,
                    'loans_bfis': 1137559451,
                    'loans_customers': 121849000000,
                    'investment_securities': 24422064121,
                    'current_tax_assets': 897717791,
                    'subsidiaries': 28840000,
                    'associates': 69384000,
                    'investment_property': 220925902,
                    'property_equipment': 1293544827,
                    'intangible_assets': 289802789,
                    'deferred_tax_assets': None,
                    'other_assets': 2895650624,
                    'total_assets': 179320000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 103132518,
                    'due_to_nrb': 9670494,
                    'derivative_liabilities': None,
                    'deposits_customers': 143629000000,
                    'borrowings': 10937376,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 177084440,
                    'other_liabilities': 4425332468,
                    'debt_securities': 2494649108,
                    'subordinated_liabilities': None,
                    'total_liabilities': 150849000000,
                },
                'EQUITY': {
                    'share_capital': 14989172698,
                    'share_premium': None,
                    'retained_earnings': 2342124853,
                    'reserves_reserves': 11139589454,
                    'total_equity': 28470887005,
                    'total_liabilities_equity': 179320000000,
                }
            },
            '077/078': {
                'ASSETS': {
                    'cash_equivalent': 10636731923,
                    'due_from_nrb': 9740613308,
                    'placement_bfis': 4117575000,
                    'derivative_assets': 70862400,
                    'trading_assets': 1666533703,
                    'loans_bfis': 113668154,
                    'loans_customers': 150598000000,
                    'investment_securities': 37880065618,
                    'current_tax_assets': 1214561127,
                    'subsidiaries': 28840000,
                    'associates': 69384000,
                    'investment_property': 198284843,
                    'property_equipment': 1480615090,
                    'intangible_assets': 262005147,
                    'deferred_tax_assets': None,
                    'other_assets': 4362253111,
                    'total_assets': 222440000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 175324116,
                    'due_to_nrb': 8716363161,
                    'derivative_liabilities': None,
                    'deposits_customers': 162815000000,
                    'borrowings': 538529944,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 327591236,
                    'other_liabilities': 3886280814,
                    'debt_securities': 14476211557,
                    'subordinated_liabilities': None,
                    'total_liabilities': 190935000000,
                },
                'EQUITY': {
                    'share_capital': 16422641802,
                    'share_premium': None,
                    'retained_earnings': 3654511980,
                    'reserves_reserves': 11427963957,
                    'total_equity': 31505117739,
                    'total_liabilities_equity': 222440000000,
                }
            },
            '078/079': {
                'ASSETS': {
                    'cash_equivalent': 6559900767,
                    'due_from_nrb': 6208948746,
                    'placement_bfis': 127900000,
                    'derivative_assets': 103880000,
                    'trading_assets': 1047488978,
                    'loans_bfis': 4123680396,
                    'loans_customers': 173314972381,
                    'investment_securities': 45932116899,
                    'current_tax_assets': 966315760,
                    'subsidiaries': 28840000,
                    'associates': 69384000,
                    'investment_property': 252592246,
                    'property_equipment': 2225084172,
                    'intangible_assets': 229766704,
                    'deferred_tax_assets': 52152028,
                    'other_assets': 4951219859,
                    'total_assets': 246184242937,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7998742407,
                    'due_to_nrb': 9781708310,
                    'derivative_liabilities': None,
                    'deposits_customers': 166590266216,
                    'borrowings': 1777211512,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 6210241991,
                    'debt_securities': 20469037529,
                    'subordinated_liabilities': None,
                    'total_liabilities': 212827207965,
                },
                'EQUITY': {
                    'share_capital': 18620627763,
                    'share_premium': None,
                    'retained_earnings': 3521792308,
                    'reserves_reserves': 11214614901,
                    'total_equity': 33357034971,
                    'total_liabilities_equity': 246184242937,
                }
            },
            '079/080': {
                'ASSETS': {
                    'cash_equivalent': 9462421092,
                    'due_from_nrb': 7096495884,
                    'placement_bfis': None,
                    'derivative_assets': 17588448,
                    'trading_assets': 943652800,
                    'loans_bfis': 4134543000,
                    'loans_customers': 176303568128,
                    'investment_securities': 57411015165,
                    'current_tax_assets': 276706184,
                    'subsidiaries': 28840000,
                    'associates': None,
                    'investment_property': 248649555,
                    'property_equipment': 2291066049,
                    'intangible_assets': 138590074,
                    'deferred_tax_assets': None,
                    'other_assets': 7317842648,
                    'total_assets': 265670979027,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2095919987,
                    'due_to_nrb': 4571178,
                    'derivative_liabilities': None,
                    'deposits_customers': 199486613567,
                    'borrowings': 2136563784,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 484358492,
                    'other_liabilities': 7195768718,
                    'debt_securities': 20473530263,
                    'subordinated_liabilities': None,
                    'total_liabilities': 231877325989,
                },
                'EQUITY': {
                    'share_capital': 18884386078,
                    'share_premium': None,
                    'retained_earnings': 1243168613,
                    'reserves_reserves': 13666098347,
                    'total_equity': 33793653038,
                    'total_liabilities_equity': 265670979027,
                }
            },
            '080/081': {
                'ASSETS': {
                    'cash_equivalent': 5074083242,
                    'due_from_nrb': 15212779452,
                    'placement_bfis': 5214300000,
                    'derivative_assets': 9972912,
                    'trading_assets': 1216149394,
                    'loans_bfis': 3202203613,
                    'loans_customers': 203617049861,
                    'investment_securities': 68611262068,
                    'current_tax_assets': 139134770,
                    'subsidiaries': 29013000,
                    'associates': None,
                    'investment_property': 943089080,
                    'property_equipment': 2238425747,
                    'intangible_assets': 61971324,
                    'deferred_tax_assets': None,
                    'other_assets': 5805998894,
                    'total_assets': 311375433657,
                },
                'LIABILITIES': {
                    'due_to_bfis': 197018769,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 243628658005,
                    'borrowings': 2664573352,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 307423233,
                    'other_liabilities': 7960792205,
                    'debt_securities': 20477020373,
                    'subordinated_liabilities': None,
                    'total_liabilities': 275235485937,
                },
                'EQUITY': {
                    'share_capital': 18884386078,
                    'share_premium': None,
                    'retained_earnings': 2136087574,
                    'reserves_reserves': 15119474068,
                    'total_equity': 36139947720,
                    'total_liabilities_equity': 311375433657,
                }
            },
            '081/082': {
                'ASSETS': {
                    'cash_equivalent': 4620869932,
                    'due_from_nrb': 22803136509,
                    'placement_bfis': 10024031769,
                    'derivative_assets': 11766979,
                    'trading_assets': 1423863106,
                    'loans_bfis': 2900424319,
                    'loans_customers': 212616735256,
                    'investment_securities': 96356593172,
                    'current_tax_assets': 18491920,
                    'subsidiaries': 29013000,
                    'associates': None,
                    'investment_property': 1306220658,
                    'property_equipment': 2447375630,
                    'intangible_assets': 23142168,
                    'deferred_tax_assets': None,
                    'other_assets': 6946527656,
                    'total_assets': 361528192074,
                },
                'LIABILITIES': {
                    'due_to_bfis': 786684697,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 293358979198,
                    'borrowings': 2804657063,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 385035851,
                    'other_liabilities': 5094071709,
                    'debt_securities': 20481846212,
                    'subordinated_liabilities': None,
                    'total_liabilities': 322911274730,
                },
                'EQUITY': {
                    'share_capital': 19287936300,
                    'share_premium': None,
                    'retained_earnings': 2816669319,
                    'reserves_reserves': 16512311725,
                    'total_equity': 38616917344,
                    'total_liabilities_equity': 361528192074,
                }
            },
        }

        # ADBL Profit & Loss Data (FY 072-073 to 081-082)
        profit_loss_data = {
            '072/073': {
                'INCOME': {
                    'interest_income': 9620203330,
                    'interest_expense': 3358872302,
                    'net_interest_income': 6261331028,
                    'total_operating_income': 7423268188,
                },
                'EXPENSES': {
                    'personnel_expenses': 3031500499,
                    'operating_profit': 2187831876,
                    'non_operating_income': 133158631,
                    'pbt': 3451849630,
                    'tax': 987166542,
                    'net_profit': 2464683088,
                },
                'REGULATORY': {
                    'spread': 7.15,
                }
            },
            '073/074': {
                'INCOME': {
                    'interest_income': 11210152686,
                    'interest_expense': 4224871172,
                    'net_interest_income': 6985281514,
                    'fee_income': 939207607,
                    'fee_expense': 3898730,
                    'net_fee_income': 935308877,
                    'net_int_fee_income': 7920590392,
                    'trading_income': 137768271,
                    'other_operating_income': 507409454,
                    'total_operating_income': 8565768117,
                },
                'EXPENSES': {
                    'impairment_charge': 636667048,
                    'net_operating_income': 7929101069,
                    'personnel_expenses': 3210422793,
                    'other_operating_expenses': 686720728,
                    'depreciation': 153777205,
                    'operating_profit': 3878180343,
                    'non_operating_income': 269937252,
                    'non_operating_expense': 3397278,
                    'pbt': 4144720317,
                    'tax': 1171439780,
                    'net_profit': 2973280537,
                },
                'REGULATORY': {
                    'cd_ratio': 92.90,
                    'core_capital': 18.61,
                    'supplementary_capital': 1.80,
                    'capital_fund': 20.41,
                    'liquidity_crr': 31.18,
                    'npl_ratio': 4.60,
                    'base_rate': 11.27,
                    'spread': 5.87,
                    'total_employees': 2632,
                }
            },
            '074/075': {
                'INCOME': {
                    'interest_income': 13603751750,
                    'interest_expense': 6966285982,
                    'net_interest_income': 6637465768,
                    'fee_income': 949765312,
                    'fee_expense': 6055692,
                    'net_fee_income': 943709620,
                    'net_int_fee_income': 7581175387,
                    'trading_income': 188129126,
                    'other_operating_income': 45980244,
                    'total_operating_income': 7815284758,
                },
                'EXPENSES': {
                    'impairment_charge': -822352826,
                    'net_operating_income': 8637637584,
                    'personnel_expenses': 3060562431,
                    'other_operating_expenses': 712317761,
                    'depreciation': 131930099,
                    'operating_profit': 4732827292,
                    'non_operating_income': 235825089,
                    'non_operating_expense': 4320392,
                    'pbt': 4964331989,
                    'tax': 1522008193,
                    'net_profit': 3442323796,
                },
                'REGULATORY': {
                    'cd_ratio': 95.64,
                    'core_capital': 19.28,
                    'supplementary_capital': 0.38,
                    'capital_fund': 19.66,
                    'liquidity_crr': 29.15,
                    'npl_ratio': 3.41,
                    'loan_loss_provision_ratio': 114.87,
                    'cost_of_funds': 7.38,
                    'base_rate': 11.73,
                    'spread': 5.46,
                    'total_employees': 2455,
                }
            },
            '075/076': {
                'INCOME': {
                    'interest_income': 15480122105,
                    'interest_expense': 7865130446,
                    'net_interest_income': 7614991659,
                    'fee_income': 1081481421,
                    'fee_expense': 11012358,
                    'net_fee_income': 1070469063,
                    'net_int_fee_income': 8685460722,
                    'trading_income': 318873266,
                    'other_operating_income': 18897949,
                    'total_operating_income': 9023231937,
                },
                'EXPENSES': {
                    'impairment_charge': -289846558,
                    'net_operating_income': 9313078494,
                    'personnel_expenses': 2928862065,
                    'other_operating_expenses': 876305524,
                    'depreciation': 166192588,
                    'operating_profit': 5341718317,
                    'non_operating_income': 382280672,
                    'pbt': 5723998990,
                    'tax': 1532408354,
                    'net_profit': 4191590635,
                },
                'REGULATORY': {
                    'cd_ratio': 93.62,
                    'core_capital': 19.27,
                    'supplementary_capital': 1.10,
                    'capital_fund': 20.37,
                    'liquidity_crr': 27.20,
                    'npl_ratio': 3.29,
                    'loan_loss_provision_ratio': 81.73,
                    'cost_of_funds': 7.41,
                    'base_rate': 10.58,
                    'spread': 4.68,
                    'total_employees': 2308,
                }
            },
            '076/077': {
                'INCOME': {
                    'interest_income': 15821701198,
                    'interest_expense': 9105579926,
                    'net_interest_income': 6716121272,
                    'fee_income': 1901633659,
                    'fee_expense': 25812969,
                    'net_fee_income': 1875820690,
                    'net_int_fee_income': 8591941962,
                    'trading_income': 392175906,
                    'other_operating_income': 35931079,
                    'total_operating_income': 9020048947,
                },
                'EXPENSES': {
                    'impairment_charge': 517221877,
                    'net_operating_income': 8502827070,
                    'personnel_expenses': 3025470144,
                    'other_operating_expenses': 942161089,
                    'depreciation': 216593059,
                    'operating_profit': 4318602778,
                    'non_operating_income': 81282615,
                    'non_operating_expense': 39480,
                    'pbt': 4399845914,
                    'tax': 1068108339,
                    'net_profit': 3331737575,
                },
                'REGULATORY': {
                    'cd_ratio': 85.84,
                    'core_capital': 16.50,
                    'supplementary_capital': 2.82,
                    'capital_fund': 19.33,
                    'liquidity_crr': 33.98,
                    'npl_ratio': 2.84,
                    'loan_loss_provision_ratio': 121.11,
                    'cost_of_funds': 6.40,
                    'base_rate': 9.26,
                    'spread': 4.44,
                    'total_employees': 2013,
                }
            },
            '077/078': {
                'INCOME': {
                    'interest_income': 15124046104,
                    'interest_expense': 8258328134,
                    'net_interest_income': 6865717970,
                    'fee_income': 1612950236,
                    'fee_expense': 46882573,
                    'net_fee_income': 1566067663,
                    'net_int_fee_income': 8431785633,
                    'trading_income': 994296864,
                    'other_operating_income': 452421584,
                    'total_operating_income': 9878495081,
                },
                'EXPENSES': {
                    'impairment_charge': 121425257,
                    'net_operating_income': 9757069824,
                    'personnel_expenses': 3311387070,
                    'other_operating_expenses': 1132679919,
                    'depreciation': 275686160,
                    'operating_profit': 5037316676,
                    'non_operating_income': 28240916,
                    'non_operating_expense': 3214015,
                    'pbt': 5062343576,
                    'tax': 1534806670,
                    'net_profit': 3527536906,
                },
                'REGULATORY': {
                    'cd_ratio': 92.93,
                    'core_capital': 14.42,
                    'supplementary_capital': 2.53,
                    'capital_fund': 16.94,
                    'liquidity_crr': 36.21,
                    'npl_ratio': 1.88,
                    'base_rate': 7.13,
                    'spread': 4.37,
                    'total_employees': 2402,
                }
            },
            '078/079': {
                'INCOME': {
                    'interest_income': 19582603309,
                    'interest_expense': 11226663800,
                    'net_interest_income': 8355939509,
                    'fee_income': 1464286132,
                    'fee_expense': 56186387,
                    'net_fee_income': 1408099744,
                    'net_int_fee_income': 9764039253,
                    'trading_income': 9232458124,
                    'other_operating_income': 234762916,
                    'total_operating_income': 9766344046,
                },
                'EXPENSES': {
                    'impairment_charge': 992764740,
                    'net_operating_income': 8773579306,
                    'personnel_expenses': 3823916299,
                    'other_operating_expenses': 872306775,
                    'depreciation': 472951148,
                    'operating_profit': 3604405084,
                    'non_operating_income': 87530848,
                    'non_operating_expense': 51546554,
                    'pbt': 3640389377,
                    'tax': 1414623429,
                    'net_profit': 2225765948,
                },
                'REGULATORY': {
                    'spread': 3.94,
                }
            },
            '079/080': {
                'INCOME': {
                    'interest_income': 23948684755,
                    'interest_expense': 15753025751,
                    'net_interest_income': 8195659004,
                    'fee_income': 1371859175,
                    'fee_expense': 213649195,
                    'net_fee_income': 1158209980,
                    'net_int_fee_income': 9353868984,
                    'trading_income': 115521318,
                    'other_operating_income': 131788875,
                    'total_operating_income': 9601179177,
                },
                'EXPENSES': {
                    'impairment_charge': 1458173793,
                    'net_operating_income': 8143005384,
                    'personnel_expenses': 3620726434,
                    'other_operating_expenses': 995690036,
                    'depreciation': 487084050,
                    'operating_profit': 3039504864,
                    'non_operating_income': 101744623,
                    'non_operating_expense': 26366244,
                    'pbt': 3114883243,
                    'tax': 1791472191,
                    'net_profit': 1323411052,
                },
                'REGULATORY': {
                    'cd_ratio': 91.56,
                    'core_capital': 12.24,
                    'supplementary_capital': 2.00,
                    'capital_fund': 14.24,
                    'liquidity_crr': 30.10,
                    'npl_ratio': 2.78,
                    'loan_loss_provision_ratio': 137.70,
                    'cost_of_funds': 7.51,
                    'base_rate': 10.06,
                    'spread': 3.94,
                    'total_employees': 2391,
                }
            },
            '080/081': {
                'INCOME': {
                    'interest_income': 27571347943,
                    'interest_expense': 17018566002,
                    'net_interest_income': 10552781941,
                    'fee_income': 1672365135,
                    'fee_expense': 232765393,
                    'net_fee_income': 1439603194,
                    'net_int_fee_income': 11992385135,
                    'trading_income': 58593682,
                    'other_operating_income': 169298731,
                    'total_operating_income': 12220277548,
                },
                'EXPENSES': {
                    'impairment_charge': 2452167077,
                    'net_operating_income': 9768110471,
                    'personnel_expenses': 4158302229,
                    'other_operating_expenses': 994422573,
                    'depreciation': 476572645,
                    'operating_profit': 4138858024,
                    'non_operating_income': 11345330,
                    'non_operating_expense': 47048917,
                    'pbt': 4103154437,
                    'tax': 1205666636,
                    'net_profit': 2897487801,
                },
                'REGULATORY': {
                    'cd_ratio': 84.78,
                    'core_capital': 11.21,
                    'supplementary_capital': 1.54,
                    'capital_fund': 12.75,
                    'liquidity_crr': 34.26,
                    'npl_ratio': 3.91,
                    'base_rate': 8.09,
                    'spread': 3.95,
                    'total_employees': 2372,
                }
            },
            '081/082': {
                'INCOME': {
                    'interest_income': 22825616429,
                    'interest_expense': 13001002826,
                    'net_interest_income': 9824613603,
                    'fee_income': 1628433273,
                    'fee_expense': 288744260,
                    'net_fee_income': 1339689013,
                    'net_int_fee_income': 11164302616,
                    'trading_income': 562603727,
                    'other_operating_income': 127758910,
                    'total_operating_income': 11854665253,
                },
                'EXPENSES': {
                    'impairment_charge': 630772010,
                    'net_operating_income': 11223893243,
                    'personnel_expenses': 4547395201,
                    'other_operating_expenses': 1029992499,
                    'depreciation': 435676005,
                    'operating_profit': 5210829538,
                    'non_operating_income': 16520914,
                    'non_operating_expense': 7100000,
                    'pbt': 5220250452,
                    'tax': 1487834257,
                    'net_profit': 3732416195,
                },
                'REGULATORY': {
                    'spread': 3.95,
                }
            },
        }

        # ADBL Cash Flow Data (FY 077-078 to 081-082)
        # Note: Cash flow data only available for recent 5 years
        cash_flow_data = {
            '077/078': {
                'OPERATING': {
                    'interest_received': 15510760882,
                    'fees_received': 1612950236,
                    'other_receipts': 1437240351,
                    'interest_paid': -8397307953,
                    'fees_paid': -46882573,
                    'employee_payments': -3543985926,
                    'other_payments': -1695237385,
                    'operating_cash_before_changes': 4877537631,
                    'change_nrb': 282649785,
                    'change_placements': 890030979,
                    'change_trading_assets': -1649110764,
                    'change_loans_bfis': 1034233634,
                    'change_loans_customers': -29244802863,
                    'change_other_assets': -1403061800,
                    'change_due_bfis': 72191598,
                    'change_due_nrb': 8706692667,
                    'change_deposits': 19186405859,
                    'change_borrowings': 527592568,
                    'change_other_liabilities': -505791209,
                    'operating_cash_before_tax': 5318416160,
                    'tax_paid': -1661615409,
                    'net_operating_cash': 3656800751,
                },
                'INVESTING': {
                    'purchase_investments': -14612258982,
                    'sale_investments': 1563096987,
                    'purchase_ppe': -436445345,
                    'sale_ppe': 53901370,
                    'purchase_intangibles': -52414804,
                    'net_investing_cash': -13446410762,
                },
                'FINANCING': {
                    'issue_debt_securities': 12000000000,
                    'dividends_paid': -63090234,
                    'net_financing_cash': 11936909766,
                },
                'SUMMARY': {
                    'net_change_cash': 8489432167,
                    'cash_beginning': None,
                    'cash_ending': 10636731923,
                }
            },
            '078/079': {
                'OPERATING': {
                    'interest_received': 19969318086,
                    'fees_received': 1464286132,
                    'other_receipts': 480716655,
                    'interest_paid': -10470694967,
                    'fees_paid': -56186387,
                    'employee_payments': -3832845856,
                    'other_payments': -931027357,
                    'operating_cash_before_changes': 6623566305,
                    'change_nrb': 3531664562,
                    'change_placements': 3989675000,
                    'change_trading_assets': 26479947,
                    'change_loans_bfis': -4050517417,
                    'change_loans_customers': -24109898308,
                    'change_other_assets': -621868098,
                    'change_due_bfis': 7823418291,
                    'change_due_nrb': 1065345149,
                    'change_deposits': 3777471296,
                    'change_borrowings': 1238681568,
                    'change_other_liabilities': 1855159200,
                    'operating_cash_before_tax': 1147041739,
                    'tax_paid': -1436450864,
                    'net_operating_cash': -289409125,
                },
                'INVESTING': {
                    'purchase_investments': -8498458959,
                    'sale_investments': 362788513,
                    'purchase_ppe': -1279788111,
                    'sale_ppe': 151251204,
                    'purchase_intangibles': -56639075,
                    'net_investing_cash': -9122315225,
                },
                'FINANCING': {
                    'issue_debt_securities': 6000000000,
                    'dividends_paid': -665106806,
                    'net_financing_cash': 5334893194,
                },
                'SUMMARY': {
                    'net_change_cash': -4076831156,
                    'cash_beginning': 10636731923,
                    'cash_ending': 6559900767,
                }
            },
            '079/080': {
                'OPERATING': {
                    'interest_received': 23349225501,
                    'fees_received': 1371859175,
                    'other_receipts': 294379553,
                    'interest_paid': -15568292834,
                    'fees_paid': 209156451,
                    'employee_payments': -209156461,
                    'other_payments': -1022056280,
                    'operating_cash_before_changes': 4047270593,
                    'change_nrb': -887547138,
                    'change_placements': 127900000,
                    'change_trading_assets': 173220178,
                    'change_loans_bfis': -11005678,
                    'change_loans_customers': -3843224521,
                    'change_other_assets': -2280331236,
                    'change_due_bfis': -5902822420,
                    'change_due_nrb': -977137132,
                    'change_deposits': 32896347351,
                    'change_borrowings': 359352272,
                    'change_other_liabilities': 695221238,
                    'operating_cash_before_tax': 15597243507,
                    'tax_paid': -943468991,
                    'net_operating_cash': 14653774516,
                },
                'INVESTING': {
                    'purchase_investments': -9755351663,
                    'purchase_ppe': -457195347,
                    'purchase_intangibles': -4693950,
                    'net_investing_cash': None,
                },
                'FINANCING': {
                    'dividends_paid': -1588688494,
                    'net_financing_cash': -15888688494,
                },
                'SUMMARY': {
                    'net_change_cash': 2902520325,
                    'cash_beginning': 6559900767,
                    'cash_ending': 9462421092,
                }
            },
            '080/081': {
                'OPERATING': {
                    'interest_received': 26758913723,
                    'fees_received': 1672368587,
                    'other_receipts': 192894663,
                    'interest_paid': -17117539099,
                    'fees_paid': -229275283,
                    'employee_payments': -4352081926,
                    'other_payments': -1041471490,
                    'operating_cash_before_changes': 5883809175,
                    'change_nrb': -2313855647,
                    'change_placements': -5214300000,
                    'change_trading_assets': -272496594,
                    'change_loans_bfis': 943663347,
                    'change_loans_customers': -29658978075,
                    'change_other_assets': 1519459291,
                    'change_due_bfis': -1898901218,
                    'change_deposits': 44142044438,
                    'change_borrowings': 528009538,
                    'change_other_liabilities': 870098671,
                    'operating_cash_before_tax': 14528552956,
                    'tax_paid': -1009798601,
                    'net_operating_cash': 13518754355,
                },
                'INVESTING': {
                    'purchase_investments': -17621573816,
                    'sale_investments': 77780564,
                    'purchase_ppe': -344967846,
                    'purchase_intangibles': 4693950,
                    'net_investing_cash': -17844719065,
                },
                'FINANCING': {
                    'dividends_paid': -62373140,
                    'net_financing_cash': -62373140,
                },
                'SUMMARY': {
                    'net_change_cash': -4388337850,
                    'cash_beginning': 9462421092,
                    'cash_ending': 5074083242,
                }
            },
            '081/082': {
                'OPERATING': {
                    'interest_received': 23374386429,
                    'fees_received': 1628433273,
                    'other_receipts': 654120369,
                    'interest_paid': -13140576004,
                    'fees_paid': -283918421,
                    'employee_payments': -4664686254,
                    'other_payments': -1037092499,
                    'operating_cash_before_changes': 6530666893,
                    'change_nrb': -7590357057,
                    'change_placements': -4809731769,
                    'change_trading_assets': -207713712,
                    'change_loans_bfis': 304827570,
                    'change_loans_customers': -10545407259,
                    'change_other_assets': -1142322829,
                    'change_due_bfis': 589665928,
                    'change_deposits': 49730321193,
                    'change_borrowings': 140083711,
                    'change_other_liabilities': -3248816568,
                    'operating_cash_before_tax': 29751216101,
                    'tax_paid': -1327969995,
                    'net_operating_cash': 28423246106,
                },
                'INVESTING': {
                    'purchase_investments': -27884684926,
                    'sale_investments': 437257957,
                    'purchase_ppe': -603608224,
                    'purchase_intangibles': -2188208,
                    'net_investing_cash': -28000460219,
                },
                'FINANCING': {
                    'dividends_paid': -875999197,
                    'net_financing_cash': -875999197,
                },
                'SUMMARY': {
                    'net_change_cash': -453213310,
                    'cash_beginning': 5074083242,
                    'cash_ending': 4620869932,
                }
            },
        }

        # Create financial reports
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

            # Prepare cash flow JSON (only available for FY 077-078 onwards)
            cash_flow = {}
            if fiscal_year in cash_flow_data:
                cf_data = cash_flow_data[fiscal_year]
                for section_key, section_data in cf_data.items():
                    cash_flow[section_key] = {}
                    for field_key, value in section_data.items():
                        if value is not None:
                            cash_flow[section_key][field_key] = value

            # Extract key metrics
            total_assets = data['ASSETS']['total_assets']
            total_equity = data['EQUITY']['total_equity']
            net_profit = profit_loss_data.get(fiscal_year, {}).get('EXPENSES', {}).get('net_profit')
            
            # Create or update the financial report
            report, created = FinancialReport.objects.update_or_create(
                ticker='ADBL',
                fiscal_year=fiscal_year,
                report_type='ANNUAL',
                quarter=None,
                defaults={
                    'is_audited': True,
                    'report_template': 'BANK',
                    'balance_sheet': balance_sheet,
                    'profit_loss': profit_loss,
                    'cash_flow': cash_flow if cash_flow else None,
                    'paid_up_capital': data['EQUITY'].get('share_capital'),
                    'reserves_and_surplus': data['EQUITY'].get('reserves_reserves'),
                    'net_profit': net_profit,
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'✓ Created report for FY {fiscal_year}'))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(f'⟳ Updated report for FY {fiscal_year}'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Successfully processed {len(financial_data)} financial reports for ADBL'
        ))
        self.stdout.write(f'  Created: {created_count}')
        self.stdout.write(f'  Updated: {updated_count}')
