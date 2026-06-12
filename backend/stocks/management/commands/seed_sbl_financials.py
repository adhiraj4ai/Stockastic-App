from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds SBL annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding SBL financial data...')

        # Ensure SBL company exists
        company, created = Company.objects.get_or_create(
            symbol='SBL',
            defaults={
                'name': 'Siddhartha Bank Limited',
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
                    'cash_equivalent': 3378239325.00,
                    'due_from_nrb': 3847268039.00,
                    'placement_bfis': 744730397.00,
                    'derivative_assets': 24141960.00,
                    'trading_assets': 29757920.00,
                    'loans_bfis': 1476505000.00,
                    'loans_customers': 54748958920.00,
                    'investment_securities': 10342658056.00,
                    'current_tax_assets': 83527836.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 154637535.00,
                    'property_equipment': 618825074.00,
                    'intangible_assets': 3090526.00,
                    'deferred_tax_assets': None,
                    'other_assets': 621607328.00,
                    'total_assets': 76124947919.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 8011651778.00,
                    'due_to_nrb': 60000000.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 57772706773.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 422621868.00,
                    'other_liabilities': 1156169566.00,
                    'debt_securities': 1203520000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 68626699985.00,
                },
                'EQUITY': {
                    'share_capital': 3022880563.00,
                    'share_premium': None,
                    'retained_earnings': 1924589247.00,
                    'reserves_reserves': 2550808123.00,
                    'total_equity': 7498277934.00,
                    'total_liabilities_equity': 76124947919.00,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 3879880443.00,
                    'due_from_nrb': 6672330906.00,
                    'placement_bfis': 567325000.00,
                    'derivative_assets': 28637239.00,
                    'trading_assets': 40991188.00,
                    'loans_bfis': 2419043662.00,
                    'loans_customers': 64651159439.00,
                    'investment_securities': 11971296354.00,
                    'current_tax_assets': 58671994.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 154637535.00,
                    'property_equipment': 718726424.00,
                    'intangible_assets': 12661339.00,
                    'deferred_tax_assets': None,
                    'other_assets': 359741367.00,
                    'total_assets': 91586102891.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 5901743130.00,
                    'due_to_nrb': 505714039.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 71415816169.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 393804733.00,
                    'other_liabilities': 1046320007.00,
                    'debt_securities': 1203520000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 80466918078.00,
                },
                'EQUITY': {
                    'share_capital': 6628878942.00,
                    'share_premium': 120230167.00,
                    'retained_earnings': 1317891789.00,
                    'reserves_reserves': 3052183915.00,
                    'total_equity': 11119184813.00,
                    'total_liabilities_equity': 91586102891.00,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 4453213255.00,
                    'due_from_nrb': 6454927243.00,
                    'placement_bfis': 1611130000.00,
                    'derivative_assets': 3705756.00,
                    'trading_assets': 81317739.00,
                    'loans_bfis': 2841166306.00,
                    'loans_customers': 83236087535.00,
                    'investment_securities': 18592942436.00,
                    'current_tax_assets': 68228757.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 154637535.00,
                    'property_equipment': 1072322808.00,
                    'intangible_assets': 12089083.00,
                    'deferred_tax_assets': None,
                    'other_assets': 1236450112.00,
                    'total_assets': 119869000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7448514711.00,
                    'due_to_nrb': 692426920.00,
                    'derivative_liabilities': 73754800.00,
                    'deposits_customers': 94579591123.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 261913156.00,
                    'other_liabilities': 1906669561.00,
                    'debt_securities': 1203520000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 106166000000.00,
                },
                'EQUITY': {
                    'share_capital': 8464385276.00,
                    'share_premium': 122091505.00,
                    'retained_earnings': 1184426033.00,
                    'reserves_reserves': 3931925480.00,
                    'total_equity': 13702828293.00,
                    'total_liabilities_equity': 119869000000.00,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 8155811617.00,
                    'due_from_nrb': 6105971370.00,
                    'placement_bfis': 1033120216.00,
                    'derivative_assets': 7254007312.00,
                    'trading_assets': 80731130.00,
                    'loans_bfis': 3273145232.00,
                    'loans_customers': 104876000000.00,
                    'investment_securities': 17490997054.00,
                    'current_tax_assets': 154337310.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 123350704.00,
                    'property_equipment': 1279315069.00,
                    'intangible_assets': 33939390.00,
                    'deferred_tax_assets': None,
                    'other_assets': 1489738261.00,
                    'total_assets': 151402000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 8404327731.00,
                    'due_to_nrb': 984061065.00,
                    'derivative_liabilities': 7129133079.00,
                    'deposits_customers': 114923000000.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 70374490.00,
                    'other_liabilities': 1893386521.00,
                    'debt_securities': 2966079000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 136371000000.00,
                },
                'EQUITY': {
                    'share_capital': 8887604540.00,
                    'share_premium': 122091505.00,
                    'retained_earnings': 1801400742.00,
                    'reserves_reserves': 4219938447.00,
                    'total_equity': 15031035234.00,
                    'total_liabilities_equity': 151402000000.00,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 5959187692.00,
                    'due_from_nrb': 9507945122.00,
                    'placement_bfis': 1067074180.00,
                    'derivative_assets': 11972844047.00,
                    'trading_assets': 147021248.00,
                    'loans_bfis': 4004351952.00,
                    'loans_customers': 123573000000.00,
                    'investment_securities': 22502829318.00,
                    'current_tax_assets': 296973967.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 136607745.00,
                    'property_equipment': 1422340138.00,
                    'intangible_assets': 101985674.00,
                    'deferred_tax_assets': None,
                    'other_assets': 1725562617.00,
                    'total_assets': 182468000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 6759236798.00,
                    'due_to_nrb': 20054195.00,
                    'derivative_liabilities': 11862128229.00,
                    'deposits_customers': 139609000000.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 159215541.00,
                    'other_liabilities': 2884487184.00,
                    'debt_securities': 5162559000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 166457000000.00,
                },
                'EQUITY': {
                    'share_capital': 9787767142.00,
                    'share_premium': None,
                    'retained_earnings': 1245988052.00,
                    'reserves_reserves': 4977515481.00,
                    'total_equity': 16011270676.00,
                    'total_liabilities_equity': 182468000000.00,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 5976055588.00,
                    'due_from_nrb': 7740641992.00,
                    'placement_bfis': 3308708365.00,
                    'derivative_assets': 52423253.00,
                    'trading_assets': None,
                    'loans_bfis': 6027862003.00,
                    'loans_customers': 158579000000.00,
                    'investment_securities': 41825293770.00,
                    'current_tax_assets': 127218846.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 291042098.00,
                    'property_equipment': 1451931803.00,
                    'intangible_assets': 81501245.00,
                    'deferred_tax_assets': None,
                    'other_assets': 3429045936.00,
                    'total_assets': 228942000000.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7717011244.00,
                    'due_to_nrb': 5859906910.00,
                    'derivative_liabilities': None,
                    'deposits_customers': 180924000000.00,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 966719229.00,
                    'other_liabilities': 4909947881.00,
                    'debt_securities': 8162559000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 208540000000.00,
                },
                'EQUITY': {
                    'share_capital': 10962299199.00,
                    'share_premium': None,
                    'retained_earnings': 1808628800.00,
                    'reserves_reserves': 7630878326.00,
                    'total_equity': 20401806326.00,
                    'total_liabilities_equity': 228942000000.00,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 7928989024.00,
                    'due_from_nrb': 5730447535.00,
                    'placement_bfis': 320313255.00,
                    'derivative_assets': 19694323.00,
                    'trading_assets': None,
                    'loans_bfis': 6403394142.00,
                    'loans_customers': 178587363232.00,
                    'investment_securities': 57368161732.00,
                    'current_tax_assets': 221065203.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 213307612.00,
                    'property_equipment': 3077068355.00,
                    'intangible_assets': 71490971.00,
                    'deferred_tax_assets': None,
                    'other_assets': 4334727127.00,
                    'total_assets': 264327023510.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7234641506.00,
                    'due_to_nrb': 24965102753.00,
                    'derivative_liabilities': 19359606.00,
                    'deposits_customers': 191550643583.00,
                    'borrowings': 1022800000.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 239223287.00,
                    'other_liabilities': 6034819684.00,
                    'debt_securities': 11662559000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 242729149419.00,
                },
                'EQUITY': {
                    'share_capital': 12524426835.00,
                    'share_premium': None,
                    'retained_earnings': 1359868480.00,
                    'reserves_reserves': 7713578776.00,
                    'total_equity': 21597874092.00,
                    'total_liabilities_equity': 264327023510.00,
                }
            },
            '079-080': {
                'ASSETS': {
                    'cash_equivalent': 11554080479.00,
                    'due_from_nrb': 9000713492.00,
                    'placement_bfis': 5011346934.00,
                    'derivative_assets': 17320155.00,
                    'trading_assets': None,
                    'loans_bfis': 5170773907.00,
                    'loans_customers': 184009571040.00,
                    'investment_securities': 62480476034.00,
                    'current_tax_assets': 263764947.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 654537489.00,
                    'property_equipment': 3548089446.00,
                    'intangible_assets': 166000283.00,
                    'deferred_tax_assets': None,
                    'other_assets': 4050241119.00,
                    'total_assets': 285977915326.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 11613657572.00,
                    'due_to_nrb': 288453474.00,
                    'derivative_liabilities': 23887253.00,
                    'deposits_customers': 223654669691.00,
                    'borrowings': 7312480160.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 501929292.00,
                    'other_liabilities': 5613687917.00,
                    'debt_securities': 11662559000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 260671324359.00,
                },
                'EQUITY': {
                    'share_capital': 14089980190.00,
                    'share_premium': None,
                    'retained_earnings': 663610438.00,
                    'reserves_reserves': 10553000339.00,
                    'total_equity': 25306590967.00,
                    'total_liabilities_equity': 285977915326.00,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 22739728891.00,
                    'due_from_nrb': 9453753577.00,
                    'placement_bfis': 6562120179.00,
                    'derivative_assets': 4976896.00,
                    'trading_assets': 18998790.00,
                    'loans_bfis': 5767824492.00,
                    'loans_customers': 195473382509.00,
                    'investment_securities': 47978959412.00,
                    'current_tax_assets': 217840347.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 727570174.00,
                    'property_equipment': 3495827216.00,
                    'intangible_assets': 146146602.00,
                    'deferred_tax_assets': None,
                    'other_assets': 4703288420.00,
                    'total_assets': 297341417505.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3578162810.00,
                    'due_to_nrb': 391922787.00,
                    'derivative_liabilities': 3984885.00,
                    'deposits_customers': 241329082024.00,
                    'borrowings': 5964375769.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 669639275.00,
                    'other_liabilities': 5672397480.00,
                    'debt_securities': 11662559000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 269272124030.00,
                },
                'EQUITY': {
                    'share_capital': 14089980190.00,
                    'share_premium': None,
                    'retained_earnings': 580361617.00,
                    'reserves_reserves': 13398951668.00,
                    'total_equity': 28069293475.00,
                    'total_liabilities_equity': 297341417505.00,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 30739759143.00,
                    'due_from_nrb': 14875796713.00,
                    'placement_bfis': 7405231218.00,
                    'derivative_assets': 15995407.00,
                    'trading_assets': 200625.00,
                    'loans_bfis': 8098097875.00,
                    'loans_customers': 214456490823.00,
                    'investment_securities': 54719357052.00,
                    'current_tax_assets': 222830637.00,
                    'subsidiaries': 51000000.00,
                    'associates': None,
                    'investment_property': 725635232.00,
                    'property_equipment': 3201785434.00,
                    'intangible_assets': 117948376.00,
                    'deferred_tax_assets': None,
                    'other_assets': 4181218594.00,
                    'total_assets': 338811347130.00,
                },
                'LIABILITIES': {
                    'due_to_bfis': 3092528164.00,
                    'due_to_nrb': 391922787.00,
                    'derivative_liabilities': 19709982.00,
                    'deposits_customers': 280321367829.00,
                    'borrowings': 5839097142.00,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': 478302259.00,
                    'other_liabilities': 6040433137.00,
                    'debt_securities': 11662559000.00,
                    'subordinated_liabilities': None,
                    'total_liabilities': 307845920301.00,
                },
                'EQUITY': {
                    'share_capital': 14089980190.00,
                    'share_premium': None,
                    'retained_earnings': 1837866593.00,
                    'reserves_reserves': 15037580047.00,
                    'total_equity': 30965426830.00,
                    'total_liabilities_equity': 338811347130.00,
                }
            }
        }

        # P&L Data (FY 072-073 to 081-082) - values are in full Rs
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 4119478938.00,
                    'interest_expense': 1989418032.00,
                    'net_interest_income': 2130060906.00,
                    'total_operating_income': 2842571707.00,
                },
                'EXPENSES': {
                    'personnel_expenses': 387617791.00,
                    'operating_profit': 1686358582.00,
                    'net_profit': 1270472755.00,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 6625302722.00,
                    'interest_expense': 3998165438.00,
                    'net_interest_income': 2627137284.00,
                    'fee_income': 521610976.00,
                    'fee_expense': 119939703.00,
                    'net_fee_income': 401671273.00,
                    'net_int_fee_income': 3028808556.00,
                    'trading_income': 145171178.00,
                    'other_operating_income': 242221782.00,
                    'total_operating_income': 3416201516.00,
                },
                'EXPENSES': {
                    'impairment_charge': 120092789.00,
                    'personnel_expenses': 763035105.00,
                    'other_operating_expenses': 385679285.00,
                    'depreciation': 92955912.00,
                    'operating_profit': 2054438425.00,
                    'non_operating_income': 0.0,
                    'non_operating_expense': 73468715.00,
                    'pbt': 1980969710.00,
                    'tax': 578675404.00,
                    'net_profit': 1402294306.00,
                },
                'REGULATORY': {
                    'cd_ratio': 88.40,
                    'core_capital': 11.02,
                    'supplementary_capital': 1.72,
                    'capital_fund': 12.74,
                    'npl_ratio': 1.30,
                    'base_rate': 10.38,
                    'spread': 3.49,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 10057002594.00,
                    'interest_expense': 6620744057.00,
                    'net_interest_income': 3436258538.00,
                    'fee_income': 779704041.00,
                    'fee_expense': 127903277.00,
                    'net_fee_income': 651800764.00,
                    'net_int_fee_income': 4088059302.00,
                    'trading_income': 258680709.00,
                    'other_operating_income': 308497248.00,
                    'total_operating_income': 4655237259.00,
                },
                'EXPENSES': {
                    'impairment_charge': 230393540.00,
                    'personnel_expenses': 1085844188.00,
                    'other_operating_expenses': 490920608.00,
                    'depreciation': 118454070.00,
                    'operating_profit': 2729624852.00,
                    'non_operating_income': 400000.00,
                    'non_operating_expense': 0.0,
                    'pbt': 2730024852.00,
                    'tax': 825963348.00,
                    'net_profit': 1904061504.00,
                },
                'REGULATORY': {
                    'cd_ratio': 86.08,
                    'core_capital': 10.99,
                    'supplementary_capital': 1.13,
                    'capital_fund': 12.12,
                    'npl_ratio': 1.09,
                    'base_rate': 11.16,
                    'spread': 3.53,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 12972540680.00,
                    'interest_expense': 8305212902.00,
                    'net_interest_income': 4667327777.00,
                    'fee_income': 1016548229.00,
                    'fee_expense': 171261922.00,
                    'net_fee_income': 845286308.00,
                    'net_int_fee_income': 5512614085.00,
                    'trading_income': 453355380.00,
                    'other_operating_income': 120180985.00,
                    'total_operating_income': 6086150450.00,
                },
                'EXPENSES': {
                    'impairment_charge': 188116798.00,
                    'personnel_expenses': 1689202319.00,
                    'other_operating_expenses': 783731904.00,
                    'depreciation': 141395226.00,
                    'operating_profit': 3283704203.00,
                    'non_operating_income': 16786100.00,
                    'non_operating_expense': 1021617.00,
                    'pbt': 3299468687.00,
                    'tax': 1041780365.00,
                    'net_profit': 2257688322.00,
                },
                'REGULATORY': {
                    'cd_ratio': 89.65,
                    'core_capital': 10.11,
                    'supplementary_capital': 2.59,
                    'capital_fund': 12.70,
                    'npl_ratio': 0.75,
                    'base_rate': 10.57,
                    'spread': 3.72,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 15432152273.00,
                    'interest_expense': 9858014892.00,
                    'net_interest_income': 5574137381.00,
                    'fee_income': 1073835829.00,
                    'fee_expense': 188631886.00,
                    'net_fee_income': 885203943.00,
                    'net_int_fee_income': 6459341324.00,
                    'trading_income': 511718730.00,
                    'other_operating_income': 161585533.00,
                    'total_operating_income': 7132645587.00,
                },
                'EXPENSES': {
                    'impairment_charge': 686420527.00,
                    'personnel_expenses': 2156186723.00,
                    'other_operating_expenses': 925435844.00,
                    'depreciation': 196950476.00,
                    'operating_profit': 3167652017.00,
                    'non_operating_income': 207064.00,
                    'non_operating_expense': 39281897.00,
                    'pbt': 3128640105.00,
                    'tax': 985026390.00,
                    'net_profit': 2143613715.00,
                },
                'REGULATORY': {
                    'cd_ratio': 89.04,
                    'core_capital': 9.26,
                    'supplementary_capital': 3.91,
                    'capital_fund': 13.17,
                    'npl_ratio': 1.38,
                    'base_rate': 9.03,
                    'spread': 4.81,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 14949205421.00,
                    'interest_expense': 9438998984.00,
                    'net_interest_income': 5510206437.00,
                    'fee_income': 1337101297.00,
                    'fee_expense': 204493070.00,
                    'net_fee_income': 1132608227.00,
                    'net_int_fee_income': 6642814664.00,
                    'trading_income': 777640273.00,
                    'other_operating_income': 1042360844.00,
                    'total_operating_income': 8462815781.00,
                },
                'EXPENSES': {
                    'impairment_charge': 793069069.00,
                    'personnel_expenses': 2368241381.00,
                    'other_operating_expenses': 932137985.00,
                    'depreciation': 202641830.00,
                    'operating_profit': 4166725516.00,
                    'non_operating_income': 540449.00,
                    'non_operating_expense': 24679.00,
                    'pbt': 4167241286.00,
                    'tax': 1312412943.00,
                    'net_profit': 2854828343.00,
                },
                'REGULATORY': {
                    'cd_ratio': 90.60,
                    'core_capital': 8.52,
                    'supplementary_capital': 4.84,
                    'capital_fund': 13.36,
                    'npl_ratio': 1.00,
                    'base_rate': 7.16,
                    'spread': 3.70,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 20677563975.00,
                    'interest_expense': 14080716460.00,
                    'net_interest_income': 6596847515.00,
                    'fee_income': 1505592323.00,
                    'fee_expense': 285888969.00,
                    'net_fee_income': 1219703354.00,
                    'net_int_fee_income': 7816550869.00,
                    'trading_income': 442926681.00,
                    'other_operating_income': 532489900.00,
                    'total_operating_income': 8791967450.00,
                },
                'EXPENSES': {
                    'impairment_charge': 607471211.00,
                    'personnel_expenses': 2685015444.00,
                    'other_operating_expenses': 827855831.00,
                    'depreciation': 405072283.00,
                    'operating_profit': 4266552680.00,
                    'non_operating_income': 8609620.00,
                    'non_operating_expense': 16694239.00,
                    'pbt': 4258468061.00,
                    'tax': 1696816319.00,
                    'net_profit': 2902464042.00,
                },
                'REGULATORY': {}
            },
            '079-080': {
                'INCOME': {
                    'interest_income': 27670966196.00,
                    'interest_expense': 19486423098.00,
                    'net_interest_income': 8184543098.00,
                    'fee_income': 1693079336.00,
                    'fee_expense': 347458421.00,
                    'net_fee_income': 1345620915.00,
                    'net_int_fee_income': 9530164013.00,
                    'trading_income': 191735761.00,
                    'other_operating_income': 336328302.00,
                    'total_operating_income': 10058228076.00,
                },
                'EXPENSES': {
                    'impairment_charge': 1187561177.00,
                    'personnel_expenses': 2852235828.00,
                    'other_operating_expenses': 917442986.00,
                    'depreciation': 448006336.00,
                    'operating_profit': 4652981749.00,
                    'non_operating_income': 13471787.00,
                    'non_operating_expense': 101194542.00,
                    'pbt': 4565258995.00,
                    'tax': 1412442144.00,
                    'net_profit': 3166771347.00,
                },
                'REGULATORY': {
                    'cd_ratio': 84.94,
                    'core_capital': 9.37,
                    'supplementary_capital': 3.10,
                    'capital_fund': 12.47,
                    'npl_ratio': 2.01,
                    'base_rate': 9.91,
                    'spread': 3.99,
                }
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 25716027983.00,
                    'interest_expense': 17785958012.00,
                    'net_interest_income': 7930069971.00,
                    'fee_income': 1815388806.00,
                    'fee_expense': 389054337.00,
                    'net_fee_income': 1426334469.00,
                    'net_int_fee_income': 9356404440.00,
                    'trading_income': 239844593.00,
                    'other_operating_income': 381052402.00,
                    'total_operating_income': 9977301435.00,
                },
                'EXPENSES': {
                    'impairment_charge': 1051123141.00,
                    'personnel_expenses': 2977901219.00,
                    'other_operating_expenses': 985628185.00,
                    'depreciation': 478149579.00,
                    'operating_profit': 4484499312.00,
                    'non_operating_income': 11264646.00,
                    'non_operating_expense': 19997998.00,
                    'pbt': 4475765961.00,
                    'tax': 1428499479.00,
                    'net_profit': 3080028684.00,
                },
                'REGULATORY': {
                    'cd_ratio': 84.63,
                    'core_capital': 9.38,
                    'supplementary_capital': 2.51,
                    'capital_fund': 11.88,
                    'npl_ratio': 2.17,
                    'base_rate': 8.11,
                    'spread': 3.99,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 22312131883.00,
                    'interest_expense': 13872271708.00,
                    'net_interest_income': 8439830175.00,
                    'fee_income': 2097288147.00,
                    'fee_expense': 455773418.00,
                    'net_fee_income': 1641514729.00,
                    'net_int_fee_income': 10081374904.00,
                    'trading_income': 424240090.00,
                    'other_operating_income': 650178566.00,
                    'total_operating_income': 11155793561.00,
                },
                'EXPENSES': {
                    'impairment_charge': 1375321982.00,
                    'personnel_expenses': 3240211108.00,
                    'other_operating_expenses': 1065580229.00,
                    'depreciation': 499833902.00,
                    'operating_profit': 4974846341.00,
                    'non_operating_income': 16190574.00,
                    'non_operating_expense': 7912459.00,
                    'pbt': 4983124455.00,
                    'tax': 1642125161.00,
                    'net_profit': 3366594282.00,
                },
                'REGULATORY': {
                    'cd_ratio': 81.14,
                    'core_capital': 9.87,
                    'supplementary_capital': 1.90,
                    'capital_fund': 11.77,
                    'npl_ratio': 2.62,
                    'base_rate': 6.34,
                    'spread': 3.98,
                }
            }
        }

        # Cash Flow Data (FY 078-079 to 081-082) - values are in full Rs
        cash_flow_data = {
            '078-079': {
                'OPERATING': {
                    'interest_received': 13816278117.00,
                    'fees_received': 1505592323.00,
                    'dividend_received': 0.0,
                    'other_receipts': 499642801.00,
                    'interest_paid': -13467768526.00,
                    'fees_paid': -285888969.00,
                    'employee_payments': -2830541110.00,
                    'other_payments': -844550070.00,
                    'operating_cash_before_changes': -1607235434.00,
                    'change_nrb': 2010193457.00,
                    'change_placements': 2988395110.00,
                    'change_loans_bfis': -375532139.00,
                    'change_loans_customers': -20537864943.00,
                    'change_other_assets': 4251087119.00,
                    'change_due_bfis': -482369738.00,
                    'change_due_nrb': 19105843.00,
                    'change_deposits': 10626634259.00,
                    'change_borrowings': 1022887225.00,
                    'change_other_liabilities': 1029887225.00,
                    'operating_cash_before_tax': 18031190758.00,
                    'tax_paid': -1634007759.00,
                    'net_operating_cash': 16455473728.00,
                },
                'INVESTING': {
                    'purchase_investments': -17671276109.00,
                    'sale_investments': 13294531.00,
                    'purchase_ppe': -1876681451.00,
                    'sale_ppe': 19255161.00,
                    'purchase_intangibles': -14609102.00,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': -17139296966.00,
                },
                'FINANCING': {
                    'issue_debt_securities': -4000000000.00,
                    'repay_debt_securities': -5000000000.00,
                    'dividends_paid': -82217244.00,
                    'other_financing': -168078149.00,
                    'net_financing_cash': 2636756672.00,
                },
                'SUMMARY': {
                    'net_change_cash': 1952933435.00,
                    'cash_beginning': 5976055588.00,
                    'cash_ending': 7928989024.00,
                }
            },
            '079-080': {
                'OPERATING': {
                    'interest_received': 24015818342.00,
                    'fees_received': 1693079336.00,
                    'dividend_received': 0.0,
                    'other_receipts': 296979153.00,
                    'interest_paid': -18318104403.00,
                    'fees_paid': -347458421.00,
                    'employee_payments': -2134404314.00,
                    'other_payments': -1018637527.00,
                    'operating_cash_before_changes': 4187272166.00,
                    'change_nrb': -3270264958.00,
                    'change_placements': -4691033679.00,
                    'change_loans_bfis': 1232620235.00,
                    'change_loans_customers': -7050998862.00,
                    'change_other_assets': 291661293.00,
                    'change_due_bfis': 4379016066.00,
                    'change_due_nrb': -24676649279.00,
                    'change_deposits': 32104026108.00,
                    'change_borrowings': 6289680160.00,
                    'change_other_liabilities': -923855120.00,
                    'operating_cash_before_tax': 7871474132.00,
                    'tax_paid': -1455141889.00,
                    'net_operating_cash': 6416332242.00,
                },
                'INVESTING': {
                    'purchase_investments': -4316902966.00,
                    'sale_investments': 0.0,
                    'purchase_ppe': -879857019.00,
                    'sale_ppe': 2574664.00,
                    'purchase_intangibles': -136264340.00,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': -1616087478.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 0.0,
                    'repay_debt_securities': 0.0,
                    'dividends_paid': -82397545.00,
                    'other_financing': -21198093.00,
                    'net_financing_cash': -1271914333.00,
                },
                'SUMMARY': {
                    'net_change_cash': 3528330432.00,
                    'cash_beginning': 7928989024.00,
                    'cash_ending': 11554080479.00,
                }
            },
            '080-081': {
                'OPERATING': {
                    'interest_received': 22322880174.00,
                    'fees_received': 1815388806.00,
                    'dividend_received': 0.0,
                    'other_receipts': 368521296.00,
                    'interest_paid': -16617639317.00,
                    'fees_paid': -389054337.00,
                    'employee_payments': -2449524894.00,
                    'other_payments': -1005626182.00,
                    'operating_cash_before_changes': 40449945546.00,
                    'change_nrb': -453040085.00,
                    'change_placements': -1550773245.00,
                    'change_loans_bfis': -597050585.00,
                    'change_loans_customers': -12587967294.00,
                    'change_other_assets': -640704042.00,
                    'change_due_bfis': -8035494762.00,
                    'change_due_nrb': 103469313.00,
                    'change_deposits': 17674412334.00,
                    'change_borrowings': -1348104391.00,
                    'change_other_liabilities': -456900134.00,
                    'operating_cash_before_tax': -3866206135.00,
                    'tax_paid': 1600954813.00,
                    'net_operating_cash': -5467160949.00,
                },
                'INVESTING': {
                    'purchase_investments': 0.0,
                    'sale_investments': 15201349607.00,
                    'purchase_ppe': -403652805.00,
                    'sale_ppe': 0.0,
                    'purchase_intangibles': -28829390.00,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': 18269803330.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 0.0,
                    'repay_debt_securities': 0.0,
                    'dividends_paid': -593188166.00,
                    'other_financing': 30527544.00,
                    'net_financing_cash': -1730979317.00,
                },
                'SUMMARY': {
                    'net_change_cash': 11071663066.00,
                    'cash_beginning': 11554080479.00,
                    'cash_ending': 22739728891.00,
                }
            },
            '081-082': {
                'OPERATING': {
                    'interest_received': 19504666879.00,
                    'fees_received': 2097288147.00,
                    'dividend_received': 0.0,
                    'other_receipts': 831130188.00,
                    'interest_paid': -12700752139.00,
                    'fees_paid': -455773418.00,
                    'employee_payments': -2810425203.00,
                    'other_payments': -1073492688.00,
                    'operating_cash_before_changes': 5392641765.00,
                    'change_nrb': -5422043136.00,
                    'change_placements': -843111039.00,
                    'change_loans_bfis': -2412006028.00,
                    'change_loans_customers': -20274762710.00,
                    'change_other_assets': 511051314.00,
                    'change_due_bfis': -485634646.00,
                    'change_deposits': 38992285805.00,
                    'change_borrowings': -125278627.00,
                    'change_other_liabilities': -169919741.00,
                    'operating_cash_before_tax': 15182021124.00,
                    'tax_paid': -1647115451.00,
                    'net_operating_cash': 13534905673.00,
                },
                'INVESTING': {
                    'purchase_investments': 0.0,
                    'sale_investments': -6597063851.00,
                    'purchase_ppe': -166176959.00,
                    'sale_ppe': 4504821.00,
                    'purchase_intangibles': -12548363.00,
                    'sale_intangibles': 0.0,
                    'net_investing_cash': -3852839339.00,
                },
                'FINANCING': {
                    'issue_debt_securities': 1720526.00,
                    'repay_debt_securities': 0.0,
                    'dividends_paid': -563599208.00,
                    'net_financing_cash': -1735118776.00,
                },
                'SUMMARY': {
                    'net_change_cash': 7946947558.00,
                    'cash_beginning': 22739728891.00,
                    'cash_ending': 30739759143.00,
                }
            }
        }

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 39.00, 'cash': 0.00, 'book_close': '2017-02-02'},
            '073-074': {'bonus': 14.00, 'cash': 0.00, 'book_close': '2018-03-04'},
            '074-075': {'bonus': 5.00, 'cash': 8.16, 'book_close': '2018-12-24'},
            '075-076': {'bonus': 10.00, 'cash': 15.26, 'book_close': '2019-10-16'},
            '076-077': {'bonus': 12.00, 'cash': 3.00, 'book_close': '2021-01-12'},
            '077-078': {'bonus': 14.25, 'cash': 0.75, 'book_close': '2022-01-02'},
            '078-079': {'bonus': 12.50, 'cash': 0.66, 'book_close': '2022-12-28'},
            '079-080': {'bonus': 0.00, 'cash': 4.21, 'book_close': '2023-11-07'},
            '080-081': {'bonus': 0.00, 'cash': 4.00, 'book_close': '2024-12-29'},
            '081-082': {'bonus': 5.00, 'cash': 5.53, 'book_close': '2025-11-03'},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2081/2082', 'bonus': 5.00, 'cash': 5.53, 'book_close': '2025-11-03'},
            {'fy': '2080/2081', 'bonus': 0.00, 'cash': 4.00, 'book_close': '2024-12-29'},
            {'fy': '2079/2080', 'bonus': 0.00, 'cash': 4.21, 'book_close': '2023-11-07'},
            {'fy': '2078/2079', 'bonus': 12.50, 'cash': 0.66, 'book_close': '2022-12-28'},
            {'fy': '2077/2078', 'bonus': 14.25, 'cash': 0.75, 'book_close': '2022-01-02'},
            {'fy': '2076/2077', 'bonus': 12.00, 'cash': 3.00, 'book_close': '2021-01-12'},
            {'fy': '2075/2076', 'bonus': 10.00, 'cash': 15.26, 'book_close': '2019-10-16'},
            {'fy': '2074/2075', 'bonus': 5.00, 'cash': 8.16, 'book_close': '2018-12-24'},
            {'fy': '2073/2074', 'bonus': 14.00, 'cash': 0.00, 'book_close': '2018-03-04'},
            {'fy': '2072/2073', 'bonus': 39.00, 'cash': 0.00, 'book_close': '2017-02-02'},
            {'fy': '2071/2072', 'bonus': 20.00, 'cash': 1.05, 'book_close': '2015-12-16'},
            {'fy': '2070/2071', 'bonus': 12.00, 'cash': 11.16, 'book_close': '2014-10-20'},
            {'fy': '2069/2070', 'bonus': 12.00, 'cash': 10.11, 'book_close': '2014-01-02'},
            {'fy': '2068/2069', 'bonus': 0.00, 'cash': 8.42, 'book_close': '2013-01-01'},
            {'fy': '2067/2068', 'bonus': 3.00, 'cash': 12.79, 'book_close': '2011-12-14'},
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
                ticker='SBL',
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
            f'SBL annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='SBL',
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
            f'SBL dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
