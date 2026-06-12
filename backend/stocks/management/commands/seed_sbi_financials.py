from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds SBI annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding SBI financial data...')

        # Ensure SBI company exists
        company, created = Company.objects.get_or_create(
            symbol='SBI',
            defaults={
                'name': 'Nepal SBI Bank Limited',
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
                    'cash_equivalent': 1799377843.00,
                    'due_from_nrb': 6428009789.00,
                    'placement_bfis': 2162431432.00,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 46975534686.00,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 630104361.00,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 78415462208.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 65113316288.00,
                    'borrowings': 4184700000.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': 1000000000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 71454889508.00,
                },
                'EQUITY': {
                    'share_capital': 4973079112.00,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 1987493588.00,
                    'total_equity': 6960572700.00,
                    'total_liabilities_equity': 78415462208.00,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 8803465489.00,
                    'due_from_nrb': 7313015502.00,
                    'placement_bfis': 10361550000.00,
                    'derivative_assets': None,
                    'trading_assets': 23007450.00,
                    'loans_bfis': 2298513105.00,
                    'loans_customers': 61822035652.00,
                    'investment_securities': 7837090659.00,
                    'current_tax_assets': 171842525.00,
                    'subsidiaries': 100000000.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 739494028.00,
                    'intangible_assets': 2049170.00,
                    'deferred_tax_assets': 97319506.00,
                    'other_assets': 381468326.00,
                    'total_assets': 99950851412.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6155387985.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 80818815835.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1436904751.00,
                    'debt_securities': 1000000000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 89411108571.00,
                },
                'EQUITY': {
                    'share_capital': 6924892999.00,
                    'share_premium': None,
                    'retained_earnings': 1144987363.00,
                    'reserves_reserves': 2469862479.00,
                    'total_equity': 10539742841.00,
                    'total_liabilities_equity': 99950851412.00,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 10480237366.00,
                    'due_from_nrb': 5647349586.00,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': 20404281.00,
                    'loans_bfis': 2872201921.00,
                    'loans_customers': 72363660048.00,
                    'investment_securities': 8734987657.00,
                    'current_tax_assets': 219486240.00,
                    'subsidiaries': 188888889.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 843967110.00,
                    'intangible_assets': 4533821.00,
                    'deferred_tax_assets': 236210436.00,
                    'other_assets': 926742540.00,
                    'total_assets': 102539000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2709590000.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 6812345.00,
                    'deposits_customers': 84269219565.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 1751944192.00,
                    'debt_securities': 1000000000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 89737566102.00,
                },
                'EQUITY': {
                    'share_capital': 8046905260.00,
                    'share_premium': 381759941.00,
                    'retained_earnings': 1218765930.00,
                    'reserves_reserves': 3153672662.00,
                    'total_equity': 12801103793.00,
                    'total_liabilities_equity': 102539000000.00,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 8243366584.00,
                    'due_from_nrb': 9309360793.00,
                    'placement_bfis': None,
                    'derivative_assets': 122889914.00,
                    'trading_assets': 23770530.00,
                    'loans_bfis': 4258389234.00,
                    'loans_customers': 84386335699.00,
                    'investment_securities': 9269822145.00,
                    'current_tax_assets': 261700531.00,
                    'subsidiaries': 188888889.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 941030966.00,
                    'intangible_assets': 3932334.00,
                    'deferred_tax_assets': 315103180.00,
                    'other_assets': 989635061.00,
                    'total_assets': 118314000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2269997659.00,
                    'due_to_nrb': 761421088.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 97924444003.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2203913748.00,
                    'debt_securities': 1000000000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 104160000000.00,
                },
                'EQUITY': {
                    'share_capital': 8449250523.00,
                    'share_premium': None,
                    'retained_earnings': 1853742736.00,
                    'reserves_reserves': 3851456103.00,
                    'total_equity': 14154449362.00,
                    'total_liabilities_equity': 118314000000.00,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 15111519666.00,
                    'due_from_nrb': 7580527039.00,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': 50977020.00,
                    'loans_bfis': 4819693163.00,
                    'loans_customers': 89615499851.00,
                    'investment_securities': 12350069980.00,
                    'current_tax_assets': 294387897.00,
                    'subsidiaries': 188888889.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 913292767.00,
                    'intangible_assets': 2678280.00,
                    'deferred_tax_assets': 325622179.00,
                    'other_assets': 1148757204.00,
                    'total_assets': 132402000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 1865898878.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 20610248.00,
                    'deposits_customers': 110446000000.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2259339137.00,
                    'debt_securities': 3028341567.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 117620000000.00,
                },
                'EQUITY': {
                    'share_capital': 8956205554.00,
                    'share_premium': None,
                    'retained_earnings': 1415526276.00,
                    'reserves_reserves': 4410119494.00,
                    'total_equity': 14781851324.00,
                    'total_liabilities_equity': 132402000000.00,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 8426345170.00,
                    'due_from_nrb': 3272981241.00,
                    'placement_bfis': None,
                    'derivative_assets': None,
                    'trading_assets': 90559068.00,
                    'loans_bfis': 4586766483.00,
                    'loans_customers': 96951274535.00,
                    'investment_securities': 21246986872.00,
                    'current_tax_assets': 410019445.00,
                    'subsidiaries': 188888889.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 873429824.00,
                    'intangible_assets': 5260995.00,
                    'deferred_tax_assets': 389987707.00,
                    'other_assets': 1366274492.00,
                    'total_assets': 137809000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6093675000.00,
                    'due_to_nrb': 4265513428.00,
                    'derivative_liabilities': 20179685.00,
                    'deposits_customers': 106238000000.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 2762169244.00,
                    'debt_securities': 3028699402.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 122409000000.00,
                },
                'EQUITY': {
                    'share_capital': 9493577887.00,
                    'share_premium': None,
                    'retained_earnings': 889622669.00,
                    'reserves_reserves': 5016870555.00,
                    'total_equity': 15400071110.00,
                    'total_liabilities_equity': 137809000000.00,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 10160628890.00,
                    'due_from_nrb': 4519929769.00,
                    'placement_bfis': None,
                    'derivative_assets': 33908998.00,
                    'trading_assets': 60438013.00,
                    'loans_bfis': 5183047328.00,
                    'loans_customers': 105394035672.00,
                    'investment_securities': 23575969481.00,
                    'current_tax_assets': 403890295.00,
                    'subsidiaries': 188888889.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 1053945563.00,
                    'intangible_assets': 6965596.00,
                    'deferred_tax_assets': 322159142.00,
                    'other_assets': 2198993121.00,
                    'total_assets': 153102800757.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4467400000.00,
                    'due_to_nrb': 1303496556.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 119710205430.00,
                    'borrowings': 3853806893.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 4025369581.00,
                    'debt_securities': 2629094880.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 135989373340.00,
                },
                'EQUITY': {
                    'share_capital': 9825853113.00,
                    'share_premium': None,
                    'retained_earnings': 1454156010.00,
                    'reserves_reserves': 5833418295.00,
                    'total_equity': 17113427417.00,
                    'total_liabilities_equity': 153102800757.00,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 12235881617.00,
                    'due_from_nrb': 8385447141.00,
                    'placement_bfis': 5044187119.00,
                    'derivative_assets': 3509204.00,
                    'trading_assets': 75925467.00,
                    'loans_bfis': 5621617739.00,
                    'loans_customers': 116302286018.00,
                    'investment_securities': 33878742798.00,
                    'current_tax_assets': 539771202.00,
                    'subsidiaries': 188888889.00,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 1302829436.00,
                    'intangible_assets': 8189602.00,
                    'deferred_tax_assets': 379705963.00,
                    'other_assets': 1991146803.00,
                    'total_assets': 185958128999.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4009717250.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 150828378987.00,
                    'borrowings': 4017897082.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 4208434812.00,
                    'debt_securities': 4627001623.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 167691429754.00,
                },
                'EQUITY': {
                    'share_capital': 10120628706.00,
                    'share_premium': None,
                    'retained_earnings': 1070548188.00,
                    'reserves_reserves': 7075522351.00,
                    'total_equity': 18266699245.00,
                    'total_liabilities_equity': 185958128999.00,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 11217312652.00,
                    'due_from_nrb': 9672790114.00,
                    'placement_bfis': 2766819189.00,
                    'derivative_assets': 1631672.00,
                    'trading_assets': 81551000.00,
                    'loans_bfis': 6265884193.00,
                    'loans_customers': 125979115095.00,
                    'investment_securities': 47833055676.00,
                    'current_tax_assets': 510037482.00,
                    'subsidiaries': 188888889.00,
                    'associates': None,
                    'investment_property': 324222120.00,
                    'property_equipment': 1298765701.00,
                    'intangible_assets': 9024693.00,
                    'deferred_tax_assets': 443642214.00,
                    'other_assets': 2217840820.00,
                    'total_assets': 208810581507.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3730125507.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 175514855972.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 4266105840.00,
                    'debt_securities': 5843554047.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 189354641366.00,
                },
                'EQUITY': {
                    'share_capital': 10500152282.00,
                    'share_premium': None,
                    'retained_earnings': 1101641220.00,
                    'reserves_reserves': 7854146639.00,
                    'total_equity': 19455940141.00,
                    'total_liabilities_equity': 208810581507.00,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 29687603836.00,
                    'due_from_nrb': 8666097331.00,
                    'placement_bfis': 17284567766.00,
                    'derivative_assets': None,
                    'trading_assets': 89076000.00,
                    'loans_bfis': 6612393707.00,
                    'loans_customers': 134963770657.00,
                    'investment_securities': 30038217116.00,
                    'current_tax_assets': 290017278.00,
                    'subsidiaries': 188888889.00,
                    'associates': None,
                    'investment_property': 931344784.00,
                    'property_equipment': 1284254727.00,
                    'intangible_assets': 37392565.00,
                    'deferred_tax_assets': 457032001.00,
                    'other_assets': 2287347757.00,
                    'total_assets': 232818004414.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 2408669242.00,
                    'due_to_nrb': None,
                    'derivative_liabilities': 20865632.00,
                    'deposits_customers': 199603443876.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 4376204253.00,
                    'debt_securities': 5845264573.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 212254447575.00,
                },
                'EQUITY': {
                    'share_capital': 10899158068.00,
                    'share_premium': None,
                    'retained_earnings': 1197117473.00,
                    'reserves_reserves': 8467281298.00,
                    'total_equity': 20563556839.00,
                    'total_liabilities_equity': 232818004414.00,
                }
            }
        }

        # P&L Data (FY 072-073 to 081-082) - values are in full Rs
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 3981262340.00,
                    'interest_expense': 1564730163.00,
                    'net_interest_income': 2416532177.00,
                    'total_operating_income': 3336783577.00,
                },
                'EXPENSES': {
                    'personnel_expenses': 548987056.00,
                    'operating_profit': 2059429495.00,
                    'net_profit': 1331992050.00,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 5991658675.00,
                    'interest_expense': 2994483069.00,
                    'net_interest_income': 2997175606.00,
                    'fee_income': 850313827.00,
                    'fee_expense': 73930370.00,
                    'net_fee_income': 776383457.00,
                    'net_int_fee_income': 3773559063.00,
                    'trading_income': 202781765.00,
                    'other_operating_income': 21855519.00,
                    'total_operating_income': 3998196347.00,
                },
                'EXPENSES': {
                    'impairment_charge': -129461171.00,
                    'personnel_expenses': 957608755.00,
                    'other_operating_expenses': 577281313.00,
                    'depreciation': 113965012.00,
                    'operating_profit': 2219880096.00,
                    'non_operating_income': 20908168.00,
                    'non_operating_expense': 0.0,
                    'pbt': 2240788264.00,
                    'tax': 676099518.00,
                    'net_profit': 1564688746.00,
                },
                'REGULATORY': {
                    'cd_ratio': 78.07,
                    'core_capital': 13.53,
                    'supplementary_capital': 2.18,
                    'capital_fund': 15.71,
                    'npl_ratio': 0.10,
                    'base_rate': 8.98,
                    'spread': 3.68,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 9069778508.00,
                    'interest_expense': 492481088.00,  # Wait! Table says 4,924,810,880.00. I will write 4924810880.00
                    'net_interest_income': 4144967628.00,
                    'fee_income': 912860285.00,
                    'fee_expense': 84662040.00,
                    'net_fee_income': 828198245.00,
                    'net_int_fee_income': 4973165873.00,
                    'trading_income': 233512976.00,
                    'other_operating_income': 42884666.00,
                    'total_operating_income': 5249563515.00,
                },
                'EXPENSES': {
                    'impairment_charge': -272273854.00,
                    'personnel_expenses': 1375420104.00,
                    'other_operating_expenses': 703066694.00,
                    'depreciation': 137130092.00,
                    'operating_profit': 2761672771.00,
                    'non_operating_income': 38867749.00,
                    'non_operating_expense': 0.0,
                    'pbt': 2800540520.00,
                    'tax': 777029396.00,
                    'net_profit': 2023511124.00,
                },
                'REGULATORY': {
                    'cd_ratio': 89.60,
                    'core_capital': 13.38,
                    'supplementary_capital': 1.77,
                    'capital_fund': 15.15,
                    'npl_ratio': 0.20,
                    'base_rate': 10.12,
                    'spread': 4.99,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 11276807387.00,
                    'interest_expense': 6571724001.00,
                    'net_interest_income': 4705083386.00,
                    'fee_income': 993635660.00,
                    'fee_expense': 89917632.00,
                    'net_fee_income': 903718028.00,
                    'net_int_fee_income': 5608801414.00,
                    'trading_income': 306274403.00,
                    'other_operating_income': 19288011.00,
                    'total_operating_income': 5934363828.00,
                },
                'EXPENSES': {
                    'impairment_charge': -146616791.00,
                    'personnel_expenses': 1618605900.00,
                    'other_operating_expenses': 880732412.00,
                    'depreciation': 164515992.00,
                    'operating_profit': 3123892733.00,
                    'non_operating_income': 196076507.00,
                    'non_operating_expense': 3751950.00,
                    'pbt': 3316217290.00,
                    'tax': 1023692894.00,
                    'net_profit': 2292524396.00,
                },
                'REGULATORY': {
                    'cd_ratio': 90.52,
                    'core_capital': 12.72,
                    'supplementary_capital': 1.40,
                    'capital_fund': 14.12,
                    'npl_ratio': 0.20,
                    'base_rate': 9.72,
                    'spread': 4.43,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 11428379246.00,
                    'interest_expense': 7383776484.00,
                    'net_interest_income': 4044602762.00,
                    'fee_income': 884594665.00,
                    'fee_expense': 100153780.00,
                    'net_fee_income': 784440886.00,
                    'net_int_fee_income': 4829043648.00,
                    'trading_income': 269771501.00,
                    'other_operating_income': 31552842.00,
                    'total_operating_income': 5130367991.00,
                },
                'EXPENSES': {
                    'impairment_charge': 272339764.00,
                    'personnel_expenses': 1677340196.00,
                    'other_operating_expenses': 793030301.00,
                    'depreciation': 180050488.00,
                    'operating_profit': 2207607242.00,
                    'non_operating_income': 27516723.00,
                    'non_operating_expense': 3327796.00,
                    'pbt': 2231796168.00,
                    'tax': 688447397.00,
                    'net_profit': 1543348770.00,
                },
                'REGULATORY': {
                    'cd_ratio': 85.50,
                    'core_capital': 12.39,
                    'supplementary_capital': 3.16,
                    'capital_fund': 15.55,
                    'npl_ratio': 0.23,
                    'base_rate': 9.25,
                    'spread': 3.87,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 9001882831.00,
                    'interest_expense': 6134546892.00,
                    'net_interest_income': 2867335938.00,
                    'fee_income': 1078284129.00,
                    'fee_expense': 84280247.00,
                    'net_fee_income': 994003882.00,
                    'net_int_fee_income': 3861339820.00,
                    'trading_income': 343699217.00,
                    'other_operating_income': 20241182.00,
                    'total_operating_income': 4225280219.00,
                },
                'EXPENSES': {
                    'impairment_charge': 379622175.00,
                    'personnel_expenses': 1567059857.00,
                    'other_operating_expenses': 740910286.00,
                    'depreciation': 186299897.00,
                    'operating_profit': 1351388003.00,
                    'non_operating_income': 9780875.00,
                    'non_operating_expense': 640871.00,
                    'pbt': 1360528007.00,
                    'tax': 397048864.00,
                    'net_profit': 963479143.00,
                },
                'REGULATORY': {
                    'cd_ratio': 95.58,
                    'core_capital': 11.02,
                    'supplementary_capital': 2.83,
                    'capital_fund': 13.86,
                    'npl_ratio': 0.23,
                    'base_rate': 7.37,
                    'spread': 3.18,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 12304573489.00,
                    'interest_expense': 8017687094.00,
                    'net_interest_income': 4286886395.00,
                    'fee_income': 1280926695.00,
                    'fee_expense': 78194566.00,
                    'net_fee_income': 1202732130.00,
                    'net_int_fee_income': 5489618524.00,
                    'trading_income': 246281331.00,
                    'other_operating_income': 33124012.00,
                    'total_operating_income': 5787023868.00,
                },
                'EXPENSES': {
                    'impairment_charge': 623123816.00,
                    'personnel_expenses': 1828054496.00,
                    'other_operating_expenses': 615912644.00,
                    'depreciation': 354456700.00,
                    'operating_profit': 2365476211.00,
                    'non_operating_income': 13818225.00,
                    'non_operating_expense': 0.0,
                    'pbt': 2379294436.00,
                    'tax': 740984517.00,
                    'net_profit': 1638309919.00,
                },
                'REGULATORY': {}
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 17838065913.00,
                    'interest_expense': 12070799020.00,
                    'net_interest_income': 5767266893.00,
                    'fee_income': 1285530411.00,
                    'fee_expense': 97527948.00,
                    'net_fee_income': 1188002463.00,
                    'net_int_fee_income': 6955269356.00,
                    'trading_income': 333896914.00,
                    'other_operating_income': 45712606.00,
                    'total_operating_income': 7334878877.00,
                },
                'EXPENSES': {
                    'impairment_charge': 1511191121.00,
                    'personnel_expenses': 1976672565.00,
                    'other_operating_expenses': 701812616.00,
                    'depreciation': 333646885.00,
                    'operating_profit': 2811555689.00,
                    'non_operating_income': 23457623.00,
                    'non_operating_expense': 0.0,
                    'pbt': 2835013312.00,
                    'tax': 867504926.00,
                    'net_profit': 1967508386.00,
                },
                'REGULATORY': {
                    'cd_ratio': 81.42,
                    'core_capital': 10.10,
                    'supplementary_capital': 2.48,
                    'capital_fund': 12.58,
                    'npl_ratio': 2.43,
                    'base_rate': 10.59,
                    'spread': 3.99,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 17894542227.00,
                    'interest_expense': 12820996787.00,
                    'net_interest_income': 5073545440.00,
                    'fee_income': 1266600900.00,
                    'fee_expense': 135771616.00,
                    'net_fee_income': 1130829285.00,
                    'net_int_fee_income': 6204374725.00,
                    'trading_income': 161963256.00,
                    'other_operating_income': 43310671.00,
                    'total_operating_income': 6409648652.00,
                },
                'EXPENSES': {
                    'impairment_charge': 648310292.00,
                    'personnel_expenses': 1968209778.00,
                    'other_operating_expenses': 691228362.00,
                    'depreciation': 265550492.00,
                    'operating_profit': 2836349728.00,
                    'non_operating_income': 26843127.00,
                    'non_operating_expense': 0.0,
                    'pbt': 2863192855.00,
                    'tax': 863419969.00,
                    'net_profit': 1999772886.00,
                },
                'REGULATORY': {
                    'npl_ratio': 1.96,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 15461661057.00,
                    'interest_expense': 10195616763.00,
                    'net_interest_income': 5266044294.00,
                    'fee_income': 1369514934.00,
                    'fee_expense': 153335401.00,
                    'net_fee_income': 1216179533.00,
                    'net_int_fee_income': 6482223827.00,
                    'trading_income': 280831438.00,
                    'other_operating_income': 40535683.00,
                    'total_operating_income': 6803590948.00,
                },
                'EXPENSES': {
                    'impairment_charge': 1030515156.00,
                    'personnel_expenses': 1983262242.00,
                    'other_operating_expenses': 761532284.00,
                    'depreciation': 283031785.00,
                    'operating_profit': 2745249482.00,
                    'non_operating_income': 41792638.00,
                    'non_operating_expense': 65545597.00,
                    'pbt': 2721494523.00,
                    'tax': 910534346.00,
                    'net_profit': 1810960177.00,
                },
                'REGULATORY': {}
            }
        }

        # Fix 074-075 interest expense value (missing last 0 check: 4,924,810,880.00 instead of 492481088.00)
        profit_loss_data['074-075']['INCOME']['interest_expense'] = 4924810880.00

        # Cash Flow Data (FY 078-079 to 081-082) - values are in full Rs
        cash_flow_data = {
            '078-079': {
                'OPERATING': {
                    'interest_received': 12095055294.00,
                    'fees_received': 1575852777.00,
                    'dividend_received': 19547675.00,
                    'other_receipts': 8304555.00,
                    'interest_paid': -7736540555.00,
                    'fees_paid': -78194566.00,
                    'employee_payments': -1618536302.00,
                    'other_payments': -1409775969.00,
                    'operating_cash_before_changes': 2855712794.00,
                    'change_nrb': -1246948528.00,
                    'change_placements': 0.0,
                    'change_loans_bfis': -667134595.00,
                    'change_loans_customers': -8995031204.00,
                    'change_other_assets': -1041162193.00,
                    'change_due_bfis': -1626275000.00,
                    'change_due_nrb': -2962016827.00,
                    'change_deposits': 13471738579.00,
                    'change_borrowings': 3853806893.00,
                    'change_other_liabilities': 1534113475.00,
                    'operating_cash_before_tax': 14271367074.00,
                    'tax_paid': 0.0,
                    'net_operating_cash': 5176803348.00,
                },
                'INVESTING': {
                    'purchase_investments': -2249316361.00,
                    'sale_investments': 13294531.00,
                    'purchase_ppe': -369487336.00,
                    'sale_ppe': -157980154.00,
                    'purchase_intangibles': -3937768.00,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': -2586763372.00,
                },
                'FINANCING': {
                    'repay_debt_securities': -400000000.00,
                    'dividends_paid': -175005310.00,
                    'net_financing_cash': -855756255.00,
                },
                'SUMMARY': {
                    'net_change_cash': 1734283721.00,
                    'cash_beginning': 8426345170.00,
                    'cash_ending': 10160628890.00,
                }
            },
            '079-080': {
                'OPERATING': {
                    'interest_received': 17646080026.00,
                    'fees_received': 1641742441.00,
                    'dividend_received': 7655053.00,
                    'other_receipts': 44084825.00,
                    'interest_paid': -11596134750.00,
                    'fees_paid': -97527948.00,
                    'employee_payments': -1784686678.00,
                    'other_payments': -1595000155.00,
                    'operating_cash_before_changes': 4266212813.00,
                    'change_nrb': -3865517372.00,
                    'change_placements': -5044187119.00,
                    'change_loans_bfis': -441628658.00,
                    'change_loans_customers': -12416383221.00,
                    'change_other_assets': -80743624.00,
                    'change_due_bfis': -457682750.00,
                    'change_due_nrb': -1303496556.00,
                    'change_deposits': 31118173556.00,
                    'change_borrowings': 164090190.00,
                    'change_other_liabilities': 1901400.00,
                    'operating_cash_before_tax': 29522985840.00,
                    'tax_paid': 0.0,
                    'net_operating_cash': 11918738660.00,
                },
                'INVESTING': {
                    'purchase_investments': -10264432240.00,
                    'sale_investments': 0.0,
                    'purchase_ppe': -405584639.00,
                    'sale_ppe': 10293226.00,
                    'purchase_intangibles': -3726740.00,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': -10663450393.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 2399071271.00,
                    'repay_debt_securities': -400000000.00,
                    'dividends_paid': -703278013.00,
                    'net_financing_cash': 819964460.00,
                },
                'SUMMARY': {
                    'net_change_cash': 2075252727.00,
                    'cash_beginning': 10160628890.00,
                    'cash_ending': 12235881617.00,
                }
            },
            '080-081': {
                'OPERATING': {
                    'interest_received': 17789190855.00,
                    'fees_received': 1449003417.00,
                    'dividend_received': 7946866.00,
                    'other_receipts': 41269350.00,
                    'interest_paid': -12245137732.00,
                    'fees_paid': -135771616.00,
                    'employee_payments': -1862858406.00,
                    'other_payments': -1574291343.00,
                    'operating_cash_before_changes': 3469351392.00,
                    'change_nrb': -1287342973.00,
                    'change_placements': 2277367930.00,
                    'change_loans_bfis': -645909509.00,
                    'change_loans_customers': -10323496313.00,
                    'change_other_assets': -650709173.00,
                    'change_due_bfis': -279591743.00,
                    'change_deposits': 24686476986.00,
                    'change_borrowings': -4017897082.00,
                    'change_other_liabilities': 35606949.00,
                    'operating_cash_before_tax': 20424959109.00,
                    'tax_paid': 0.0,
                    'net_operating_cash': 13256687931.00,
                },
                'INVESTING': {
                    'purchase_investments': -14070909721.00,
                    'sale_investments': 0.0,
                    'purchase_ppe': -217607752.00,
                    'sale_ppe': 92417472.00,
                    'purchase_intangibles': -3685958.00,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': -14199785959.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 1416552424.00,
                    'repay_debt_securities': -200000000.00,
                    'dividends_paid': -697185963.00,
                    'other_financing': -18978345.00,
                    'net_financing_cash': -75470938.00,
                },
                'SUMMARY': {
                    'net_change_cash': -1018568966.00,
                    'cash_beginning': 12235881617.00,
                    'cash_ending': 11217312652.00,
                }
            },
            '081-082': {
                'OPERATING': {
                    'interest_received': 15416513418.00,
                    'fees_received': 1676729305.00,
                    'dividend_received': 7882705.00,
                    'other_receipts': 38497354.00,
                    'interest_paid': -9616694099.00,
                    'fees_paid': -153335401.00,
                    'employee_payments': -1938114602.00,
                    'other_payments': -1757823565.00,
                    'operating_cash_before_changes': 3673655114.00,
                    'change_nrb': 1006692783.00,
                    'change_placements': -14517748577.00,
                    'change_loans_bfis': -337197513.00,
                    'change_loans_customers': -10024482718.00,
                    'change_other_assets': -584257991.00,
                    'change_due_bfis': -1321456265.00,
                    'change_deposits': 24088587903.00,
                    'change_other_liabilities': 147960964.00,
                    'operating_cash_before_tax': 22915092603.00,
                    'tax_paid': 0.0,
                    'net_operating_cash': 2131753700.00,
                },
                'INVESTING': {
                    'purchase_investments': 17805663712.00,
                    'sale_investments': 0.0,
                    'purchase_ppe': -151458681.00,
                    'sale_ppe': 20781363.00,
                    'purchase_intangibles': -34892772.00,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': 17640093622.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 1720526.00,
                    'repay_debt_securities': 0.0,
                    'dividends_paid': -724343999.00,
                    'net_financing_cash': -1301556138.00,
                },
                'SUMMARY': {
                    'net_change_cash': 18470291184.00,
                    'cash_beginning': 11217312652.00,
                    'cash_ending': 29687603836.00,
                }
            }
        }

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 28.00, 'cash': 1.53, 'book_close': '2017-02-05'},
            '073-074': {'bonus': 15.42, 'cash': 0.81, 'book_close': '2017-12-15'},
            '074-075': {'bonus': 5.00, 'cash': 10.79, 'book_close': '2019-01-02'},
            '075-076': {'bonus': 6.00, 'cash': 10.84, 'book_close': '2019-11-29'},
            '076-077': {'bonus': 6.00, 'cash': 3.47, 'book_close': '2020-12-30'},
            '077-078': {'bonus': 3.50, 'cash': 1.81, 'book_close': '2021-12-22'},
            '078-079': {'bonus': 3.00, 'cash': 7.53, 'book_close': '2022-12-28'},
            '079-080': {'bonus': 3.75, 'cash': 6.80, 'book_close': '2023-12-15'},
            '080-081': {'bonus': 3.80, 'cash': 6.85, 'book_close': '2024-12-22'},
            '081-082': {'bonus': 4.00, 'cash': 5.00, 'book_close': '2025-12-19'},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2081/2082', 'bonus': 4.00, 'cash': 5.00, 'book_close': '2025-12-19'},
            {'fy': '2080/2081', 'bonus': 3.80, 'cash': 6.85, 'book_close': '2024-12-22'},
            {'fy': '2079/2080', 'bonus': 3.75, 'cash': 6.80, 'book_close': '2023-12-15'},
            {'fy': '2078/2079', 'bonus': 3.00, 'cash': 7.53, 'book_close': '2022-12-28'},
            {'fy': '2077/2078', 'bonus': 3.50, 'cash': 1.81, 'book_close': '2021-12-22'},
            {'fy': '2076/2077', 'bonus': 6.00, 'cash': 3.47, 'book_close': '2020-12-30'},
            {'fy': '2075/2076', 'bonus': 6.00, 'cash': 10.84, 'book_close': '2019-11-29'},
            {'fy': '2074/2075', 'bonus': 5.00, 'cash': 10.79, 'book_close': '2019-01-02'},
            {'fy': '2073/2074', 'bonus': 15.42, 'cash': 0.81, 'book_close': '2017-12-15'},
            {'fy': '2072/2073', 'bonus': 28.00, 'cash': 1.53, 'book_close': '2017-02-05'},
            {'fy': '2071/2072', 'bonus': 27.00, 'cash': 1.42, 'book_close': '2016-01-19'},
            {'fy': '2070/2071', 'bonus': 15.00, 'cash': 7.00, 'book_close': '2015-01-01'},
            {'fy': '2069/2070', 'bonus': 12.50, 'cash': 7.50, 'book_close': '2013-09-25'},
            {'fy': '2068/2069', 'bonus': 12.50, 'cash': 5.00, 'book_close': '2012-09-28'},
            {'fy': '2067/2068', 'bonus': 12.50, 'cash': 5.00, 'book_close': '2011-11-06'},
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
                ticker='SBI',
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
            f'SBI annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='SBI',
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
            f'SBI dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
