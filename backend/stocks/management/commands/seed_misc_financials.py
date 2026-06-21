from django.core.management.base import BaseCommand
from stocks.models import FinancialReport, Company, StockFundamental
import decimal  # noqa: F401 — kept for backward compatibility
from decimal import Decimal
from stocks.services.dividend_service import sync_dividends_from_financials
from stocks.services.fundamental_calculator import recalculate_fundamentals


# ─── ACLBSL quarterly reports data ────────────────────────────────────────────

_ACLBSL_REPORTS = [
    {"fiscal_year": "2082/83", "quarter": 1, "data": {
        "paid_up_capital": 367143.41, "reserves_and_surplus": 210858.72,
        "customer_deposits": 1894461.42, "borrowings": 3601971.72, "loans_to_customers": 5601620.58,
        "interest_income": 203534.78, "net_interest_income": 111339.65, "total_operating_income": 124465.18,
        "operating_profit": 11723.62, "net_profit": 8206.54, "reported_eps": 8.94,
        "book_value": 157.43, "npl": 4.22, "cost_of_funds": 6.61, "cd_ratio": 226.49,
    }},
    {"fiscal_year": "2081/82", "quarter": 4, "data": {
        "paid_up_capital": 367143.41, "reserves_and_surplus": 206250.92,
        "customer_deposits": 1894900.28, "borrowings": 3359277.08, "loans_to_customers": 5315265.49,
        "interest_income": 717998.03, "net_interest_income": 370265.61, "total_operating_income": 429969.24,
        "operating_profit": 134883.72, "net_profit": 94418.61, "reported_eps": 25.72,
        "book_value": 156.18, "npl": 2.13, "cost_of_funds": 7.39, "cd_ratio": 215.90,
    }},
    {"fiscal_year": "2081/82", "quarter": 3, "data": {
        "paid_up_capital": 367143.41, "reserves_and_surplus": 173576.62,
        "customer_deposits": 1824321.82, "borrowings": 3131439.44, "loans_to_customers": 5322341.14,
        "interest_income": 508756.78, "net_interest_income": 261145.69, "total_operating_income": 307851.11,
        "operating_profit": 87608.90, "net_profit": 61326.23, "reported_eps": 22.27,
        "book_value": 147.28, "npl": 3.70, "cost_of_funds": 7.01, "cd_ratio": 225.04,
    }},
    {"fiscal_year": "2081/82", "quarter": 2, "data": {
        "paid_up_capital": 367143.41, "reserves_and_surplus": 146550.64,
        "customer_deposits": 1772848.45, "borrowings": 2944489.22, "loans_to_customers": 4799218.95,
        "interest_income": 321556.72, "net_interest_income": 161744.73, "total_operating_income": 186725.91,
        "operating_profit": 46649.60, "net_profit": 32654.72, "reported_eps": 17.79,
        "book_value": 139.92, "npl": 2.91, "cost_of_funds": 7.64, "cd_ratio": 208.36,
    }},
    {"fiscal_year": "2081/82", "quarter": 1, "data": {
        "paid_up_capital": 367143.41, "reserves_and_surplus": 155243.83,
        "customer_deposits": 1512031.54, "borrowings": 2861828.65, "loans_to_customers": 4394176.72,
        "interest_income": 162139.31, "net_interest_income": 85589.73, "total_operating_income": 95768.39,
        "operating_profit": 30734.86, "net_profit": 21514.40, "reported_eps": 23.44,
        "book_value": 142.28, "npl": 2.14, "cost_of_funds": 6.88, "cd_ratio": 216.02,
    }},
]

# ─── NABIL annual data ─────────────────────────────────────────────────────────

_NABIL_YEARS = ['072-073', '073-074', '074-075', '075-076', '076-077', '077-078', '078-079', '079-080', '080-081']

_NABIL_BS = {
    "ASSETS": {
        "Cash and Cash Equivalent": ["5,853,231,487.00", "7,167,160,590.00", "7,952,350,362.00", "12,479,697,526.00", "4,799,629,907.00", "7,285,636,456.00", "11,051,539,126.00", "6,774,258,189.00", "8,178,987,803.00"],
        "Due From Nepal Rastra Bank": ["5,231,334,342.00", "5,924,569,696.00", "7,372,284,966.00", "6,191,827,829.00", "20,021,031,281.00", "8,024,171,855.00", "13,037,239,444.00", "25,652,421,459.00", "20,182,905,272.00"],
        "Placement With BFIs": ["18,266,761,560.00", "20,514,704,893.00", "10,160,281,391.00", "11,078,728,915.00", "10,230,579,463.00", "9,865,211,974.00", "8,870,895,241.00", "13,424,389,863.00", "14,287,531,419.00"],
        "Loan and Advances To Customers": ["75,432,461,871.00", "89,149,019,312.00", "109,059,000,000.00", "127,500,000,000.00", "148,054,000,000.00", "198,021,000,000.00", "300,205,652,927.00", "331,123,170,655.00", "373,574,156,678.00"],
        "Investment Securities": ["21,465,015,600.00", "15,318,133,850.00", "18,388,082,865.00", "25,303,072,689.00", "33,633,396,986.00", "39,889,092,978.00", "62,455,044,394.00", "76,452,984,943.00", "102,940,711,759.00"],
        "Total Assets": ["131,347,000,000.00", "144,018,000,000.00", "160,978,000,000.00", "201,139,000,000.00", "237,680,000,000.00", "291,066,000,000.00", "419,818,100,950.00", "481,203,547,746.00", "557,019,891,105.00"],
    },
    "CAPITAL & LIABILITIES": {
        "Deposits From Customers": ["109,288,000,000.00", "117,436,000,000.00", "134,811,000,000.00", "162,954,000,000.00", "190,806,000,000.00", "223,474,000,000.00", "326,222,310,372.00", "396,843,499,228.00", "462,097,418,730.00"],
        "Share Capital": ["6,185,507,000.00", "8,043,221,000.00", "8,043,221,000.00", "9,011,845,400.00", "10,097,497,400.00", "13,844,451,156.00", "22,832,908,632.00", "27,056,996,729.00", "27,056,996,729.00"],
        "Reserves": ["7,153,219,346.00", "7,722,635,133.00", "9,288,251,505.00", "10,441,359,179.00", "12,181,664,334.00", "15,691,967,172.00", "27,249,118,543.00", "26,668,622,255.00", "28,537,033,066.00"],
        "Total Liabilities & Equity": ["131,347,000,000.00", "144,018,000,000.00", "160,978,000,000.00", "201,139,000,000.00", "237,680,000,000.00", "291,066,000,000.00", "419,818,100,950.00", "481,203,547,746.00", "557,019,891,105.00"],
    },
}

_NABIL_PL = {
    "PROFIT/LOSS STATEMENT": {
        "Interest Income": ["6,170,462,161.00", "8,168,869,676.00", "11,349,866,659.00", "15,243,779,866.00", "16,462,914,064.00", "17,188,718,781.00", "23,340,747,062.00", "46,251,162,764.00", "46,413,426,214.00"],
        "Interest Expense": ["1,829,490,964.00", "2,606,090,642.00", "5,087,807,629.00", "8,084,526,137.00", "9,479,248,807.00", "9,112,834,007.00", "14,421,875,671.00", "28,502,320,274.00", "30,096,111,489.00"],
        "Net Interest Income": ["4,340,971,197.00", "5,562,779,034.00", "6,262,059,030.00", "7,159,253,729.00", "6,983,665,257.00", "8,075,884,774.00", "8,918,871,391.00", "17,748,842,490.00", "16,317,314,724.00"],
        "Fee and Commission Income": ["-", "950,720,831.00", "1,053,291,866.00", "1,291,005,348.00", "1,305,227,134.00", "1,565,795,360.00", "2,043,273,963.00", "3,545,845,637.00", "3,983,674,053.00"],
        "Fee and Commission Expense": ["-", "15,350,672.00", "21,907,496.00", "64,461,059.00", "63,251,168.00", "77,226,480.00", "464,375,729.00", "651,054,033.00", "741,950,717.00"],
        "Net Fee and Commission Income": ["-", "935,370,159.00", "1,031,384,369.00", "1,226,544,289.00", "1,241,975,966.00", "1,488,568,880.00", "1,578,898,234.00", "2,894,791,604.00", "3,241,723,336.00"],
        "Net Interest, Fee and Commission Income": ["-", "6,498,149,193.00", "7,293,443,399.00", "8,385,798,018.00", "8,225,641,223.00", "9,564,453,654.00", "10,497,769,625.00", "20,643,634,094.00", "19,559,038,061.00"],
        "Net Trading Income": ["-", "321,599,740.00", "390,652,248.00", "448,342,715.00", "468,086,233.00", "643,760,640.00", "56,499,054.00", "486,560,448.00", "536,655,475.00"],
        "Other Operating Income": ["-", "485,554,694.00", "558,796,879.00", "494,669,764.00", "430,411,639.00", "1,451,435,679.00", "410,410,129.00", "365,905,537.00", "215,668,803.00"],
        "Total Operating Income": ["5,817,030,952.00", "7,305,303,627.00", "8,242,892,525.00", "9,328,810,497.00", "9,124,139,095.00", "11,659,649,973.00", "11,473,169,808.00", "21,496,100,079.00", "20,311,362,339.00"],
        "Impairment Charge/(Reversal) For Loans and Other Losses": ["-", "-12,410,154.00", "175,858,290.00", "405,174,417.00", "856,759,341.00", "827,521,912.00", "1,118,823,076.00", "5,426,269,148.00", "4,637,739,004.00"],
        "Net Operating Income": ["-", "7,317,713,781.00", "8,067,034,236.00", "8,923,636,080.00", "8,267,379,754.00", "10,832,128,061.00", "10,354,346,732.00", "16,069,830,931.00", "15,673,623,334.00"],
        "Personnel Expenses": ["787,900,575.00", "1,423,143,966.00", "1,727,709,299.00", "1,949,609,706.00", "2,009,677,804.00", "3,411,785,246.00", "2,658,925,044.00", "4,525,098,630.00", "4,660,876,329.00"],
        "Other Operating Expenses": ["-", "535,462,826.00", "562,442,051.00", "777,203,005.00", "1,049,003,643.00", "1,052,745,013.00", "1,023,800,285.00", "1,528,762,853.00", "1,685,426,853.00"],
        "Depreciation & Amortisation": ["-", "101,518,251.00", "123,921,386.00", "170,172,587.00", "115,632,924.00", "141,574,759.00", "39,003,033.00", "503,209,613.00", "679,683,082.00"],
        "Operating Profit": ["4,400,088,662.00", "5,257,888,738.00", "5,652,961,500.00", "6,026,650,782.00", "5,093,065,383.00", "6,226,023,043.00", "6,281,591,369.00", "9,512,759,834.00", "8,647,637,070.00"],
        "Non Operating Income": ["-", "16,146,435.00", "11,188,226.00", "17,009,587.00", "4,446,529.00", "35,304,371.00", "8,701,513.00", "43,333,964.00", "38,165,025.00"],
        "Non Operating Expense": ["-", "4,886,762.00", "6,805,448.00", "2,341,155.00", "2,504,740.00", "5,865,674.00", "2,730,446.00", "274,883,961.00", "89,739,873.00"],
        "Profit Before Income Tax": ["4,025,328,938.00", "5,268,848,411.00", "5,657,344,278.00", "6,041,319,214.00", "5,095,007,172.00", "6,255,461,740.00", "6,287,562,436.00", "9,281,209,837.00", "8,596,062,221.00"],
        "Income Tax Expenses": ["1,201,867,899.00", "1,566,465,601.00", "1,675,451,327.00", "1,802,465,632.00", "1,631,766,350.00", "1,727,908,902.00", "2,031,538,248.00", "-", "-"],
        "Profit/ Loss For The Period": ["2,823,461,039.00", "3,702,382,810.00", "3,981,892,950.00", "4,238,853,581.00", "3,463,240,822.00", "4,527,552,838.00", "4,256,024,188.00", "6,404,936,160.00", "6,197,108,561.00"],
    },
}

_NABIL_KR = {
    "REGULATORY & OTHER METRICS": {
        "Credit To Deposit Ratio": ["70.49 %", "65.38 %", "82.66 %", "81.96 %", "79.72 %", "89.84 %", "-", "84.19 %", "83.60 %"],
        "Adequacy Of Capital Fund": {
            "A. Core Capital": ["10.51 %", "11.21 %", "11.81 %", "11.40 %", "10.67 %", "10.67 %", "-", "10.22 %", "9.47 %"],
            "B. Supplementary Capital": ["1.22 %", "1.20 %", "1.19 %", "1.10 %", "2.40 %", "2.09 %", "-", "2.32 %", "2.77 %"],
            "C. Total Capital Fund": ["11.73 %", "12.42 %", "13.00 %", "12.50 %", "13.07 %", "12.77 %", "-", "12.54 %", "12.24 %"],
        },
        "Liquidity(Crr)": ["6.77 %", "10.02 %", "10.05 %", "4.78 %", "11.20 %", "3.66 %", "-", "6.89 %", "4.31 %"],
        "Non Performing Loans(NPL) To Total Loans": ["1.14 %", "0.79 %", "0.55 %", "0.74 %", "0.98 %", "0.84 %", "-", "3.39 %", "4.45 %"],
        "Base Rate": ["4.17 %", "6.61 %", "7.78 %", "8.09 %", "7.32 %", "5.86 %", "-", "9.52 %", "7.63 %"],
        "Wt. Average Interest Rate Spread": ["3.74 %", "4.23 %", "4.48 %", "4.19 %", "3.51 %", "3.31 %", "-", "3.80 %", "3.99 %"],
        "Total No. Of Employees": ["792.00", "848.00", "1,005.00", "1,080.00", "1,128.00", "1,271.00", "-", "2,235.00", "2,404.00"],
        "No. Of Branches": ["55.00", "55.00", "74.00", "82.00", "118.00", "135.00", "-", "265.00", "268.00"],
        "No. Of ATM": ["90.00", "100.00", "116.00", "136.00", "185.00", "185.00", "-", "298.00", "316.00"],
    },
}

_NABIL_CF_PAD_START = 6

_NABIL_CF_RAW = {
    "OPERATING ACTIVITIES": {
        "Interest Received": ["21,131,394,949.00", "46,251,162,764.00"],
        "Fees And Other Income Received": ["2,067,170,171.00", "3,955,085,138.00"],
        "Receipts From Other Operating Activities": ["769,293,682.00", "486,560,448.00"],
        "Interest Paid": ["-14,083,905,172.00", "-28,502,320,274.00"],
        "Commission And Fees Paid": ["-464,375,729.00", "-651,054,033.00"],
        "Cash Payment To Employees": ["-2,231,583,004.00", "-4,525,098,630.00"],
        "Other Expense Paid": ["-1,026,530,731.00", "-1,803,646,814.00"],
        "Net Cash Flow From Operating Activities": ["26,719,190,355.00", "14,982,478,098.00"],
    },
    "INVESTING ACTIVITIES": {
        "Purchase Of Investment Securities": ["-23,890,655,838.00", "-15,295,525,238.00"],
        "Purchase Of Property And Equipment": ["-2,214,757,533.00", "-838,382,156.00"],
        "Net Cash Used In Investing Activities": ["-27,460,897,494.00", "16,636,113,205.00"],
    },
    "FINANCING ACTIVITIES": {
        "Dividends Paid": ["511,247,813.00", "-2,625,784,493.00"],
        "Net Cash From Financing Activities": ["4,507,609,809.00", "-2,623,645,830.00"],
    },
    "CASH & EQUIVALENTS": {
        "Net Increase (Decrease) In Cash": ["3,765,902,670.00", "-4,277,280,937.00"],
        "Cash and Cash Equivalents At Year End": ["11,051,539,126.00", "6,774,258,189.00"],
    },
}

# ─── SHPC balance sheet data ───────────────────────────────────────────────────

_SHPC_YEARS = ['072-073', '073-074', '074-075', '075-076', '076-077', '077-078', '078-079', '079-080', '080-081']

_SHPC_BS = {
    "ASSETS": {
        "Property, Plant and Equipment": ["12,365,373.00", "12,383,749.00", "13,406,726.00", "15,567,884.00", "18,740,179.00", "15,759,602.00", "14,570,363.00", "11,613,498.00", "9,198,741.00"],
        "Work in progress": ["8,924,591.00", "-", "2,445,355.00", "1,069,263.00", "-", "-", "-", "-", "1,146,222.00"],
        "Investment and Financial Assets": ["13,833,128.00", "243,901,109.00", "146,315,863.00", "247,513,282.00", "1,240,963,282.00", "1,312,495,502.00", "1,578,000,000.00", "1,675,211,158.00", "3,666,725,054.00"],
        "Total Non- Current Assets": ["4,343,026,883.00", "4,426,054,850.00", "4,197,292,683.00", "4,157,420,278.00", "5,000,359,556.00", "4,915,873,360.00", "5,074,078,832.00", "2,278,335,654.87", "6,506,150,307.00"],
        "Total Current Assets": ["227,351,086.00", "445,191,702.00", "1,298,739,972.00", "1,220,854,674.00", "487,045,259.00", "576,040,707.00", "666,466,229.00", "1,072,647,090.00", "1,034,927,228.00"],
        "Total Assets": ["4,570,377,969.00", "4,871,246,552.00", "5,496,032,655.00", "5,378,274,952.00", "5,487,404,815.00", "5,491,914,067.00", "5,740,545,061.00", "6,645,700,601.00", "7,541,077,535.00"],
    },
    "CAPITAL & LIABILITIES": {
        "Share Capital": ["1,055,000,000.00", "1,366,957,500.00", "2,110,000,000.00", "2,321,000,000.00", "2,553,100,000.00", "2,808,410,000.00", "3,089,251,000.00", "3,089,251,000.00", "3,398,176,100.00"],
        "Reserve and Surplus": ["1,188,405.00", "281,642,880.00", "620,327,478.00", "536,094,935.00", "653,802,165.00", "677,992,221.00", "931,311,008.00", "1,923,915,755.00", "1,406,905,457.00"],
        "Total Equity": ["1,056,188,405.00", "1,648,600,380.00", "2,730,327,478.00", "2,857,094,935.00", "3,206,902,165.00", "3,486,402,221.00", "4,020,562,008.00", "5,013,166,755.00", "6,051,757,678.00"],
        "Long Term Loans & Borrowings": ["3,101,989,985.00", "2,912,725,108.00", "2,470,100,354.00", "2,234,549,815.00", "1,980,433,583.00", "1,713,412,048.00", "1,351,450,097.00", "990,504,850.00", "577,196,377.00"],
        "Total Non- Current Liabilities": ["3,196,706,292.00", "2,965,858,867.00", "2,516,387,193.00", "2,246,602,608.00", "1,982,021,697.00", "1,715,263,479.00", "1,358,954,353.00", "-", "585,461,315.00"],
        "Short Term Loans & Borrowings": ["173,866,997.00", "193,502,379.00", "207,808,392.00", "235,550,539.00", "259,701,534.00", "267,021,534.00", "334,334,356.00", "364,156,152.00", "413,308,681.00"],
        "Total Current Liabilities": ["317,483,272.00", "256,787,304.00", "249,317,983.00", "274,577,409.00", "298,480,952.00", "290,248,366.00", "361,028,700.00", "-", "1,076,010,906.00"],
        "Total Liabilities": ["3,514,189,564.00", "3,222,646,171.00", "2,765,705,177.00", "2,521,180,017.00", "2,280,502,650.00", "2,005,511,845.00", "1,719,983,053.00", "1,632,533,846.00", "1,489,319,587.00"],
        "Total Equity and Liabilities": ["4,570,377,969.00", "4,871,246,552.00", "5,496,032,655.00", "5,378,274,952.00", "5,487,404,815.00", "5,491,914,067.00", "5,740,545,061.00", "6,645,700,601.00", "7,541,077,535.00"],
    },
}

# ─── UPPER balance sheet data ──────────────────────────────────────────────────

_UPPER_YEARS = ['2079/80', '2080/81']

_UPPER_BS = {
    "NON-CURRENT ASSETS": {
        "Property, Plant and Equipment": [10000000000, 11000000000],
        "Capital Work in Progress": [500000000, 200000000],
        "Intangible Assets": [1000000, 900000],
    },
    "CURRENT ASSETS": {
        "Inventories": [5000000, 6000000],
        "Trade Receivables": [20000000, 25000000],
        "Cash and Cash Equivalents": [100000000, 150000000],
    },
    "EQUITY": {
        "Share Capital": [5000000000, 5000000000],
        "Retained Earnings": [1000000000, 1200000000],
    },
}

_MLBSL_DATA = {
    "074-075": {
        "bs": {
            "ASSETS": {
                "other_assets": 39665633.00,
                "total_assets": 39665633.00,
            },
            "LIABILITIES": {
                "other_liabilities": 295700.00,
                "total_liabilities": 295700.00,
            },
            "EQUITY": {
                "share_capital": 39523606.00,
                "reserves_reserves": -153673.00,
                "total_equity": 39369933.00,
                "total_liabilities_equity": 39665633.00,
            }
        },
        "pl": {
            "INCOME": {
                "interest_income": 142027.00,
                "net_interest_income": 142027.00,
                "total_operating_income": 142027.00,
            },
            "EXPENSES": {
                "personnel_expenses": 133300.00,
                "other_operating_expenses": 162400.00,
                "operating_profit": -153673.00,
                "pbt": -153673.00,
                "net_profit": -153673.00,
            },
            "REGULATORY": {
                "total_employees": 2.0,
            }
        },
        "cf": {},
        "eps": -0.39,
        "book_value": 99.61,
    },
    "075-076": {
        "bs": {
            "ASSETS": {
                "cash_equivalent": 85918.00,
                "due_from_nrb": 5874285.00,
                "placement_bfis": 75653690.00,
                "loans_customers": 1328143303.00,
                "property_equipment": 10639264.00,
                "other_assets": 6692682.00,
                "total_assets": 1427089142.00,
            },
            "LIABILITIES": {
                "borrowings": 778836200.00,
                "deposits_customers": 480288929.00,
                "other_liabilities": 12672151.00,
                "total_liabilities": 1271797280.00,
            },
            "EQUITY": {
                "share_capital": 60000000.00,
                "reserves_reserves": 95291862.00,
                "total_equity": 155291862.00,
                "total_liabilities_equity": 1427089142.00,
            }
        },
        "pl": {
            "INCOME": {
                "interest_income": 143783632.00,
                "interest_expense": 78532845.00,
                "net_interest_income": 65250787.00,
                "fee_income": 41409425.00,
                "net_fee_income": 41409425.00,
                "net_int_fee_income": 106660212.00,
                "total_operating_income": 106660212.00,
            },
            "EXPENSES": {
                "impairment_charge": 13808259.00,
                "net_operating_income": 92851953.00,
                "personnel_expenses": 43619465.00,
                "other_operating_expenses": 17622364.00,
                "operating_profit": 31610124.00,
                "non_operating_income": 5627791.00,
                "pbt": 33852650.00,
                "tax": 9616531.00,
                "net_profit": 24236119.00,
            },
            "REGULATORY": {
                "cd_ratio": 281.0,
                "npl_ratio": 0.67,
                "liquidity_crr": 0.51,
                "spread": 3.92,
                "core_capital": 9.11,
                "supplementary_capital": 0.98,
                "capital_fund": 10.09,
                "total_employees": 215.0,
            }
        },
        "cf": {},
        "eps": 40.39,
        "book_value": 258.82,
    },
    "076-077": {
        "bs": {
            "ASSETS": {
                "cash_equivalent": 557144.00,
                "due_from_nrb": 7842338.00,
                "placement_bfis": 131896154.00,
                "loans_customers": 1738262776.00,
                "property_equipment": 10550123.00,
                "other_assets": 3427195.00,
                "total_assets": 1892535729.00,
            },
            "LIABILITIES": {
                "borrowings": 1012398171.00,
                "deposits_customers": 660555973.00,
                "current_tax_liabilities": 10151265.00,
                "other_liabilities": 21536695.00,
                "total_liabilities": 1704642104.00,
            },
            "EQUITY": {
                "share_capital": 60000000.00,
                "reserves_reserves": 127893625.00,
                "total_equity": 187893625.00,
                "total_liabilities_equity": 1892535729.00,
            }
        },
        "pl": {
            "INCOME": {
                "interest_income": 270395103.00,
                "interest_expense": 142112647.00,
                "net_interest_income": 128282455.00,
                "fee_income": 50125586.00,
                "net_fee_income": 50125586.00,
                "net_int_fee_income": 178408042.00,
                "total_operating_income": 178408042.00,
            },
            "EXPENSES": {
                "impairment_charge": 40605415.00,
                "net_operating_income": 137802627.00,
                "personnel_expenses": 78390678.00,
                "other_operating_expenses": 21235345.00,
                "operating_profit": 38176603.00,
                "non_operating_income": 17052031.00,
                "pbt": 50207849.00,
                "tax": 15494357.00,
                "net_profit": 34713492.00,
            },
            "REGULATORY": {
                "cd_ratio": 269.71,
                "npl_ratio": 0.78,
                "liquidity_crr": 0.51,
                "spread": 4.44,
                "core_capital": 8.53,
                "supplementary_capital": 2.33,
                "capital_fund": 10.86,
                "total_employees": 241.0,
            }
        },
        "cf": {},
        "eps": 57.86,
        "book_value": 313.16,
    },
    "077-078": {
        "bs": {
            "ASSETS": {
                "cash_equivalent": 1831440.00,
                "placement_bfis": 20425112.00,
                "loans_bfis": 171587812.00,
                "loans_customers": 3303092376.00,
                "property_equipment": 10870171.00,
                "other_assets": 10469099.00,
                "total_assets": 3518276010.00,
            },
            "LIABILITIES": {
                "borrowings": 2246391735.00,
                "deposits_customers": 928090333.00,
                "provisions": 2500000.00,
                "other_liabilities": 43955218.00,
                "total_liabilities": 3220937286.00,
            },
            "EQUITY": {
                "share_capital": 147500000.00,
                "reserves_reserves": 149838724.00,
                "total_equity": 297338724.00,
                "total_liabilities_equity": 3518276010.00,
            }
        },
        "pl": {
            "INCOME": {
                "interest_income": 399602833.00,
                "interest_expense": 160750165.00,
                "net_interest_income": 238852668.00,
                "fee_income": 84240192.00,
                "net_fee_income": 84240192.00,
                "net_int_fee_income": 323092860.00,
                "total_operating_income": 323092860.00,
            },
            "EXPENSES": {
                "impairment_charge": 152369320.00,
                "net_operating_income": 170723540.00,
                "personnel_expenses": 92611491.00,
                "other_operating_expenses": 23685460.00,
                "operating_profit": 51426589.00,
                "non_operating_income": 60195822.00,
                "pbt": 100460169.00,
                "tax": 28534837.00,
                "net_profit": 71925332.00,
            },
            "REGULATORY": {
                "cd_ratio": 356.0,
                "npl_ratio": 1.71,
                "liquidity_crr": 0.49,
                "spread": 5.0,
                "core_capital": 7.14,
                "supplementary_capital": 1.25,
                "capital_fund": 8.39,
                "total_employees": 287.0,
            }
        },
        "cf": {},
        "eps": 48.76,
        "book_value": 201.59,
        "bonus_share": 47.50,
        "cash_dividend": 2.50,
        "dividend_book_close_date": "2021-12-02",
    },
    "078-079": {
        "bs": {
            "ASSETS": {
                "cash_equivalent": 1683862.00,
                "due_from_nrb": 59931.00,
                "placement_bfis": 25884077.00,
                "loans_bfis": 102122948.00,
                "investment_securities": 33500000.00,
                "loans_customers": 4384779907.00,
                "property_equipment": 17922372.00,
                "other_assets": 31003223.00,
                "total_assets": 4596956320.00,
            },
            "LIABILITIES": {
                "borrowings": 2775866135.00,
                "deposits_customers": 1340019569.00,
                "provisions": 3687500.00,
                "other_liabilities": 95150667.00,
                "total_liabilities": 4214723871.00,
            },
            "EQUITY": {
                "share_capital": 217562500.00,
                "reserves_reserves": 164669947.00,
                "retained_earnings": 2.00,
                "total_equity": 382232449.00,
                "total_liabilities_equity": 4596956320.00,
            }
        },
        "pl": {
            "INCOME": {
                "interest_income": 586868909.00,
                "interest_expense": 308379619.00,
                "net_interest_income": 278489290.00,
                "fee_income": 59050507.00,
                "net_fee_income": 59050507.00,
                "net_int_fee_income": 337539797.00,
                "total_operating_income": 337539797.00,
            },
            "EXPENSES": {
                "impairment_charge": 184416724.00,
                "net_operating_income": 153123073.00,
                "personnel_expenses": 129111968.00,
                "other_operating_expenses": 34125446.00,
                "operating_profit": -10114341.00,
                "non_operating_income": 152078171.00,
                "pbt": 127767447.00,
                "tax": 38419629.00,
                "net_profit": 89347818.00,
            },
            "REGULATORY": {
                "cd_ratio": 3.27,
                "npl_ratio": 0.03,
                "liquidity_crr": 0.01,
                "core_capital": 0.07,
                "supplementary_capital": 0.02,
                "capital_fund": 0.08,
                "total_employees": 350.0,
                "branches": 70.0,
            }
        },
        "cf": {
            "OPERATING": {
                "net_operating_cash": -22126967.47,
            },
            "INVESTING": {
                "net_investing_cash": -10915411.66,
            },
            "FINANCING": {
                "net_financing_cash": -2572831.99,
            },
            "SUMMARY": {
                "net_change_cash": -35615211.12,
            }
        },
        "eps": 41.07,
        "book_value": 175.69,
        "bonus_share": 47.50,
        "cash_dividend": 2.50,
        "dividend_book_close_date": "2023-02-17",
    },
    "079-080": {
        "bs": {
            "ASSETS": {
                "cash_equivalent": 128550826.83,
                "due_from_nrb": 21508746.39,
                "loans_customers": 4216687393.83,
                "property_equipment": 14195063.95,
                "other_assets": 5857407.88,
                "total_assets": 4404855575.51,
            },
            "LIABILITIES": {
                "borrowings": 2466719315.92,
                "deposits_customers": 1429394942.00,
                "other_liabilities": 72629488.05,
                "total_liabilities": 3968743745.97,
            },
            "EQUITY": {
                "share_capital": 217562500.00,
                "reserves_reserves": 182880014.60,
                "retained_earnings": 35669314.94,
                "total_equity": 436111829.54,
                "total_liabilities_equity": 4404855575.51,
            }
        },
        "pl": {
            "INCOME": {
                "interest_income": 686646168.22,
                "interest_expense": 422635076.59,
                "net_interest_income": 264011091.63,
                "fee_income": 56105603.95,
                "net_fee_income": 56105603.95,
                "net_int_fee_income": 320116695.58,
                "total_operating_income": 316876352.65,
            },
            "EXPENSES": {
                "impairment_charge": 96227101.02,
                "net_operating_income": 220649251.63,
                "personnel_expenses": 164598420.47,
                "other_operating_expenses": 28658420.21,
                "operating_profit": 21422683.69,
                "non_operating_income": 84000.00,
                "pbt": 21506683.69,
                "tax": 7167405.76,
                "net_profit": 14339277.93,
            },
            "REGULATORY": {
                "npl_ratio": 5.69,
                "core_capital": 6.50,
                "supplementary_capital": 1.65,
                "capital_fund": 8.15,
                "total_employees": 356.0,
            }
        },
        "cf": {
            "OPERATING": {
                "net_operating_cash": 6778883.62,
            },
            "INVESTING": {
                "net_investing_cash": -3327847.62,
            },
            "FINANCING": {
                "net_financing_cash": -4148886.00,
            },
            "SUMMARY": {
                "net_change_cash": -697850.00,
            }
        },
        "eps": 6.59,
        "book_value": 200.45,
    },
    "080-081": {
        "bs": {
            "ASSETS": {
                "cash_equivalent": 118205292.13,
                "due_from_nrb": 23094550.20,
                "loans_customers": 4893588371.94,
                "property_equipment": 14333219.00,
                "other_assets": 6197768.97,
                "total_assets": 5082524749.95,
            },
            "LIABILITIES": {
                "borrowings": 2963374860.76,
                "deposits_customers": 1573799755.82,
                "other_liabilities": 107120921.75,
                "total_liabilities": 4644295538.33,
            },
            "EQUITY": {
                "share_capital": 217562500.00,
                "reserves_reserves": 220666711.63,
                "total_equity": 438229211.63,
                "total_liabilities_equity": 5082524749.95,
            }
        },
        "pl": {
            "INCOME": {
                "interest_income": 640396297.06,
                "interest_expense": 423491388.09,
                "net_interest_income": 216904908.97,
                "fee_income": 65684005.79,
                "net_fee_income": 65684005.79,
                "net_int_fee_income": 282588914.76,
                "total_operating_income": 278846141.46,
            },
            "EXPENSES": {
                "personnel_expenses": 192369119.62,
                "other_operating_expenses": 31216119.75,
                "operating_profit": 68749949.30,
                "non_operating_income": -18007117.43,
                "pbt": 68766449.30,
                "tax": 20629788.00,
                "net_profit": 48136661.30,
            },
            "REGULATORY": {
                "cd_ratio": 326.62,
                "npl_ratio": 3.93,
                "liquidity_crr": 0.51,
                "spread": 5.13,
                "core_capital": 6.47,
                "supplementary_capital": 1.65,
                "capital_fund": 8.12,
                "total_employees": 365.0,
            }
        },
        "cf": {
            "OPERATING": {
                "net_operating_cash": -5611693.00,
            },
            "INVESTING": {
                "net_investing_cash": -4750341.71,
            },
            "FINANCING": {
                "net_financing_cash": 16500.00,
            },
            "SUMMARY": {
                "net_change_cash": -10345534.71,
            }
        },
        "eps": 22.13,
        "book_value": 201.43,
    }
}


def _clean_val(v):
    if v == "-" or v is None:
        return None
    if isinstance(v, str):
        v = v.replace(",", "").replace("%", "").strip()
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _pad_cf(raw_vals, total_years):
    padded = ["-"] * _NABIL_CF_PAD_START + raw_vals
    padded += ["-"] * (total_years - len(padded))
    return padded


def _build_nabil_cf():
    n = len(_NABIL_YEARS)
    return {cat: {p: _pad_cf(v, n) for p, v in parts.items()} for cat, parts in _NABIL_CF_RAW.items()}


def _clean_nested(raw_data, idx):
    return {cat: {p: _clean_val(v[idx]) for p, v in parts.items()} for cat, parts in raw_data.items()}


def _clean_kr(raw_kr_data, idx):
    result = {}
    for cat, parts in raw_kr_data.items():
        result[cat] = {}
        for p, v in parts.items():
            if isinstance(v, dict):
                result[cat][p] = {sp: _clean_val(sv[idx]) for sp, sv in v.items()}
            else:
                result[cat][p] = _clean_val(v[idx])
    return result


class Command(BaseCommand):
    help = 'Seeds detailed financial data for NABIL (Bank) and UPPER (Hydro)'

    def seed_aclbsl_fundamentals(self):
        StockFundamental.objects.update_or_create(
            ticker="ACLBSL",
            defaults={
                "company_name": "Aarambha Chautari Laghubitta",
                "sector": "Microfinance",
                "market_cap": 3344676465.10,
                "free_float_market_cap": 1337870586.04,
                "shares_outstanding": 3671434,
                "public_shares": 1468574,
                "listed_date": "2019-01-01",
                "pe_ratio": 67.18,
                "book_value": 157.43,
                "eps": 8.94,
                "dividend_yield": 0.0,
                "price_to_book": 5.8,
                "peg_ratio": 0,
            },
        )
        self.stdout.write("Seeded Fundamentals for ACLBSL")

    @staticmethod
    def _build_aclbsl_balance_sheet(d):
        return {
            "Capital Fund": {"Paid Up Capital": d["paid_up_capital"], "Reserves and Surplus": d["reserves_and_surplus"]},
            "Liabilities": {"Deposits": d["customer_deposits"], "Borrowings": d["borrowings"]},
            "Assets": {"Loans and Advances": d["loans_to_customers"]},
        }

    @staticmethod
    def _build_aclbsl_profit_loss(d):
        return {
            "Income": {"Interest Income": d["interest_income"], "Net Interest Income": d["net_interest_income"], "Total Operating Income": d["total_operating_income"]},
            "Profit": {"Operating Profit": d["operating_profit"], "Net Profit": d["net_profit"]},
        }

    @staticmethod
    def _build_aclbsl_key_ratios(d):
        return {
            "Per Share": {"EPS": d["reported_eps"], "Book Value": d["book_value"]},
            "Performance": {"NPL": d["npl"], "Cost of Funds": d["cost_of_funds"], "CD Ratio": d["cd_ratio"]},
        }

    def _upsert_aclbsl_report(self, ticker, report):
        d = report["data"]
        FinancialReport.objects.update_or_create(
            ticker=ticker, fiscal_year=report["fiscal_year"], quarter=report["quarter"],
            defaults={
                "report_type": FinancialReport.ReportType.QUARTERLY,
                "report_template": "BANK_QUARTERLY",
                "balance_sheet": self._build_aclbsl_balance_sheet(d),
                "profit_loss": self._build_aclbsl_profit_loss(d),
                "key_ratios": self._build_aclbsl_key_ratios(d),
                "net_profit": d["net_profit"],
                "revenue": d["total_operating_income"],
                "eps": d["reported_eps"],
                "is_audited": False,
            },
        )

    def seed_aclbsl_quarterly(self):
        ticker = "ACLBSL"
        Company.objects.get_or_create(
            symbol=ticker,
            defaults={"name": "Aarambha Chautari Laghubitta", "sector": "Microfinance"},
        )
        self.stdout.write("Seeding ACLBSL Data...")
        for report in _ACLBSL_REPORTS:
            self._upsert_aclbsl_report(ticker, report)
        self.stdout.write(self.style.SUCCESS(f"Successfully seeded {len(_ACLBSL_REPORTS)} quarters for {ticker}"))

    def _upsert_nabil_annual(self, ticker, idx, year, cf_data):
        FinancialReport.objects.update_or_create(
            ticker=ticker, fiscal_year=year, report_type=FinancialReport.ReportType.ANNUAL,
            defaults={
                "report_template": "BANK", "is_audited": True,
                "balance_sheet": _clean_nested(_NABIL_BS, idx),
                "profit_loss": _clean_nested(_NABIL_PL, idx),
                "cash_flow": _clean_nested(cf_data, idx),
                "key_ratios": _clean_kr(_NABIL_KR, idx),
                "net_profit": _clean_val(_NABIL_PL["PROFIT/LOSS STATEMENT"]["Profit/ Loss For The Period"][idx]),
                "revenue": _clean_val(_NABIL_PL["PROFIT/LOSS STATEMENT"]["Total Operating Income"][idx]),
                "eps": 20.0 + idx,
            },
        )

    def _upsert_nabil_quarterly(self, ticker, idx, year):
        net = _clean_val(_NABIL_PL["PROFIT/LOSS STATEMENT"]["Profit/ Loss For The Period"][idx])
        rev = _clean_val(_NABIL_PL["PROFIT/LOSS STATEMENT"]["Total Operating Income"][idx])
        FinancialReport.objects.update_or_create(
            ticker=ticker, fiscal_year=year, report_type=FinancialReport.ReportType.QUARTERLY, quarter=4,
            defaults={
                "report_template": "BANK", "is_audited": False,
                "balance_sheet": {cat: {p: (_clean_val(v[idx]) * 0.95 if _clean_val(v[idx]) is not None else None) for p, v in parts.items()} for cat, parts in _NABIL_BS.items()},
                "profit_loss": {cat: {p: (_clean_val(v[idx]) * 0.95 if _clean_val(v[idx]) is not None else None) for p, v in parts.items()} for cat, parts in _NABIL_PL.items()},
                "net_profit": (net * 0.9 if net is not None else None),
                "revenue": (rev * 0.9 if rev is not None else None),
                "eps": (20.0 + idx) * 0.9,
            },
        )

    def seed_nabil(self):
        ticker = "NABIL"
        cf_data = _build_nabil_cf()
        for idx, year in enumerate(_NABIL_YEARS):
            self._upsert_nabil_annual(ticker, idx, year, cf_data)
            self._upsert_nabil_quarterly(ticker, idx, year)
            self.stdout.write(f"Seeded {ticker} - {year}")

    def seed_upper(self):
        ticker = "UPPER"
        for i, year in enumerate(_UPPER_YEARS):
            FinancialReport.objects.update_or_create(
                ticker=ticker, fiscal_year=year, report_type=FinancialReport.ReportType.ANNUAL,
                defaults={
                    "report_template": "HYDRO", "is_audited": True,
                    "balance_sheet": {cat: {p: v[i] for p, v in parts.items()} for cat, parts in _UPPER_BS.items()},
                    "revenue": 2000000000 + (i * 500000000),
                    "net_profit": 500000000 + (i * 200000000),
                },
            )
            self.stdout.write(f"Seeded {ticker} - {year}")

    def seed_shpc(self):
        ticker = "SHPC"
        for i, year in enumerate(_SHPC_YEARS):
            bs = {cat: {p: _clean_val(vals[i]) for p, vals in parts.items()} for cat, parts in _SHPC_BS.items()}
            FinancialReport.objects.update_or_create(
                ticker=ticker, fiscal_year=year, report_type="ANNUAL",
                defaults={"balance_sheet": bs, "report_template": "HYDROPOWER"},
            )
            self.stdout.write(self.style.SUCCESS(f"Seeded {ticker} - {year}"))

    def seed_mlbsl(self):
        ticker = 'MLBSL'
        Company.all_objects.get_or_create(
            symbol=ticker,
            defaults={
                'name': 'Mahila Laghubitta Bittiya Sanstha Ltd',
                'sector': 'Microfinance',
                'instrument_type': 'Equity',
                'status': 'A',
            }
        )
        self.stdout.write("Seeding MLBSL Data...")
        for fy, raw in _MLBSL_DATA.items():
            FinancialReport.objects.update_or_create(
                ticker=ticker,
                fiscal_year=fy,
                report_type=FinancialReport.ReportType.ANNUAL,
                defaults={
                    'report_template': 'BANK',
                    'is_audited': True,
                    'balance_sheet': raw['bs'],
                    'profit_loss': raw['pl'],
                    'cash_flow': raw['cf'],
                    'net_profit': Decimal(str(raw['pl']['EXPENSES']['net_profit'])),
                    'revenue': Decimal(str(raw['pl']['INCOME']['total_operating_income'])),
                    'paid_up_capital': Decimal(str(raw['bs']['EQUITY']['share_capital'])),
                    'reserves_and_surplus': Decimal(str(raw['bs']['EQUITY']['reserves_reserves'])),
                    'eps': Decimal(str(raw['eps'])),
                    'book_value': Decimal(str(raw['book_value'])),
                    'bonus_share': Decimal(str(raw.get('bonus_share', 0))),
                    'cash_dividend': Decimal(str(raw.get('cash_dividend', 0))),
                    'dividend_book_close_date': raw.get('dividend_book_close_date'),
                }
            )
            self.stdout.write(f"Seeded MLBSL - {fy}")

        sync_dividends_from_financials(ticker)
        from django.core.management import call_command
        call_command('backfill_corporate_actions', ticker=ticker)
        recalculate_fundamentals(ticker)

    def handle(self, *args, **kwargs):
        self.seed_nabil()
        self.seed_upper()
        self.seed_shpc()
        self.seed_aclbsl_quarterly()
        self.seed_aclbsl_fundamentals()
        self.seed_mlbsl()
        self.stdout.write(self.style.SUCCESS("Successfully seeded multi-sector financials"))
