from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds SCB annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding SCB financial data...')

        # Ensure SCB company exists
        company, created = Company.objects.get_or_create(
            symbol='SCB',
            defaults={
                'name': 'Standard Chartered Bank Nepal Limited',
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
                    'cash_equivalent': 799366056.00,
                    'due_from_nrb': 1514671384.00,
                    'placement_bfis': 1658294743.00,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 31302949596.00,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 71306083.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 65185732479.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 55727178456.00,
                    'borrowings': 500000000.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 57661557293.00,
                },
                'EQUITY': {
                    'share_capital': 3749901333.00,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 3774273853.00,
                    'total_equity': 7524175186.00,
                    'total_liabilities_equity': 65185732479.00,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 22397734122.00,
                    'due_from_nrb': 3784681844.00,
                    'placement_bfis': 6190800000.00,
                    'derivative_assets': 8743374.00,
                    'trading_assets': None,
                    'loans_bfis': 1610449402.00,
                    'loans_customers': 38433867560.00,
                    'investment_securities': 4810675143.00,
                    'current_tax_assets': 613927826.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 102917965.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': 402215452.00,
                    'total_assets': 78356012689.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4178276781.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 59694608671.00,
                    'borrowings': None,
                    'current_tax_liabilities': 595512262.00,
                    'provisions': 148725208.00,
                    'deferred_tax_liabilities': 46962306.00,
                    'other_liabilities': 1312134594.00,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 65976219822.00,
                },
                'EQUITY': {
                    'share_capital': 4005715333.00,
                    'share_premium': 3044186600.00,
                    'retained_earnings': 1532386861.00,
                    'reserves_reserves': 3797504072.00,
                    'total_equity': 12379792867.00,
                    'total_liabilities_equity': 78356012689.00,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 22048328040.00,
                    'due_from_nrb': 3982461794.00,
                    'placement_bfis': 4831200000.00,
                    'derivative_assets': 9208507.00,
                    'trading_assets': None,
                    'loans_bfis': 2134849717.00,
                    'loans_customers': 44561330150.00,
                    'investment_securities': 4660992993.00,
                    'current_tax_assets': 936871209.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 115897369.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': 75546496.00,
                    'other_assets': 674868630.00,
                    'total_assets': 84031554906.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 326710474.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 67061046522.00,
                    'borrowings': None,
                    'current_tax_liabilities': 976567120.00,
                    'provisions': 120679374.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1621049238.00,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 70106052728.00,
                },
                'EQUITY': {
                    'share_capital': 8011430667.00,
                    'share_premium': None,
                    'retained_earnings': 1403042058.00,
                    'reserves_reserves': 4511029453.00,
                    'total_equity': 13925502178.00,
                    'total_liabilities_equity': 84031554906.00,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 12626985439.00,
                    'due_from_nrb': 2454907094.00,
                    'placement_bfis': 9902700000.00,
                    'derivative_assets': 43337602.00,
                    'trading_assets': None,
                    'loans_bfis': 2541465040.00,
                    'loans_customers': 53092116505.00,
                    'investment_securities': 11538225160.00,
                    'current_tax_assets': 50081437.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 147735950.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': 71797832.00,
                    'other_assets': 794831065.00,
                    'total_assets': 93264183123.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 505840120.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 75731527432.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 42375566.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2057365446.00,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 78337108564.00,
                },
                'EQUITY': {
                    'share_capital': 8011430667.00,
                    'share_premium': None,
                    'retained_earnings': 1807876436.00,
                    'reserves_reserves': 5107767456.00,
                    'total_equity': 14927074559.00,
                    'total_liabilities_equity': 93264183123.00,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 39244049170.00,
                    'due_from_nrb': 1985450188.00,
                    'placement_bfis': 4210500000.00,
                    'derivative_assets': 41753153.00,
                    'trading_assets': None,
                    'loans_bfis': 3010898821.00,
                    'loans_customers': 53924855910.00,
                    'investment_securities': 13058680842.00,
                    'current_tax_assets': 171939431.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 187148246.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': 36489801.00,
                    'other_assets': 566507959.00,
                    'total_assets': 116438000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4246465653.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 1172413.00,
                    'deposits_customers': 95020841249.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 37400171.00,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2029898760.00,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 101336000000.00,
                },
                'EQUITY': {
                    'share_capital': 8011430667.00,
                    'share_premium': None,
                    'retained_earnings': 1517919889.00,
                    'reserves_reserves': 5573144719.00,
                    'total_equity': 15102495274.00,
                    'total_liabilities_equity': 116438000000.00,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 26856975057.00,
                    'due_from_nrb': 2236482293.00,
                    'placement_bfis': None,
                    'derivative_assets': 272523.00,
                    'trading_assets': None,
                    'loans_bfis': 9065232584.00,
                    'loans_customers': 62408698688.00,
                    'investment_securities': 12816339998.00,
                    'current_tax_assets': 124722760.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 277098876.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': 952940157.00,
                    'total_assets': 114739000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 8426449997.00,
                    'due_to_nrb': 621511000.00,
                    'derivative_liabilities': 20806999.00,
                    'deposits_customers': 87564219683.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 19595062.00,
                    'deferred_tax_liabilities': 20065839.00,
                    'other_liabilities': 1843996207.00,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 98516644785.00,
                },
                'EQUITY': {
                    'share_capital': 8572230813.00,
                    'share_premium': None,
                    'retained_earnings': 1776753263.00,
                    'reserves_reserves': 5873134075.00,
                    'total_equity': 16222118151.00,
                    'total_liabilities_equity': 114739000000.00,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 19139900106.00,
                    'due_from_nrb': 2380225869.00,
                    'placement_bfis': 2567372453.00,
                    'derivative_assets': 22003204.00,
                    'trading_assets': None,
                    'loans_bfis': 10217345818.00,
                    'loans_customers': 79197404216.00,
                    'investment_securities': 7910850201.00,
                    'current_tax_assets': 113132554.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 612939813.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': 51174308.00,
                    'other_assets': 1143361945.00,
                    'total_assets': 123355710487.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 8223667337.00,
                    'due_to_nrb': 514986268.00,
                    'derivative_liabilities': 185476.00,
                    'deposits_customers': 93721916376.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2759852645.00,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 105220608102.00,
                },
                'EQUITY': {
                    'share_capital': 9429453895.00,
                    'share_premium': None,
                    'retained_earnings': 2197903017.00,
                    'reserves_reserves': 6507745473.00,
                    'total_equity': 18135102385.00,
                    'total_liabilities_equity': 123355710487.00,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 16961548093.00,
                    'due_from_nrb': 4032144427.00,
                    'placement_bfis': 6940365177.00,
                    'derivative_assets': 8182017.00,
                    'trading_assets': None,
                    'loans_bfis': 16830212730.00,
                    'loans_customers': 77831302936.00,
                    'investment_securities': 26362128243.00,
                    'current_tax_assets': 152504058.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 568144309.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': 10313158.00,
                    'other_assets': 1681164252.00,
                    'total_assets': 151378009400.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4992295339.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 88848457.00,
                    'deposits_customers': 117500977420.00,
                    'borrowings': 2630600000.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3528729099.00,
                    'debt_securities': 2493868274.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 131235318589.00,
                },
                'EQUITY': {
                    'share_capital': 9429453895.00,
                    'share_premium': None,
                    'retained_earnings': 2710555600.00,
                    'reserves_reserves': 8002681317.00,
                    'total_equity': 20142690811.00,
                    'total_liabilities_equity': 151378009400.00,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 28499220367.00,
                    'due_from_nrb': 3750850621.00,
                    'placement_bfis': 3091556.00,  # Wait: user prompt lists `3,091,556.00`
                    'derivative_assets': 701731.00,
                    'trading_assets': None,
                    'loans_bfis': 7487457877.00,
                    'loans_customers': 81142516618.00,
                    'investment_securities': 17833700327.00,
                    'current_tax_assets': 281078804.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 465520946.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': 93664731.00,
                    'other_assets': 1631267746.00,
                    'total_assets': 141189071323.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2341882863.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 4299741.00,
                    'deposits_customers': 112483886727.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3316240410.00,
                    'debt_securities': 2523938630.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 120670248372.00,
                },
                'EQUITY': {
                    'share_capital': 9429453895.00,
                    'share_premium': None,
                    'retained_earnings': 2461563258.00,
                    'reserves_reserves': 8627805799.00,
                    'total_equity': 20518822952.00,
                    'total_liabilities_equity': 141189071323.00,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 43661578299.00,
                    'due_from_nrb': 4429936824.00,
                    'placement_bfis': 3651996950.00,
                    'derivative_assets': 5452410.00,
                    'trading_assets': None,
                    'loans_bfis': 14813832277.00,
                    'loans_customers': 72893086343.00,
                    'investment_securities': 13578328256.00,
                    'current_tax_assets': 354858747.00,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 378216717.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': 106553720.00,
                    'other_assets': 2005562697.00,
                    'total_assets': 155879403240.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2068769064.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 15828882.00,
                    'deposits_customers': 125338847480.00,
                    'borrowings': 700000000.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3559996604.00,
                    'debt_securities': 2524615890.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 134208057921.00,
                },
                'EQUITY': {
                    'share_capital': 10042368398.00,
                    'share_premium': None,
                    'retained_earnings': 1996365160.00,
                    'reserves_reserves': 9632611762.00,
                    'total_equity': 21671345319.00,
                    'total_liabilities_equity': 155879403240.00,
                }
            }
        }

        # P&L Data (FY 072-073 to 081-082) - values are in full Rs
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 2415582668.00,
                    'interest_expense': 565704649.00,
                    'net_interest_income': 1849878019.00,
                    'total_operating_income': 2885048940.00,
                },
                'EXPENSES': {
                    'personnel_expenses': 488289822.00,
                    'operating_profit': 1701248338.00,
                    'net_profit': 1292494632.00,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 3191877668.00,
                    'interest_expense': 863459635.00,
                    'net_interest_income': 2328418032.00,
                    'fee_income': 520169034.00,
                    'fee_expense': 50338159.00,
                    'net_fee_income': 469830875.00,
                    'net_int_fee_income': 2798248907.00,
                    'trading_income': 512237246.00,
                    'other_operating_income': 106419627.00,
                    'total_operating_income': 3416905780.00,
                },
                'EXPENSES': {
                    'impairment_charge': -19583583.00,
                    'personnel_expenses': 771619156.00,
                    'other_operating_expenses': 464629645.00,
                    'depreciation': 26277882.00,
                    'operating_profit': 2173762680.00,
                    'non_operating_income': 8080154.00,
                    'non_operating_expense': 0.0,
                    'pbt': 2181842834.00,
                    'tax': 631855870.00,
                    'net_profit': 1549986963.00,
                },
                'REGULATORY': {
                    'cd_ratio': 62.20,
                    'core_capital': 19.59,
                    'supplementary_capital': 1.50,
                    'capital_fund': 21.08,
                    'npl_ratio': 0.19,
                    'base_rate': 6.47,
                    'spread': 5.01,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 4940674787.00,
                    'interest_expense': 1642640632.00,
                    'net_interest_income': 3298034155.00,
                    'fee_income': 724395844.00,
                    'fee_expense': 60639990.00,
                    'net_fee_income': 663755854.00,
                    'net_int_fee_income': 3961790009.00,
                    'trading_income': 594265250.00,
                    'other_operating_income': 124503473.00,
                    'total_operating_income': 4680558732.00,
                },
                'EXPENSES': {
                    'impairment_charge': 74888816.00,
                    'personnel_expenses': 997877304.00,
                    'other_operating_expenses': 564315775.00,
                    'depreciation': 26013028.00,
                    'operating_profit': 3017463809.00,
                    'non_operating_income': 4030058.00,
                    'non_operating_expense': 0.0,
                    'pbt': 3021493867.00,
                    'tax': 831595778.00,
                    'net_profit': 2189898090.00,
                },
                'REGULATORY': {
                    'cd_ratio': 66.45,
                    'core_capital': 21.41,
                    'supplementary_capital': 1.58,
                    'capital_fund': 22.99,
                    'npl_ratio': 0.18,
                    'base_rate': 7.87,
                    'spread': 5.06,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 6430108472.00,
                    'interest_expense': 2978176685.00,
                    'net_interest_income': 3451931786.00,
                    'fee_income': 943774892.00,
                    'fee_expense': 45096554.00,
                    'net_fee_income': 898678338.00,
                    'net_int_fee_income': 4350610124.00,
                    'trading_income': 729050453.00,
                    'other_operating_income': 131950705.00,
                    'total_operating_income': 5211611282.00,
                },
                'EXPENSES': {
                    'impairment_charge': 88237978.00,
                    'personnel_expenses': 1084358999.00,
                    'other_operating_expenses': 525696417.00,
                    'depreciation': 35691317.00,
                    'operating_profit': 3477626571.00,
                    'non_operating_income': 0.0,
                    'non_operating_expense': 2949622.00,
                    'pbt': 3474676949.00,
                    'tax': 1040012428.00,
                    'net_profit': 2434664521.00,
                },
                'REGULATORY': {
                    'cd_ratio': 70.11,
                    'core_capital': 18.31,
                    'supplementary_capital': 1.38,
                    'capital_fund': 19.69,
                    'npl_ratio': 0.15,
                    'base_rate': 7.63,
                    'spread': 4.45,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 6569455895.00,
                    'interest_expense': 3113438234.00,
                    'net_interest_income': 3456017661.00,
                    'fee_income': 797736091.00,
                    'fee_expense': 40959020.00,
                    'net_fee_income': 756777070.00,
                    'net_int_fee_income': 4212794731.00,
                    'trading_income': 580803550.00,
                    'other_operating_income': 179228465.00,
                    'total_operating_income': 4972826746.00,
                },
                'EXPENSES': {
                    'impairment_charge': 439065566.00,
                    'personnel_expenses': 1104235572.00,
                    'other_operating_expenses': 530300736.00,
                    'depreciation': 51856131.00,
                    'operating_profit': 2847368742.00,
                    'non_operating_income': 758215.00,
                    'non_operating_expense': 10612191.00,
                    'pbt': 2837514765.00,
                    'tax': 850123823.00,
                    'net_profit': 1987390942.00,
                },
                'REGULATORY': {
                    'cd_ratio': 56.75,
                    'core_capital': 16.85,
                    'supplementary_capital': 1.66,
                    'capital_fund': 18.51,
                    'npl_ratio': 0.44,
                    'base_rate': 7.00,
                    'spread': 3.63,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 5320630959.00,
                    'interest_expense': 2726836875.00,
                    'net_interest_income': 2593794084.00,
                    'fee_income': 739043245.00,
                    'fee_expense': 38742071.00,
                    'net_fee_income': 700301174.00,
                    'net_int_fee_income': 3294095258.00,
                    'trading_income': 759045455.00,
                    'other_operating_income': 10521651.00,
                    'total_operating_income': 4063662364.00,
                },
                'EXPENSES': {
                    'impairment_charge': 408381274.00,
                    'personnel_expenses': 1052255262.00,
                    'other_operating_expenses': 526331564.00,
                    'depreciation': 64105269.00,
                    'operating_profit': 2012588995.00,
                    'non_operating_income': 0.0,
                    'non_operating_expense': 4998359.00,
                    'pbt': 2007590636.00,
                    'tax': 608755437.00,
                    'net_profit': 1398835199.00,
                },
                'REGULATORY': {
                    'cd_ratio': 71.27,
                    'core_capital': 15.53,
                    'supplementary_capital': 1.64,
                    'capital_fund': 17.17,
                    'npl_ratio': 0.96,
                    'base_rate': 5.51,
                    'spread': 3.88,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 7527920105.00,
                    'interest_expense': 3787458004.00,
                    'net_interest_income': 3740462101.00,
                    'fee_income': 989622216.00,
                    'fee_expense': 56977277.00,
                    'net_fee_income': 932644939.00,
                    'net_int_fee_income': 4673107040.00,
                    'trading_income': 657438566.00,
                    'other_operating_income': 2920598.00,
                    'total_operating_income': 5333466204.00,
                },
                'EXPENSES': {
                    'impairment_charge': 134306886.00,
                    'personnel_expenses': 1267996121.00,
                    'other_operating_expenses': 542074379.00,
                    'depreciation': 148642596.00,
                    'operating_profit': 3240446222.00,
                    'non_operating_income': 0.0,
                    'non_operating_expense': 8490203.00,
                    'pbt': 3231956019.00,
                    'tax': 976020692.00,
                    'net_profit': 2255935327.00,
                },
                'REGULATORY': {}
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 12744038318.00,
                    'interest_expense': 6788013158.00,
                    'net_interest_income': 5956025161.00,
                    'fee_income': 1475463094.00,
                    'fee_expense': 191529486.00,
                    'net_fee_income': 1283933608.00,
                    'net_int_fee_income': 7239958769.00,
                    'trading_income': 582147329.00,
                    'other_operating_income': 20448426.00,
                    'total_operating_income': 7842554524.00,
                },
                'EXPENSES': {
                    'impairment_charge': 598246140.00,
                    'personnel_expenses': 1542790061.00,
                    'other_operating_expenses': 571025784.00,
                    'depreciation': 158784841.00,
                    'operating_profit': 4971707697.00,
                    'non_operating_income': 7448230.00,
                    'non_operating_expense': 19539160.00,
                    'pbt': 4959616767.00,
                    'tax': 1494286792.00,
                    'net_profit': 3465329975.00,
                },
                'REGULATORY': {
                    'cd_ratio': 77.61,
                    'core_capital': 14.17,
                    'supplementary_capital': 2.92,
                    'capital_fund': 17.09,
                    'npl_ratio': 1.18,
                    'base_rate': 9.02,
                    'spread': 4.00,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 11059118576.00,
                    'interest_expense': 5925829810.00,
                    'net_interest_income': 5133288767.00,
                    'fee_income': 1647804577.00,
                    'fee_expense': 232017802.00,
                    'net_fee_income': 1415786775.00,
                    'net_int_fee_income': 6549075541.00,
                    'trading_income': 679697130.00,
                    'other_operating_income': 2202421.00,
                    'total_operating_income': 7230975093.00,
                },
                'EXPENSES': {
                    'impairment_charge': 216113502.00,
                    'personnel_expenses': 1597872519.00,
                    'other_operating_expenses': 553195381.00,
                    'depreciation': 149756860.00,
                    'operating_profit': 4714036830.00,
                    'non_operating_income': 6959127.00,
                    'non_operating_expense': 26388103.00,
                    'pbt': 4694607855.00,
                    'tax': 1419339446.00,
                    'net_profit': 3275268409.00,
                },
                'REGULATORY': {}
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 8311018433.00,
                    'interest_expense': 3848768879.00,
                    'net_interest_income': 4462249554.00,
                    'fee_income': 1844889791.00,
                    'fee_expense': 482555372.00,
                    'net_fee_income': 1362334419.00,
                    'net_int_fee_income': 5824583973.00,
                    'trading_income': 721046156.00,
                    'other_operating_income': 29079637.00,
                    'total_operating_income': 6574709766.00,
                },
                'EXPENSES': {
                    'impairment_charge': -335296649.00,
                    'personnel_expenses': 1550284693.00,
                    'other_operating_expenses': 534290314.00,
                    'depreciation': 138674519.00,
                    'operating_profit': 4686756890.00,
                    'non_operating_income': 9869152.00,
                    'non_operating_expense': 165739882.00,
                    'pbt': 4530886160.00,
                    'tax': 1518322811.00,
                    'net_profit': 3012563349.00,
                },
                'REGULATORY': {}
            }
        }

        # Cash Flow Data (FY 078-079 to 081-082) - values are in full Rs
        cash_flow_data = {
            '078-079': {
                'OPERATING': {
                    'interest_received': 7194432316.00,
                    'fees_received': 1059503647.00,
                    'dividend_received': 0.0,
                    'other_receipts': 657108051.00,
                    'interest_paid': -3415590998.00,
                    'fees_paid': -50208717.00,
                    'employee_payments': -1203614185.00,
                    'other_payments': -538228307.00,
                    'operating_cash_before_changes': 3703401808.00,
                    'change_nrb': -143743576.00,
                    'change_placements': -2567372453.00,
                    'change_other_assets': -21730681.00,
                    'change_loans_bfis': -1165773532.00,
                    'change_loans_customers': -16917511804.00,
                    'change_other_liabilities': 118096504.00,
                    'change_due_bfis': -202782659.00,
                    'change_due_nrb': -106524732.00,
                    'change_deposits': 6157696693.00,
                    'change_borrowings': 0.0,
                    'change_other_operating_liabilities': 441937219.00,
                    'operating_cash_before_tax': -10704307214.00,
                    'tax_paid': -1007897406.00,
                    'net_operating_cash': -11712204620.00,
                },
                'INVESTING': {
                    'purchase_investments': 0.0,
                    'sale_investments': 4749156916.00,
                    'purchase_ppe': -484073533.00,
                    'sale_ppe': 0.0,
                    'purchase_intangibles': 0.0,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': 4270442702.00,
                },
                'FINANCING': {
                    'other_financing': -272464312.00,
                    'net_financing_cash': -272464312.00,
                },
                'SUMMARY': {
                    'net_change_cash': -7714226229.00,
                    'cash_beginning': 0.0,  # Unknown, user lists -
                    'cash_ending': 19139900106.00,
                }
            },
            '079-080': {
                'OPERATING': {
                    'interest_received': 12383891072.00,
                    'fees_received': 1133255557.00,
                    'dividend_received': 0.0,
                    'other_receipts': 589517601.00,
                    'interest_paid': -6534850728.00,
                    'fees_paid': -49798640.00,
                    'employee_payments': -1289662485.00,
                    'other_payments': -566448129.00,
                    'operating_cash_before_changes': 5665904248.00,
                    'change_nrb': -1651918557.00,
                    'change_placements': -4372992724.00,
                    'change_other_assets': 13821188.00,
                    'change_loans_bfis': -6696171412.00,
                    'change_loans_customers': 831698436.00,
                    'change_other_liabilities': 256583828.00,
                    'change_due_bfis': -3231371998.00,
                    'change_due_nrb': -514986268.00,
                    'change_deposits': 23779061044.00,
                    'change_borrowings': 2630600000.00,
                    'change_other_operating_liabilities': 143450479.00,
                    'operating_cash_before_tax': 16853678263.00,
                    'tax_paid': -1535251985.00,
                    'net_operating_cash': 15318426278.00,
                },
                'INVESTING': {
                    'purchase_investments': -18303060294.00,
                    'sale_investments': 0.0,
                    'purchase_ppe': -112987060.00,
                    'sale_ppe': 0.0,
                    'purchase_intangibles': 0.0,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': -18414580535.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 2400000000.00,
                    'dividends_paid': -1500177087.00,
                    'net_financing_cash': 899822913.00,
                },
                'SUMMARY': {
                    'net_change_cash': -2196331343.00,
                    'cash_beginning': 19139900106.00,
                    'cash_ending': 16961548092.00,
                }
            },
            '081-082': {
                'OPERATING': {
                    'interest_received': 8383817425.00,
                    'fees_received': 1593329563.00,
                    'dividend_received': 0.0,
                    'other_receipts': 587734234.00,
                    'interest_paid': -3926338864.00,
                    'fees_paid': -181307929.00,
                    'employee_payments': -1355782824.00,
                    'other_payments': -540153199.00,
                    'operating_cash_before_changes': 4561298405.00,
                    'change_nrb': -679086203.00,
                    'change_placements': -3648905394.00,
                    'change_other_assets': -4750679.00,
                    'change_loans_bfis': -7385164400.00,
                    'change_loans_customers': 8626398221.00,
                    'change_other_liabilities': -212866539.00,
                    'change_due_bfis': -273113799.00,
                    'change_deposits': 12854960753.00,
                    'change_borrowings': 700000000.00,
                    'change_other_operating_liabilities': -54298492.00,
                    'operating_cash_before_tax': 14484471874.00,
                    'tax_paid': -1575658282.00,
                    'net_operating_cash': 12908813593.00,
                },
                'INVESTING': {
                    'purchase_investments': 0.0,
                    'sale_investments': -6597063851.00,
                    'purchase_ppe': -51370290.00,
                    'sale_ppe': 815555.00,
                    'purchase_intangibles': 0.0,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': 4250482126.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 1720526.00,
                    'dividends_paid': -1771772204.00,
                    'net_financing_cash': -2018294944.00,
                },
                'SUMMARY': {
                    'net_change_cash': 15141000775.00,
                    'cash_beginning': 28499220367.00,
                    'cash_ending': 43661578299.00,
                }
            }
        }

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 33.33, 'cash': 1.75, 'book_close': '2016-12-07'},
            '073-074': {'bonus': 100.00, 'cash': 5.26, 'book_close': '2017-12-31'},
            '074-075': {'bonus': 0.00, 'cash': 17.50, 'book_close': '2019-01-13'},
            '075-076': {'bonus': 0.00, 'cash': 22.50, 'book_close': '2019-11-25'},
            '076-077': {'bonus': 7.00, 'cash': 4.84, 'book_close': '2020-12-24'},
            '077-078': {'bonus': 10.00, 'cash': 3.06, 'book_close': '2021-11-26'},
            '078-079': {'bonus': 0.00, 'cash': 16.51, 'book_close': '2022-11-23'},
            '079-080': {'bonus': 0.00, 'cash': 19.00, 'book_close': '2023-11-23'},
            '080-081': {'bonus': 6.50, 'cash': 19.00, 'book_close': '2024-11-27'},
            '081-082': {'bonus': 0.00, 'cash': 19.00, 'book_close': '2025-12-02'},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2081/2082', 'bonus': 0.00, 'cash': 19.00, 'book_close': '2025-12-02'},
            {'fy': '2080/2081', 'bonus': 6.50, 'cash': 19.00, 'book_close': '2024-11-27'},
            {'fy': '2079/2080', 'bonus': 0.00, 'cash': 19.00, 'book_close': '2023-11-23'},
            {'fy': '2078/2079', 'bonus': 0.00, 'cash': 16.51, 'book_close': '2022-11-23'},
            {'fy': '2077/2078', 'bonus': 10.00, 'cash': 3.06, 'book_close': '2021-11-26'},
            {'fy': '2076/2077', 'bonus': 7.00, 'cash': 4.84, 'book_close': '2020-12-24'},
            {'fy': '2075/2076', 'bonus': 0.00, 'cash': 22.50, 'book_close': '2019-11-25'},
            {'fy': '2074/2075', 'bonus': 0.00, 'cash': 17.50, 'book_close': '2019-01-13'},
            {'fy': '2073/2074', 'bonus': 100.00, 'cash': 5.26, 'book_close': '2017-12-31'},
            {'fy': '2072/2073', 'bonus': 33.33, 'cash': 1.75, 'book_close': '2016-12-07'},
            {'fy': '2071/2072', 'bonus': 25.00, 'cash': 19.21, 'book_close': '2016-04-30'},
            {'fy': '2070/2071', 'bonus': 10.00, 'cash': 41.50, 'book_close': '2014-10-31'},
            {'fy': '2069/2070', 'bonus': 10.00, 'cash': 40.00, 'book_close': '2013-10-30'},
            {'fy': '2068/2069', 'bonus': 15.00, 'cash': 45.00, 'book_close': '2012-11-09'},
            {'fy': '2067/2068', 'bonus': 0.00, 'cash': 50.00, 'book_close': '2011-11-16'},
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
                ticker='SCB',
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
            f'SCB annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='SCB',
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
            f'SCB dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
