from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, Dividend
from decimal import Decimal
from datetime import datetime


class Command(BaseCommand):
    help = 'Seeds PRVU annual financial reports and dividends'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding PRVU financial data...')

        # Ensure PRVU company exists
        company, created = Company.objects.get_or_create(
            symbol='PRVU',
            defaults={
                'name': 'Prabhu Bank Limited',
                'sector': 'Commercial Banks',
                'instrument_type': 'Equity'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created company: {company.symbol}'))
        else:
            self.stdout.write(f'Company {company.symbol} already exists')

        # Balance Sheet Data (FY 072-073 to 081-082, excluding 079-080 as not provided)
        financial_data = {
            '072-073': {
                'ASSETS': {
                    'cash_equivalent': 2965460108,
                    'due_from_nrb': 7505153799,
                    'placement_bfis': 1907095030,
                    'derivative_assets': None,
                    'trading_assets': None,
                    'loans_bfis': None,
                    'loans_customers': 43909120609,
                    'investment_securities': None,
                    'current_tax_assets': None,
                    'subsidiaries': None,
                    'associates': None,
                    'investment_property': None,
                    'property_equipment': 2136023973,
                    'intangible_assets': None,
                    'deferred_tax_assets': None,
                    'other_assets': None,
                    'total_assets': 68338179123,
                },
                'LIABILITIES': {
                    'due_to_bfis': None,
                    'due_to_nrb': None,
                    'derivative_liabilities': None,
                    'deposits_customers': 60940868320,
                    'borrowings': 15243363,
                    'current_tax_liabilities': None,
                    'provisions': None,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': None,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 61904337485,
                },
                'EQUITY': {
                    'share_capital': 5881402224,
                    'share_premium': None,
                    'retained_earnings': None,
                    'reserves_reserves': 552439414,
                    'total_equity': 6433841638,
                    'total_liabilities_equity': 68338179123,
                }
            },
            '073-074': {
                'ASSETS': {
                    'cash_equivalent': 6543129573,
                    'due_from_nrb': 9120743031,
                    'placement_bfis': 1908275000,
                    'derivative_assets': 22823158,
                    'trading_assets': None,
                    'loans_bfis': 1794591453,
                    'loans_customers': 59702056935,
                    'investment_securities': 8880877691,
                    'current_tax_assets': 32911140,
                    'subsidiaries': 45560880,
                    'associates': None,
                    'investment_property': 515547750,
                    'property_equipment': 2135117059,
                    'intangible_assets': 14377421,
                    'deferred_tax_assets': None,
                    'other_assets': 1908965158,
                    'total_assets': 92624976248,
                },
                'LIABILITIES': {
                    'due_to_bfis': 215240103,
                    'due_to_nrb': 37146500,
                    'derivative_liabilities': None,
                    'deposits_customers': 81349539827,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 23324554,
                    'deferred_tax_liabilities': 349582267,
                    'other_liabilities': 1299239327,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 83274072578,
                },
                'EQUITY': {
                    'share_capital': 5881402224,
                    'share_premium': 117364483,
                    'retained_earnings': 1882122101,
                    'reserves_reserves': 1470014862,
                    'total_equity': 9350903671,
                    'total_liabilities_equity': 92624976248,
                }
            },
            '074-075': {
                'ASSETS': {
                    'cash_equivalent': 13155090517,
                    'due_from_nrb': 6172041021,
                    'placement_bfis': 2215410511,
                    'derivative_assets': 3443263451,
                    'trading_assets': None,
                    'loans_bfis': 3181808776,
                    'loans_customers': 72990231929,
                    'investment_securities': 8035890509,
                    'current_tax_assets': 38573248,
                    'subsidiaries': 116960880,
                    'associates': None,
                    'investment_property': 464795000,
                    'property_equipment': 2107743392,
                    'intangible_assets': 17231105,
                    'deferred_tax_assets': None,
                    'other_assets': 4090390035,
                    'total_assets': 116029000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4411760685,
                    'due_to_nrb': 702208536,
                    'derivative_liabilities': 3489109912,
                    'deposits_customers': 92847904257,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 23324554,
                    'deferred_tax_liabilities': 387174766,
                    'other_liabilities': None,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 103459000000,
                },
                'EQUITY': {
                    'share_capital': 8233948524,
                    'share_premium': 151947990,
                    'retained_earnings': 773629730,
                    'reserves_reserves': 3410720204,
                    'total_equity': 12570246448,
                    'total_liabilities_equity': 116029000000,
                }
            },
            '075-076': {
                'ASSETS': {
                    'cash_equivalent': 13792337018,
                    'due_from_nrb': 8031269133,
                    'placement_bfis': None,
                    'derivative_assets': 4476352355,
                    'trading_assets': None,
                    'loans_bfis': 3931926634,
                    'loans_customers': 85821175779,
                    'investment_securities': 14448530074,
                    'current_tax_assets': None,
                    'subsidiaries': 116960880,
                    'associates': None,
                    'investment_property': 438785936,
                    'property_equipment': 2280261690,
                    'intangible_assets': 39768799,
                    'deferred_tax_assets': 261996224,
                    'other_assets': 4246972021,
                    'total_assets': 137886000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 8004942439,
                    'due_to_nrb': 797271683,
                    'derivative_liabilities': 4393479202,
                    'deposits_customers': 105489000000,
                    'borrowings': None,
                    'current_tax_liabilities': 352998342,
                    'provisions': 23324555,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 4505147252,
                    'debt_securities': None,
                    'subordinated_liabilities': None,
                    'total_liabilities': 123566000000,
                },
                'EQUITY': {
                    'share_capital': 8892674706,
                    'share_premium': None,
                    'retained_earnings': 1520914579,
                    'reserves_reserves': 3907077989,
                    'total_equity': 14320667275,
                    'total_liabilities_equity': 137886000000,
                }
            },
            '076-077': {
                'ASSETS': {
                    'cash_equivalent': 8446068125,
                    'due_from_nrb': 8716147441,
                    'placement_bfis': None,
                    'derivative_assets': 5353759640,
                    'trading_assets': None,
                    'loans_bfis': 3897659053,
                    'loans_customers': 99397724497,
                    'investment_securities': 20318132889,
                    'current_tax_assets': 156814124,
                    'subsidiaries': 524229080,
                    'associates': None,
                    'investment_property': 512405873,
                    'property_equipment': 2358887338,
                    'intangible_assets': 180222014,
                    'deferred_tax_assets': 302957244,
                    'other_assets': 6040058824,
                    'total_assets': 167517000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7785248887,
                    'due_to_nrb': 4794405958,
                    'derivative_liabilities': 5311757836,
                    'deposits_customers': 128741000000,
                    'borrowings': 495179567,
                    'current_tax_liabilities': None,
                    'provisions': 23324555,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 3980515523,
                    'debt_securities': 998323929,
                    'subordinated_liabilities': None,
                    'total_liabilities': 152130000000,
                },
                'EQUITY': {
                    'share_capital': 10315506635,
                    'share_premium': 644823,
                    'retained_earnings': 1216498788,
                    'reserves_reserves': 3855764831,
                    'total_equity': 15387770254,
                    'total_liabilities_equity': 167517000000,
                }
            },
            '077-078': {
                'ASSETS': {
                    'cash_equivalent': 8371902672,
                    'due_from_nrb': 10497986812,
                    'placement_bfis': 595750000,
                    'derivative_assets': 6116144232,
                    'trading_assets': 237856592,
                    'loans_bfis': 7362449879,
                    'loans_customers': 135118000000,
                    'investment_securities': 33356499212,
                    'current_tax_assets': 159312750,
                    'subsidiaries': 524229080,
                    'associates': None,
                    'investment_property': 349026261,
                    'property_equipment': 2305374979,
                    'intangible_assets': 143710769,
                    'deferred_tax_assets': 427337421,
                    'other_assets': 3908983876,
                    'total_assets': 215514000000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 5591187089,
                    'due_to_nrb': 11261512320,
                    'derivative_liabilities': 6082412094,
                    'deposits_customers': 164851000000,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 23324555,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 4956246850,
                    'debt_securities': 5637074011,
                    'subordinated_liabilities': None,
                    'total_liabilities': 198402000000,
                },
                'EQUITY': {
                    'share_capital': 11347057299,
                    'share_premium': None,
                    'retained_earnings': 1599389626,
                    'reserves_reserves': 4164825935,
                    'total_equity': 17111272860,
                    'total_liabilities_equity': 215514000000,
                }
            },
            '078-079': {
                'ASSETS': {
                    'cash_equivalent': 7664020153,
                    'due_from_nrb': 13514389394,
                    'placement_bfis': 12795819,
                    'derivative_assets': 1523798893,
                    'trading_assets': 124284116,
                    'loans_bfis': 6411836225,
                    'loans_customers': 145381570813,
                    'investment_securities': 49700751625,
                    'current_tax_assets': 109056731,
                    'subsidiaries': 524229080,
                    'associates': None,
                    'investment_property': 458749551,
                    'property_equipment': 3545392132,
                    'intangible_assets': 115160384,
                    'deferred_tax_assets': 458985664,
                    'other_assets': 3207953037,
                    'total_assets': 232753000618,
                },
                'LIABILITIES': {
                    'due_to_bfis': 4308715129,
                    'due_to_nrb': 16083276235,
                    'derivative_liabilities': 1516656713,
                    'deposits_customers': 178652184679,
                    'borrowings': None,
                    'current_tax_liabilities': None,
                    'provisions': 23324555,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 7383319922,
                    'debt_securities': 5637773039,
                    'subordinated_liabilities': None,
                    'total_liabilities': 213605250273,
                },
                'EQUITY': {
                    'share_capital': 12708704175,
                    'share_premium': None,
                    'retained_earnings': 1032973993,
                    'reserves_reserves': 5406072178,
                    'total_equity': 19147750346,
                    'total_liabilities_equity': 232753000618,
                }
            },
            '080-081': {
                'ASSETS': {
                    'cash_equivalent': 8089835199,
                    'due_from_nrb': 15285132407,
                    'placement_bfis': 346129611,
                    'derivative_assets': 261463383,
                    'trading_assets': 202230758,
                    'loans_bfis': 8660301173,
                    'loans_customers': 221045599062,
                    'investment_securities': 93329980518,
                    'current_tax_assets': None,
                    'subsidiaries': 795729080,
                    'associates': None,
                    'investment_property': 789752163,
                    'property_equipment': 4603367196,
                    'intangible_assets': 323271588,
                    'deferred_tax_assets': 324463044,
                    'other_assets': 7061458192,
                    'total_assets': 361118713373,
                },
                'LIABILITIES': {
                    'due_to_bfis': 7216236214,
                    'due_to_nrb': 950000, # Note: table has 950,000.00 in 080-081 under due_to_nrb
                    'derivative_liabilities': 259962882,
                    'deposits_customers': 305012852172,
                    'borrowings': 66825000,
                    'current_tax_liabilities': 60163250,
                    'provisions': 105679334,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 7314658419,
                    'debt_securities': 7840248287,
                    'subordinated_liabilities': None,
                    'total_liabilities': 3284790000558, # Note: table value says 3,284,790,000,558.00. We seed it exactly.
                },
                'EQUITY': {
                    'share_capital': 23542489832,
                    'share_premium': None,
                    'retained_earnings': -3025526038,
                    'reserves_reserves': 12122749022,
                    'total_equity': 32639712816,
                    'total_liabilities_equity': 361118713373,
                }
            },
            '081-082': {
                'ASSETS': {
                    'cash_equivalent': 8695200 * 1000, # Note: column headers say values are in Rs, but the last column 081-082 shows values scaled like (in 000') e.g. 8,695,200.00 instead of 8.6 Billion. We scale it up by 1000 to match the other columns.
                    'due_from_nrb': 20873856 * 1000,
                    'placement_bfis': 242430 * 1000,
                    'derivative_assets': 7217243 * 1000,
                    'trading_assets': 197869 * 1000,
                    'loans_bfis': 7829686 * 1000,
                    'loans_customers': 225455923 * 1000,
                    'investment_securities': 119483759 * 1000,
                    'current_tax_assets': 275618 * 1000,
                    'subsidiaries': 795729 * 1000,
                    'associates': 179188 * 1000,
                    'investment_property': 1654263 * 1000,
                    'property_equipment': 4292137 * 1000,
                    'intangible_assets': 298192 * 1000,
                    'deferred_tax_assets': 869217 * 1000,
                    'other_assets': 7247916 * 1000,
                    'total_assets': 405608227 * 1000,
                },
                'LIABILITIES': {
                    'due_to_bfis': 5899651 * 1000,
                    'due_to_nrb': None,
                    'derivative_liabilities': 7224752 * 1000,
                    'deposits_customers': 280926467853, # Note: Deposits from Customers is already full scale in this cell: 280,926,467,853.00. Wait, deposits customers has 280,926,467,853.00, or in the cell does it have 280,926,468.00 in Q4? Let's check: deposits customers cell has 280,926,467,853.00. Wait, yes, it has full scale. Wait, no, the deposits customers under 081-082 is 280,926,467,853.00, but in the liabilities table deposits customers is 280,926,467,853.00. Let's see: deposits customers cell: 280,926,467,853.00. Let's use the provided cell.
                    'borrowings': 687750 * 1000,
                    'current_tax_liabilities': None,
                    'provisions': 105679 * 1000,
                    'deferred_tax_liabilities': None,
                    'other_liabilities': 8091718 * 1000,
                    'debt_securities': 7841669 * 1000,
                    'subordinated_liabilities': None,
                    'total_liabilities': 372039760 * 1000,
                },
                'EQUITY': {
                    'share_capital': 23542490 * 1000,
                    'share_premium': None,
                    'retained_earnings': -2565482 * 1000,
                    'reserves_reserves': 12591459 * 1000,
                    'total_equity': 33568467 * 1000,
                    'total_liabilities_equity': 405608227 * 1000,
                }
            }
        }

        # Profit & Loss Data (FY 072-073 to 081-082, excluding 079-080)
        profit_loss_data = {
            '072-073': {
                'INCOME': {
                    'interest_income': 3590979713,
                    'interest_expense': 1622497137,
                    'net_interest_income': 1968482576,
                    'total_operating_income': 2524351100,
                },
                'EXPENSES': {
                    'personnel_expenses': 700189434,
                    'operating_profit': 674447342,
                    'net_profit': 1117363714,
                },
                'REGULATORY': {}
            },
            '073-074': {
                'INCOME': {
                    'interest_income': 5200759092,
                    'interest_expense': 2957637155,
                    'net_interest_income': 2243121937,
                    'fee_income': 520122723,
                    'fee_expense': 55040284,
                    'net_fee_income': 465082440,
                    'net_int_fee_income': 2708204376,
                    'trading_income': 192666836,
                    'other_operating_income': 130169466,
                    'total_operating_income': 3031040678,
                },
                'EXPENSES': {
                    'impairment_charge': -1503433280,
                    'personnel_expenses': 1130094845,
                    'other_operating_expenses': 558601312,
                    'depreciation': 197956338,
                    'operating_profit': 2647821462,
                    'non_operating_income': 50000,
                    'non_operating_expense': 349402333,
                    'pbt': 2298469129,
                    'tax': 811968296,
                    'net_profit': 1486500834,
                },
                'REGULATORY': {
                    'cd_ratio': 76.19,
                    'core_capital': 9.45,
                    'supplementary_capital': 1.73,
                    'capital_fund': 11.18,
                    'liquidity_crr': 12.13,
                    'base_rate': 10.51,
                    'spread': 5.09,
                    'total_employees': 1444,
                }
            },
            '074-075': {
                'INCOME': {
                    'interest_income': 8244597451,
                    'interest_expense': 5426594895,
                    'net_interest_income': 2818002555,
                    'fee_income': 614140670,
                    'fee_expense': 70963179,
                    'net_fee_income': 543177491,
                    'net_int_fee_income': 3361180046,
                    'trading_income': 341153748,
                    'other_operating_income': 54690557,
                    'total_operating_income': 3757024351,
                },
                'EXPENSES': {
                    'impairment_charge': -154551213,
                    'personnel_expenses': 1348633800,
                    'other_operating_expenses': 617804888,
                    'depreciation': 201131342,
                    'operating_profit': 1744005534,
                    'non_operating_income': 6500000,
                    'non_operating_expense': 400056190,
                    'pbt': 1350449344,
                    'tax': 383414500,
                    'net_profit': 967034844,
                },
                'REGULATORY': {
                    'cd_ratio': 81.04,
                    'core_capital': 10.82,
                    'supplementary_capital': 1.04,
                    'capital_fund': 11.86,
                    'liquidity_crr': 6.83,
                    'base_rate': 10.62,
                    'spread': 4.72,
                    'total_employees': 1677,
                }
            },
            '075-076': {
                'INCOME': {
                    'interest_income': 10765064446,
                    'interest_expense': 6366966309,
                    'net_interest_income': 4398098137,
                    'fee_income': 904700287,
                    'fee_expense': 121956665,
                    'net_fee_income': 782743622,
                    'net_int_fee_income': 5180841759,
                    'trading_income': 366924420,
                    'other_operating_income': 54753679,
                    'total_operating_income': 5602519858,
                },
                'EXPENSES': {
                    'impairment_charge': 370138025,
                    'personnel_expenses': 1747760950,
                    'other_operating_expenses': 986974778,
                    'depreciation': 226914515,
                    'operating_profit': 2270731590,
                    'non_operating_income': 11813730,
                    'non_operating_expense': 170417262,
                    'pbt': 2112128057,
                    'tax': 328535519,
                    'net_profit': 1783592538,
                },
                'REGULATORY': {
                    'cd_ratio': 87.94,
                    'core_capital': 10.22,
                    'supplementary_capital': 0.94,
                    'capital_fund': 11.16,
                    'liquidity_crr': 4.39,
                    'base_rate': 9.36,
                    'spread': 4.70,
                    'total_employees': 2061,
                }
            },
            '076-077': {
                'INCOME': {
                    'interest_income': 11797450755,
                    'interest_expense': 7276493778,
                    'net_interest_income': 4520956977,
                    'fee_income': 926174682,
                    'fee_expense': 104583252,
                    'net_fee_income': 821591429,
                    'net_int_fee_income': 5342548406,
                    'trading_income': 393476422,
                    'other_operating_income': 94749347,
                    'total_operating_income': 5830774175,
                },
                'EXPENSES': {
                    'impairment_charge': 536658377,
                    'personnel_expenses': 2156704392,
                    'other_operating_expenses': 1058195778,
                    'depreciation': 273892286,
                    'operating_profit': 1805323341,
                    'non_operating_income': 4447500,
                    'non_operating_expense': 48017408,
                    'pbt': 1761753433,
                    'tax': 567549544,
                    'net_profit': 1194203890,
                },
                'REGULATORY': {
                    'cd_ratio': 78.26,
                    'core_capital': 9.37,
                    'supplementary_capital': 1.81,
                    'capital_fund': 11.18,
                    'liquidity_crr': 11.20,
                    'base_rate': 8.32,
                    'spread': 3.57,
                    'total_employees': 2331,
                }
            },
            '077-078': {
                'INCOME': {
                    'interest_income': 12899275434,
                    'interest_expense': 7875970802,
                    'net_interest_income': 5023304632,
                    'fee_income': 1140532739,
                    'fee_expense': 120297623,
                    'net_fee_income': 1020235116,
                    'net_int_fee_income': 6043539748,
                    'trading_income': 507229103,
                    'other_operating_income': 163303131,
                    'total_operating_income': 6714071982,
                },
                'EXPENSES': {
                    'impairment_charge': 115968654,
                    'personnel_expenses': 2509055751,
                    'other_operating_expenses': 1185562706,
                    'depreciation': 300208416,
                    'operating_profit': 2603276455,
                    'non_operating_income': 47093724,
                    'non_operating_expense': 194361460,
                    'pbt': 2456008719,
                    'tax': 735133871,
                    'net_profit': 1720874849,
                },
                'REGULATORY': {
                    'cd_ratio': 83.95,
                    'core_capital': 8.55,
                    'supplementary_capital': 4.55,
                    'capital_fund': 13.10,
                    'liquidity_crr': 4.26,
                    'base_rate': 6.88,
                    'spread': 3.65,
                    'total_employees': 2424,
                }
            },
            '078-079': {
                'INCOME': {
                    'interest_income': 17030032681,
                    'interest_expense': 11287219387,
                    'net_interest_income': 5742813293,
                    'fee_income': 1376883668,
                    'fee_expense': 83638314,
                    'net_fee_income': 1293245354,
                    'net_int_fee_income': 7036058647,
                    'trading_income': 249470598,
                    'other_operating_income': 243194758,
                    'total_operating_income': 7528724004,
                },
                'EXPENSES': {
                    'impairment_charge': 430583616,
                    'personnel_expenses': 2702811811,
                    'other_operating_expenses': 1033477707,
                    'depreciation': 509538760,
                    'operating_profit': 2852232109,
                    'non_operating_income': 14370950,
                    'non_operating_expense': 120219132,
                    'pbt': 2746383927,
                    'tax': 844368765,
                    'net_profit': 1902015162,
                },
                'REGULATORY': {}
            },
            '080-081': {
                'INCOME': {
                    'interest_income': 31899378044,
                    'interest_expense': 20008484124,
                    'net_interest_income': 11890893920,
                    'fee_income': 2009143133,
                    'fee_expense': 98640517,
                    'net_fee_income': 1910502616,
                    'net_int_fee_income': 13801396536,
                    'trading_income': 384547414,
                    'other_operating_income': 352535437,
                    'total_operating_income': 14538479387,
                },
                'EXPENSES': {
                    'impairment_charge': 4719871315,
                    'personnel_expenses': 443545529, # Note: table value says 4,435,455,229.00 but cell has 443545529. Wait! personnel_expenses for 080-081 is 4,435,455,229.00 in Rs. Let's fix this digit: 4435455229.
                    'other_operating_expenses': 1564296541,
                    'depreciation': 668796778,
                    'operating_profit': 3150059524,
                    'non_operating_income': 2174482,
                    'non_operating_expense': 2783592,
                    'pbt': 3149450415,
                    'tax': None,
                    'net_profit': 510855995,
                },
                'REGULATORY': {
                    'cd_ratio': 74.66,
                    'core_capital': 8.70,
                    'supplementary_capital': 3.67,
                    'capital_fund': 12.37,
                    'liquidity_crr': 4.76,
                    'npl_ratio': 4.94,
                    'base_rate': 8.20,
                    'spread': 3.97,
                    'total_employees': 3225,
                }
            },
            '081-082': {
                'INCOME': {
                    'interest_income': 23229499 * 1000,
                    'interest_expense': 16031635 * 1000,
                    'net_interest_income': 7197864 * 1000,
                    'fee_income': 2461853 * 1000,
                    'fee_expense': 249219 * 1000,
                    'net_fee_income': 2212633 * 1000,
                    'net_int_fee_income': 9410498 * 1000,
                    'trading_income': 542600 * 1000,
                    'other_operating_income': 619535 * 1000,
                    'total_operating_income': 10572632 * 1000,
                },
                'EXPENSES': {
                    'impairment_charge': 2402868 * 1000,
                    'personnel_expenses': 4129920 * 1000,
                    'other_operating_expenses': 1465482 * 1000,
                    'depreciation': 714536 * 1000,
                    'operating_profit': 1859826 * 1000,
                    'non_operating_income': 25038 * 1000,
                    'non_operating_expense': 2691 * 1000,
                    'pbt': 1882172 * 1000,
                    'tax': None,
                    'net_profit': 872326 * 1000,
                },
                'REGULATORY': {
                    'npl_ratio': 7.01,
                    'base_rate': 6.66,
                    'spread': 3.73,
                }
            }
        }

        # Fix specific cell errors
        profit_loss_data['080-081']['EXPENSES']['personnel_expenses'] = 4435455229

        # Dividend Data (on financial report models)
        dividend_data = {
            '072-073': {'bonus': 17.25, 'cash': 1.21, 'book_close': '2017-01-12'},
            '073-074': {'bonus': 27.00, 'cash': 0.00, 'book_close': '2017-12-20'},
            '074-075': {'bonus': 16.00, 'cash': 0.00, 'book_close': '2019-05-23'},
            '075-076': {'bonus': 16.00, 'cash': 0.00, 'book_close': '2019-12-30'},
            '076-077': {'bonus': 15.00, 'cash': 0.00, 'book_close': '2021-01-04'},
            '077-078': {'bonus': 16.00, 'cash': 0.6313, 'book_close': '2021-12-08'},
            '078-079': {'bonus': 4.00, 'cash': 4.95, 'book_close': '2022-12-29'},
            '080-081': {'bonus': 0.00, 'cash': 5.00, 'book_close': '2024-11-24'},
            '081-082': {'bonus': 8.00, 'cash': 0.421, 'book_close': '2026-01-05'},
        }

        # Dividend records for the Dividend model
        historical_dividends = [
            {'fy': '2081/2082', 'bonus': 8.00, 'cash': 0.421, 'book_close': '2026-01-05'},
            {'fy': '2080/2081', 'bonus': 0.00, 'cash': 5.00, 'book_close': '2024-11-24'},
            {'fy': '2078/2079', 'bonus': 4.00, 'cash': 4.95, 'book_close': '2022-12-29'},
            {'fy': '2077/2078', 'bonus': 16.00, 'cash': 0.6313, 'book_close': '2021-12-08'},
            {'fy': '2076/2077', 'bonus': 15.00, 'cash': 0.00, 'book_close': '2021-01-04'},
            {'fy': '2075/2076', 'bonus': 16.00, 'cash': 0.00, 'book_close': '2019-12-30'},
            {'fy': '2074/2075', 'bonus': 16.00, 'cash': 0.00, 'book_close': '2019-05-23'},
            {'fy': '2073/2074', 'bonus': 27.00, 'cash': 0.00, 'book_close': '2017-12-20'},
            {'fy': '2072/2073', 'bonus': 17.25, 'cash': 1.21, 'book_close': '2017-01-12'},
            {'fy': '2071/2072', 'bonus': 18.00, 'cash': 0.95, 'book_close': '2015-12-30'},
            {'fy': '2070/2071', 'bonus': 19.00, 'cash': 1.00, 'book_close': '2014-12-28'},
            {'fy': '2069/2070', 'bonus': 10.00, 'cash': 5.00, 'book_close': '2013-12-27'},
            {'fy': '2068/2069', 'bonus': 4.00, 'cash': 7.58, 'book_close': '2012-12-03'},
            {'fy': '2067/2068', 'bonus': 0.00, 'cash': 12.63, 'book_close': '2011-11-16'},
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
                ticker='PRVU',
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
            f'PRVU annual reports seeded: {created_reports} created, {updated_reports} updated.'
        ))

        # Seed Dividends
        created_divs = 0
        updated_divs = 0

        for d in historical_dividends:
            book_close_date = None
            if d["book_close"]:
                book_close_date = datetime.strptime(d["book_close"], "%Y-%m-%d").date()

            div_obj, created = Dividend.objects.update_or_create(
                ticker='PRVU',
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
            f'PRVU dividends seeded: {created_divs} created, {updated_divs} updated.'
        ))
