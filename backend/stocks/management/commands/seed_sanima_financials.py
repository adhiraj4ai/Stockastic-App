from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds SANIMA annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding SANIMA financial data...')

        # Ensure SANIMA company exists
        company, created = Company.objects.get_or_create(
            symbol='SANIMA',
            defaults={
                'name': 'Sanima Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created company: {company.symbol}'))
        else:
            self.stdout.write(f'Company {company.symbol} already exists')

        # Balance Sheet Data (FY 072-073 to 081-082) - values are in full Rs
        financial_data = {
            '072-073': {
                'ASSETS': {
                    'cash_equivalent': 682823728.00,
                    'due_from_nrb': 2574787981.00,
                    'placement_bfis': 154973855.00,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 40455086817.00,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 654874507.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 55890682404.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 46344181075.00,
                    'borrowings': 3281939578.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': 370000000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 50534056618.00,
                },
                'EQUITY': {
                    'share_capital': 4710596500.00,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 646029286.00,
                    'total_equity': 5356625786.00,
                    'total_liabilities_equity': 55890682404.00,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 2948780102.00,
                    'due_from_nrb': 5265301643.00,
                    'placement_bfis': 982243177.00,
                    'derivative_assets': 17734529.00,
                    'trading_assets': 406239582.00,
                    'loans_bfis': 603938195.00,
                    'loans_customers': 51038471540.00,
                    'investment_securities': 6429154180.00,
                    'current_tax_assets': 17139730.00,
                    'subsidiaries': 110000000.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 713080633.00,
                    'intangible_assets': 3315403.00,
                    'deferred_tax_assets': None,
                    'other_assets': 946304967.00,
                    'total_assets': 69481703681.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2103519307.00,
                    'due_to_nrb': 611009105.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 56161055860.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 43355931.00,
                    'deferred_tax_liabilities': 30923343.00,
                    'other_liabilities': 1013927072.00,
                    'debt_securities': 370000000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 60333790619.00,
                },
                'EQUITY': {
                    'share_capital': 6897634000.00,
                    'share_premium': None,
                    'retained_earnings': 1280242935.00,
                    'reserves_reserves': 970036128.00,
                    'total_equity': 9147913063.00,
                    'total_liabilities_equity': 69481703681.00,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 4530152334.00,
                    'due_from_nrb': 5608171848.00,
                    'placement_bfis': 649156510.00,
                    'derivative_assets': None,
                    'trading_assets': 478048147.00,
                    'loans_bfis': 1645223405.00,
                    'loans_customers': 67598133761.00,
                    'investment_securities': 9413443775.00,
                    'current_tax_assets': None,
                    'subsidiaries': 250000000.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 881846293.00,
                    'intangible_assets': 56550539.00,
                    'deferred_tax_assets': 50151213.00,
                    'other_assets': 661074779.00,
                    'total_assets': 91821952603.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1346959039.00,
                    'due_to_nrb': 358950008.00,
                    'derivative_liabilities': 18851134.00,
                    'deposits_customers': 77849380056.00,
                    'borrowings': None,
                    'current_tax_liabilities': 66294857.00,
                    'provisions': 11817943.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1011814065.00,
                    'debt_securities': 370000000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 81034067102.00,
                },
                'EQUITY': {
                    'share_capital': 8001255440.00,
                    'share_premium': None,
                    'retained_earnings': 1136681538.00,
                    'reserves_reserves': 1649948523.00,
                    'total_equity': 10787885501.00,
                    'total_liabilities_equity': 91821952603.00,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 4636422437.00,
                    'due_from_nrb': 2781194462.00,
                    'placement_bfis': 827701829.00,
                    'derivative_assets': 85066888.00,
                    'trading_assets': 484421811.00,
                    'loans_bfis': 2020420376.00,
                    'loans_customers': 81418860580.00,
                    'investment_securities': 13611190018.00,
                    'current_tax_assets': None,
                    'subsidiaries': 250000000.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 1150520679.00,
                    'intangible_assets': 70319347.00,
                    'deferred_tax_assets': 14774571.00,
                    'other_assets': 1713594966.00,
                    'total_assets': 109064000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3694458442.00,
                    'due_to_nrb': 1018919629.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 89373729162.00,
                    'borrowings': None,
                    'current_tax_liabilities': 24771881.00,
                    'provisions': 27174446.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1211174346.00,
                    'debt_securities': 1724712000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 97074939905.00,
                },
                'EQUITY': {
                    'share_capital': 8001255440.00,
                    'share_premium': None,
                    'retained_earnings': 1751506637.00,
                    'reserves_reserves': 2236785982.00,
                    'total_equity': 11989548059.00,
                    'total_liabilities_equity': 109064000000.00,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 5190299845.00,
                    'due_from_nrb': 5325683135.00,
                    'placement_bfis': 2827086670.00,
                    'derivative_assets': 40221461.00,
                    'trading_assets': 443453005.00,
                    'loans_bfis': 2844211678.00,
                    'loans_customers': 90850351390.00,
                    'investment_securities': 15018419486.00,
                    'current_tax_assets': 4201081.00,
                    'subsidiaries': 250000000.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 1177211496.00,
                    'intangible_assets': 60545750.00,
                    'deferred_tax_assets': 25565110.00,
                    'other_assets': 2253731045.00,
                    'total_assets': 126311000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3275974837.00,
                    'due_to_nrb': 86292488.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 107250000000.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 32428917.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1122765289.00,
                    'debt_securities': 1724712000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 113492000000.00,
                },
                'EQUITY': {
                    'share_capital': 8801380984.00,
                    'share_premium': None,
                    'retained_earnings': 1197037733.00,
                    'reserves_reserves': 2820186217.00,
                    'total_equity': 12818604934.00,
                    'total_liabilities_equity': 126311000000.00,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 4771140480.00,
                    'due_from_nrb': 6053731274.00,
                    'placement_bfis': 1740708397.00,
                    'derivative_assets': 16016111.00,
                    'trading_assets': 224408989.00,
                    'loans_bfis': 4094023666.00,
                    'loans_customers': 119071000000.00,
                    'investment_securities': 20922507357.00,
                    'current_tax_assets': None,
                    'subsidiaries': 250000000.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 1196388539.00,
                    'intangible_assets': 48082940.00,
                    'deferred_tax_assets': None,
                    'other_assets': 2362175691.00,
                    'total_assets': 160751000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4920874273.00,
                    'due_to_nrb': 3651303839.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 128426000000.00,
                    'borrowings': 1787250000.00,
                    'current_tax_liabilities': 62454562.00,
                    'provisions': 31374632.00,
                    'deferred_tax_liabilities': 42066575.00,
                    'other_liabilities': 2134263725.00,
                    'debt_securities': 4771716000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 145827000000.00,
                },
                'EQUITY': {
                    'share_capital': 9681519082.00,
                    'share_premium': None,
                    'retained_earnings': 1737199687.00,
                    'reserves_reserves': 3504694608.00,
                    'total_equity': 14923413378.00,
                    'total_liabilities_equity': 160751000000.00,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 5224716246.00,
                    'due_from_nrb': 13516139617.00,
                    'placement_bfis': 371162744.00,
                    'derivative_assets': None,
                    'trading_assets': 500749431.00,
                    'loans_bfis': 5167865708.00,
                    'loans_customers': 136518037930.00,
                    'investment_securities': 26468395455.00,
                    'current_tax_assets': None,
                    'subsidiaries': 250000000.00,
                    'associates': None,
                    'investment_property': 72932294.00,
                    'property_equipment': 1344606808.00,
                    'intangible_assets': 88267830.00,
                    'deferred_tax_assets': 138046695.00,
                    'other_assets': 2850171866.00,
                    'total_assets': 192511092727.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2614422138.00,
                    'due_to_nrb': 4096650775.00,
                    'derivative_liabilities': 52394722.00,
                    'deposits_customers': 157518535239.00,
                    'borrowings': 1279000000.00,
                    'current_tax_liabilities': 35222084.00,
                    'provisions': 44769659.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3146611698.00,
                    'debt_securities': 6812316000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 175599922316.00,
                },
                'EQUITY': {
                    'share_capital': 11327377326.00,
                    'share_premium': None,
                    'retained_earnings': 1244455120.00,
                    'reserves_reserves': 4339337965.00,
                    'total_equity': 16911170411.00,
                    'total_liabilities_equity': 192511092727.00,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 5290591934.00,
                    'due_from_nrb': 10368096356.00,
                    'placement_bfis': 1056571534.00,
                    'derivative_assets': None,
                    'trading_assets': 414838518.00,
                    'loans_bfis': 4445160972.00,
                    'loans_customers': 145424939454.00,
                    'investment_securities': 41980217771.00,
                    'current_tax_assets': 54535662.00,
                    'subsidiaries': 450000000.00,
                    'associates': None,
                    'investment_property': 190174378.00,
                    'property_equipment': 1368384653.00,
                    'intangible_assets': 96082857.00,
                    'deferred_tax_assets': 169777226.00,
                    'other_assets': 4333617053.00,
                    'total_assets': 215642988368.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 5091307913.00,
                    'due_to_nrb': 72086097.00,
                    'derivative_liabilities': 6045373.00,
                    'deposits_customers': 175745249454.00,
                    'borrowings': 2629000000.00,
                    'current_tax_liabilities': None,
                    'provisions': 34263966.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3311936817.00,
                    'debt_securities': 9373666000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 196263555622.00,
                },
                'EQUITY': {
                    'share_capital': 12460115059.00,
                    'share_premium': None,
                    'retained_earnings': 2215038700.00,
                    'reserves_reserves': 4704278987.00,
                    'total_equity': 19379432746.00,
                    'total_liabilities_equity': 215642988368.00,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 13072489091.00,
                    'due_from_nrb': 14237362921.00,
                    'placement_bfis': 591043234.00,
                    'derivative_assets': None,
                    'trading_assets': 319682584.00,
                    'loans_bfis': 5527765571.00,
                    'loans_customers': 159414737417.00,
                    'investment_securities': 37082393021.00,
                    'current_tax_assets': 1657283.00,
                    'subsidiaries': 450000000.00,
                    'associates': None,
                    'investment_property': 674001855.00,
                    'property_equipment': 1395433175.00,
                    'intangible_assets': 81631313.00,
                    'deferred_tax_assets': 248728752.00,
                    'other_assets': 3765283209.00,
                    'total_assets': 233862209426.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2182161765.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 1888161.00,
                    'deposits_customers': 197197071124.00,
                    'borrowings': 1070000000.00,
                    'current_tax_liabilities': None,
                    'provisions': 36443214.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3073480040.00,
                    'debt_securities': 9377516000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 212938560304.00,
                },
                'EQUITY': {
                    'share_capital': 13581525414.00,
                    'share_premium': None,
                    'retained_earnings': 1447337257.00,
                    'reserves_reserves': 5894786451.00,
                    'total_equity': 20923649123.00,
                    'total_liabilities_equity': 233862209426.00,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 20360777301.00,
                    'due_from_nrb': 19875524160.00,
                    'placement_bfis': 3455159602.00,
                    'derivative_assets': None,
                    'trading_assets': 429613790.00,
                    'loans_bfis': 7014125237.00,
                    'loans_customers': 176440505806.00,
                    'investment_securities': 29502942270.00,
                    'current_tax_assets': 169643424.00,
                    'subsidiaries': 450000000.00,
                    'associates': None,
                    'investment_property': 951498926.00,
                    'property_equipment': 1343337324.00,
                    'intangible_assets': 85859445.00,
                    'deferred_tax_assets': 162676832.00,
                    'other_assets': 3310270762.00,
                    'total_assets': 363551934879.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1572392607.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 21381629.00,
                    'deposits_customers': 223954679225.00,
                    'borrowings': 2063250000.00,
                    'current_tax_liabilities': None,
                    'provisions': 404648637.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3484840654.00,
                    'debt_securities': 9381366000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 240518374981.00,
                },
                'EQUITY': {
                    'share_capital': 13581525414.00,
                    'share_premium': None,
                    'retained_earnings': 2102906994.00,
                    'reserves_reserves': 7349127489.00,
                    'total_equity': 23033559897.00,
                    'total_liabilities_equity': 363551934879.00,
                }
            }
        }

        # P&L Data (FY 072-073 to 081-082) - values are in full Rs
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 3263021831.00,
                    'interest_expense': 1540143649.00,
                    'net_interest_income': 1722878182.00,
                    'total_operating_income': 2200422679.00,
                },
                'EXPENSES': {
                    'personnel_expenses': 259435476.00,
                    'operating_profit': 1476838623.00,
                    'net_profit': 1000428648.00,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 5126693380.00,
                    'interest_expense': 2818180505.00,
                    'net_interest_income': 2308512875.00,
                    'fee_income': 455743812.00,
                    'fee_expense': 32044769.00,
                    'net_fee_income': 423699044.00,
                    'net_int_fee_income': 2732211918.00,
                    'trading_income': 236999326.00,
                    'other_operating_income': 10932182.00,
                    'total_operating_income': 2980143427.00,
                },
                'EXPENSES': {
                    'impairment_charge': 134882142.00,
                    'personnel_expenses': 558087735.00,
                    'other_operating_expenses': 289913667.00,
                    'depreciation': 81845041.00,
                    'operating_profit': 1915414843.00,
                    'non_operating_income': 41207401.00,
                    'non_operating_expense': 280973.00,
                    'pbt': 1956341270.00,
                    'tax': 579278537.00,
                    'net_profit': 1377062733.00,
                },
                'REGULATORY': {
                    'cd_ratio': 89.03,
                    'core_capital': 14.07,
                    'supplementary_capital': 1.50,
                    'capital_fund': 15.57,
                    'npl_ratio': 0.01,
                    'base_rate': 10.20,
                    'spread': 4.23,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 8107978846.00,
                    'interest_expense': 5092454648.00,
                    'net_interest_income': 3015524197.00,
                    'fee_income': 706389342.00,
                    'fee_expense': 50152348.00,
                    'net_fee_income': 656236994.00,
                    'net_int_fee_income': 3671761191.00,
                    'trading_income': 298410710.00,
                    'other_operating_income': 38961666.00,
                    'total_operating_income': 4009133567.00,
                },
                'EXPENSES': {
                    'impairment_charge': 239217543.00,
                    'personnel_expenses': 865555664.00,
                    'other_operating_expenses': 383730300.00,
                    'depreciation': 105455444.00,
                    'operating_profit': 2415174616.00,
                    'non_operating_income': 895458.00,
                    'non_operating_expense': 734365.00,
                    'pbt': 2415335708.00,
                    'tax': 717832484.00,
                    'net_profit': 1697503224.00,
                },
                'REGULATORY': {
                    'cd_ratio': 87.45,
                    'core_capital': 11.14,
                    'supplementary_capital': 1.27,
                    'capital_fund': 12.41,
                    'npl_ratio': 0.03,
                    'base_rate': 9.91,
                    'spread': 4.66,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 10757980831.00,
                    'interest_expense': 6549283717.00,
                    'net_interest_income': 4208697114.00,
                    'fee_income': 785119601.00,
                    'fee_expense': 73254193.00,
                    'net_fee_income': 711865408.00,
                    'net_int_fee_income': 4920562522.00,
                    'trading_income': 392824856.00,
                    'other_operating_income': 44231715.00,
                    'total_operating_income': 5357619093.00,
                },
                'EXPENSES': {
                    'impairment_charge': 218238049.00,
                    'personnel_expenses': 1259767735.00,
                    'other_operating_expenses': 515552094.00,
                    'depreciation': 139165799.00,
                    'operating_profit': 3224895415.00,
                    'non_operating_income': 2087168.00,
                    'non_operating_expense': 6826064.00,
                    'pbt': 3220156519.00,
                    'tax': 962089013.00,
                    'net_profit': 2258067506.00,
                },
                'REGULATORY': {
                    'cd_ratio': 90.42,
                    'core_capital': 10.63,
                    'supplementary_capital': 2.56,
                    'capital_fund': 13.19,
                    'npl_ratio': 0.08,
                    'base_rate': 9.45,
                    'spread': 4.35,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 11469725229.00,
                    'interest_expense': 7280030928.00,
                    'net_interest_income': 4189694300.00,
                    'fee_income': 698255710.00,
                    'fee_expense': 78530474.00,
                    'net_fee_income': 619725237.00,
                    'net_int_fee_income': 4809419537.00,
                    'trading_income': 420657825.00,
                    'other_operating_income': 59729789.00,
                    'total_operating_income': 5289807151.00,
                },
                'EXPENSES': {
                    'impairment_charge': 797024603.00,
                    'personnel_expenses': 1234689274.00,
                    'other_operating_expenses': 572705791.00,
                    'depreciation': 155534569.00,
                    'operating_profit': 2529852914.00,
                    'non_operating_income': 1409962.00,
                    'non_operating_expense': 1520491.00,
                    'pbt': 2529742385.00,
                    'tax': 753477861.00,
                    'net_profit': 1776264524.00,
                },
                'REGULATORY': {
                    'cd_ratio': 85.10,
                    'core_capital': 10.37,
                    'supplementary_capital': 2.63,
                    'capital_fund': 13.00,
                    'npl_ratio': 0.45,
                    'base_rate': 8.62,
                    'spread': 3.47,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 10762830477.00,
                    'interest_expense': 6237843156.00,
                    'net_interest_income': 4524987321.00,
                    'fee_income': 875116821.00,
                    'fee_expense': 60957557.00,
                    'net_fee_income': 814159264.00,
                    'net_int_fee_income': 5339146585.00,
                    'trading_income': 426739658.00,
                    'other_operating_income': 51665390.00,
                    'total_operating_income': 5817551633.00,
                },
                'EXPENSES': {
                    'impairment_charge': 248282527.00,
                    'personnel_expenses': 1229753262.00,
                    'other_operating_expenses': 650045937.00,
                    'depreciation': 244877287.00,
                    'operating_profit': 2455266225.00,
                    'non_operating_income': 130437670.00,
                    'non_operating_expense': 3044540.00,
                    'pbt': 2585703895.00,
                    'tax': 781362830.00,
                    'net_profit': 1804341065.00,
                },
                'REGULATORY': {
                    'cd_ratio': 94.10,
                    'core_capital': 11.02,
                    'supplementary_capital': 2.68,
                    'capital_fund': 13.70,
                    'npl_ratio': 0.12,
                    'base_rate': 7.55,
                    'spread': 3.59,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 14850216913.00,
                    'interest_expense': 10198454206.00,
                    'net_interest_income': 4651762707.00,
                    'fee_income': 995913637.00,
                    'fee_expense': 148361763.00,
                    'net_fee_income': 847551874.00,
                    'net_int_fee_income': 5499314581.00,
                    'trading_income': 377678967.00,
                    'other_operating_income': 152708336.00,
                    'total_operating_income': 6029701884.00,
                },
                'EXPENSES': {
                    'impairment_charge': 554394612.00,
                    'personnel_expenses': 1549409462.00,
                    'other_operating_expenses': 625429672.00,
                    'depreciation': 345906947.00,
                    'operating_profit': 2954561191.00,
                    'non_operating_income': 6285738.00,
                    'non_operating_expense': 12035811.00,
                    'pbt': 294881118.00,
                    'tax': 855695289.00,
                    'net_profit': 2093115829.00,
                },
                'REGULATORY': {
                    'core_capital': 10.37,
                    'supplementary_capital': 4.05,
                    'capital_fund': 14.42,
                    'npl_ratio': 1.31,
                    'base_rate': 10.15,
                    'spread': 4.00,
                }
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 21607165934.00,
                    'interest_expense': 15128548520.00,
                    'net_interest_income': 6478617414.00,
                    'fee_income': 1039862304.00,
                    'fee_expense': 242160860.00,
                    'net_fee_income': 797701444.00,
                    'net_int_fee_income': 7276318858.00,
                    'trading_income': 217272574.00,
                    'other_operating_income': 158213052.00,
                    'total_operating_income': 7651804483.00,
                },
                'EXPENSES': {
                    'impairment_charge': 1053105015.00,
                    'personnel_expenses': 1761951641.00,
                    'other_operating_expenses': 704681912.00,
                    'depreciation': 361739042.00,
                    'operating_profit': 3770326874.00,
                    'non_operating_income': 14218389.00,
                    'non_operating_expense': 54985289.00,
                    'pbt': 3729559974.00,
                    'tax': None,
                    'net_profit': 2605793663.00,
                },
                'REGULATORY': {
                    'cd_ratio': 83.80,
                    'core_capital': 10.37,
                    'supplementary_capital': 4.05,
                    'capital_fund': 14.42,
                    'npl_ratio': 1.31,
                    'base_rate': 10.15,
                    'spread': 4.00,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 20724065704.00,
                    'interest_expense': 14542367925.00,
                    'net_interest_income': 6181697779.00,
                    'fee_income': 1194851785.00,
                    'fee_expense': 175845663.00,
                    'net_fee_income': 1019006122.00,
                    'net_int_fee_income': 7200703901.00,
                    'trading_income': 517770003.00,
                    'other_operating_income': 210560237.00,
                    'total_operating_income': 7929034141.00,
                },
                'EXPENSES': {
                    'impairment_charge': 1433321722.00,
                    'personnel_expenses': 1913493487.00,
                    'other_operating_expenses': 749836184.00,
                    'depreciation': 361488823.00,
                    'operating_profit': 3470893926.00,
                    'non_operating_income': 9037781.00,
                    'non_operating_expense': 99592861.00,
                    'pbt': 3380338845.00,
                    'tax': None,
                    'net_profit': 2397443832.00,
                },
                'REGULATORY': {
                    'cd_ratio': 82.73,
                    'core_capital': 9.75,
                    'supplementary_capital': 3.46,
                    'capital_fund': 13.21,
                    'npl_ratio': 1.72,
                    'base_rate': 7.83,
                    'spread': 4.00,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 18040787831.00,
                    'interest_expense': 11684789917.00,
                    'net_interest_income': 6355997914.00,
                    'fee_income': 1380362833.00,
                    'fee_expense': 185015155.00,
                    'net_fee_income': 1195347678.00,
                    'net_int_fee_income': 7551345593.00,
                    'trading_income': 593391466.00,
                    'other_operating_income': 457720703.00,
                    'total_operating_income': 8602457762.00,
                },
                'EXPENSES': {
                    'impairment_charge': 1889120780.00,
                    'personnel_expenses': 2001700084.00,
                    'other_operating_expenses': 782083723.00,
                    'depreciation': 353670492.00,
                    'operating_profit': 3575882683.00,
                    'non_operating_income': 28501664.00,
                    'non_operating_expense': 43321260.00,
                    'pbt': 3561063088.00,
                    'tax': None,
                    'net_profit': 2572463980.00,
                },
                'REGULATORY': {
                    'cd_ratio': 81.36,
                    'core_capital': 9.86,
                    'supplementary_capital': 3.16,
                    'capital_fund': 13.01,
                    'npl_ratio': 3.01,
                    'base_rate': 6.12,
                    'spread': 3.68,
                }
            }
        }

        # Cash Flow Data (FY 078-079 to 081-082) - values are in full Rs
        cash_flow_data = {
            '078-079': {
                'OPERATING': {
                    'interest_received': 1438637260.00,
                    'fees_received': 986479675.00,
                    'other_receipts': 359237214.00,
                    'interest_paid': -10183144438.00,
                    'fees_paid': -148361763.00,
                    'employee_payments': -1533415847.00,
                    'other_payments': -583202989.00,
                    'operating_cash_before_changes': 3283964457.00,
                    'change_nrb': -7462408343.00,
                    'change_placements': 1369545652.00,
                    'change_loans_bfis': -1073842042.00,
                    'change_loans_customers': -18001031818.00,
                    'change_other_assets': -146182552.00,
                    'change_due_bfis': -2306452136.00,
                    'change_due_nrb': 445346936.00,
                    'change_deposits': 29092668058.00,
                    'change_borrowings': -508250000.00,
                    'change_other_liabilities': 1288541489.00,
                    'operating_cash_before_tax': 5744844809.00,
                    'tax_paid': -882927767.00,
                    'net_operating_cash': 4861917043.00,
                },
                'INVESTING': {
                    'purchase_investments': -5874490354.00,
                    'sale_investments': 0.0,
                    'purchase_ppe': -524839688.00,
                    'sale_ppe': 30714473.00,
                    'purchase_intangibles': -40184891.00,
                    'sale_intangibles': 0.0,
                    'purchase_investment_property': 0.0,
                    'sale_investment_property': -72932294.00,
                    'net_investing_cash': -6343582481.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 2033100000.00,
                    'repay_debt_securities': 0.0,
                    'dividends_paid': -86624118.00,
                    'other_financing': -11234677.00,
                    'net_financing_cash': 1935241204.00,
                },
                'SUMMARY': {
                    'net_change_cash': 453575766.00,
                    'cash_beginning': 4771140480.00,
                    'cash_ending': 5224716246.00,
                }
            },
            '079-080': {
                'OPERATING': {
                    'interest_received': 20572133494.00,
                    'fees_received': 1026889097.00,
                    'other_receipts': 272571894.00,
                    'interest_paid': -14908939503.00,
                    'fees_paid': -242160860.00,
                    'employee_payments': -1619372230.00,
                    'other_payments': -1006330523.00,
                    'operating_cash_before_changes': 4094792369.00,
                    'change_nrb': 3148043261.00,
                    'change_placements': -685408789.00,
                    'change_loans_bfis': 722704736.00,
                    'change_loans_customers': -9939819343.00,
                    'change_other_assets': -511927940.00,
                    'change_due_bfis': 2476885775.00,
                    'change_due_nrb': -4024564678.00,
                    'change_deposits': 18226714215.00,
                    'change_borrowings': 1350000000.00,
                    'change_other_liabilities': -118748671.00,
                    'operating_cash_before_tax': 14826058768.00,
                    'tax_paid': -1233887476.00,
                    'net_operating_cash': 13592171292.00,
                },
                'INVESTING': {
                    'purchase_investments': -27535541910.00,
                    'sale_investments': 11840392500.00,
                    'purchase_ppe': -184871049.00,
                    'sale_ppe': 15236263.00,
                    'purchase_intangibles': -68033099.00,
                    'sale_intangibles': 0.0,
                    'purchase_investment_property': 0.0,
                    'sale_investment_property': -117242085.00,
                    'net_investing_cash': -15971264277.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 2952500000.00,
                    'repay_debt_securities': -370000000.00,
                    'dividends_paid': -111008298.00,
                    'other_financing': -26523030.00,
                    'net_financing_cash': 2444968673.00,
                },
                'SUMMARY': {
                    'net_change_cash': 65875688.00,
                    'cash_beginning': 5224716246.00,
                    'cash_ending': 5290591934.00,
                }
            },
            '080-081': {
                'OPERATING': {
                    'interest_received': 19971990974.00,
                    'fees_received': 1188889102.00,
                    'other_receipts': 569109676.00,
                    'interest_paid': -14573085065.00,
                    'fees_paid': -175845663.00,
                    'employee_payments': -1831049706.00,
                    'other_payments': -1082262618.00,
                    'operating_cash_before_changes': 4074941243.00,
                    'change_nrb': -3869266565.00,
                    'change_placements': 465528300.00,
                    'change_loans_bfis': -1082604599.00,
                    'change_loans_customers': -15885011034.00,
                    'change_other_assets': 1191916408.00,
                    'change_due_bfis': -2909146148.00,
                    'change_due_nrb': -72086097.00,
                    'change_deposits': 24451821670.00,
                    'change_borrowings': -1559000000.00,
                    'change_other_liabilities': -105171458.00,
                    'operating_cash_before_tax': 1794444445.00,
                    'tax_paid': -973026076.00,
                    'net_operating_cash': 821418370.00,
                },
                'INVESTING': {
                    'purchase_investments': 0.0,
                    'sale_investments': 7966390634.00,
                    'purchase_ppe': -246343055.00,
                    'sale_ppe': 37167003.00,
                    'purchase_intangibles': -16703339.00,
                    'sale_intangibles': 0.0,
                    'purchase_investment_property': 0.0,
                    'sale_investment_property': 0.0,
                    'net_investing_cash': 7813706243.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 0.0,
                    'repay_debt_securities': 0.0,
                    'dividends_paid': -710226558.00,
                    'other_financing': -143000897.00,
                    'net_financing_cash': -853227456.00,
                },
                'SUMMARY': {
                    'net_change_cash': 7781897157.00,
                    'cash_beginning': 5290591934.00,
                    'cash_ending': 13072489091.00,
                }
            },
            '081-082': {
                'OPERATING': {
                    'interest_received': 17910785750.00,
                    'fees_received': 1382768032.00,
                    'dividend_received': 13095445.00,
                    'other_receipts': 669753248.00,
                    'interest_paid': -11106595415.00,
                    'fees_paid': -185015155.00,
                    'employee_payments': -1993576645.00,
                    'other_payments': -1056828743.00,
                    'operating_cash_before_changes': 5634386518.00,
                    'change_nrb': -5638161239.00,
                    'change_placements': -2864116369.00,
                    'change_loans_bfis': -1486359665.00,
                    'change_loans_customers': -19544859942.00,
                    'change_other_assets': 560272202.00,
                    'change_due_bfis': -609769158.00,
                    'change_deposits': 26757608101.00,
                    'change_borrowings': 993250000.00,
                    'change_other_liabilities': 59269083.00,
                    'operating_cash_before_tax': 3787725417.00,
                    'tax_paid': -1165093509.00,
                    'net_operating_cash': 2622631908.00,
                },
                'INVESTING': {
                    'purchase_investments': 0.0,
                    'sale_investments': 5014316902.00,
                    'purchase_ppe': -164270421.00,
                    'sale_ppe': 28534091.00,
                    'purchase_intangibles': -28606664.00,
                    'sale_intangibles': 0.0,
                    'purchase_investment_property': 0.0,
                    'sale_investment_property': 181562453.00,
                    'net_investing_cash': 5128209507.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 0.0,
                    'repay_debt_securities': 0.0,
                    'dividends_paid': -714822846.00,
                    'other_financing': 252269640.00,
                    'net_financing_cash': -462553205.00,
                },
                'SUMMARY': {
                    'net_change_cash': 7288288210.00,
                    'cash_beginning': 13072489091.00,
                    'cash_ending': 20360777301.00,
                }
            }
        }

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 15.00, 'cash': 0.79, 'book_close': '2016-09-29'},
            '073-074': {'bonus': 16.00, 'cash': 0.00, 'book_close': '2017-09-22'},
            '074-075': {'bonus': 0.00, 'cash': 14.00, 'book_close': '2018-11-30'},
            '075-076': {'bonus': 10.00, 'cash': 11.05, 'book_close': '2019-09-30'},
            '076-077': {'bonus': 10.00, 'cash': 3.60, 'book_close': '2020-11-02'},
            '077-078': {'bonus': 17.00, 'cash': 0.89, 'book_close': '2021-10-24'},
            '078-079': {'bonus': 10.00, 'cash': 0.98, 'book_close': '2022-12-05'},
            '079-080': {'bonus': 9.00, 'cash': 5.70, 'book_close': '2023-10-09'},
            '080-081': {'bonus': 0.00, 'cash': 5.2632, 'book_close': '2024-11-10'},
            '081-082': {'bonus': 0.00, 'cash': 7.3685, 'book_close': '2025-10-13'},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2081/2082', 'bonus': 0.00, 'cash': 7.3685, 'book_close': '2025-10-13'},
            {'fy': '2080/2081', 'bonus': 0.00, 'cash': 5.2632, 'book_close': '2024-11-10'},
            {'fy': '2079/2080', 'bonus': 9.00, 'cash': 5.70, 'book_close': '2023-10-09'},
            {'fy': '2078/2079', 'bonus': 10.00, 'cash': 0.98, 'book_close': '2022-12-05'},
            {'fy': '2077/2078', 'bonus': 17.00, 'cash': 0.89, 'book_close': '2021-10-24'},
            {'fy': '2076/2077', 'bonus': 10.00, 'cash': 3.60, 'book_close': '2020-11-02'},
            {'fy': '2075/2076', 'bonus': 10.00, 'cash': 11.05, 'book_close': '2019-09-30'},
            {'fy': '2074/2075', 'bonus': 0.00, 'cash': 14.00, 'book_close': '2018-11-30'},
            {'fy': '2073/2074', 'bonus': 16.00, 'cash': 0.00, 'book_close': '2017-09-22'},
            {'fy': '2072/2073', 'bonus': 15.00, 'cash': 0.79, 'book_close': '2016-09-29'},
            {'fy': '2071/2072', 'bonus': 20.00, 'cash': 1.05, 'book_close': '2015-10-01'},
            {'fy': '2070/2071', 'bonus': 15.00, 'cash': 0.79, 'book_close': '2014-09-28'},
            {'fy': '2069/2070', 'bonus': 10.00, 'cash': 0.53, 'book_close': '2013-09-27'},
            {'fy': '2068/2069', 'bonus': 0.00, 'cash': 5.50, 'book_close': '2012-11-23'},
            {'fy': '2067/2068', 'bonus': 0.00, 'cash': 6.50, 'book_close': '2011-11-17'},
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

            cash_flow = {}
            if fiscal_year in cash_flow_data:
                cf_data = cash_flow_data[fiscal_year]
                for section_key, section_data in cf_data.items():
                    cash_flow[section_key] = {}
                    for field_key, value in section_data.items():
                        if value is not None:
                            cash_flow[section_key][field_key] = value

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
                ticker='SANIMA',
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
                created_reports += 1
            else:
                updated_reports += 1

        self.stdout.write(self.style.SUCCESS(
            f'SANIMA annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='SANIMA',
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
            f'SANIMA dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
