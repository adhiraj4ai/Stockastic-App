import re
import time
import random
from html import unescape
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import Company, FinancialReport, StockFundamental
from curl_cffi import requests

# Base sector to template mapping
SECTOR_TO_TEMPLATE = {
    'Commercial Banks': 'BANK',
    'Development Banks': 'BANK',
    'Finance': 'BANK',
    'Hydro Power': 'HYDRO',
    'Life Insurance': 'INSURANCE',
    'Non Life Insurance': 'INSURANCE',
    'Manufacturing And Processing': 'MANUFACTURING',
    'Investment': 'GENERAL',
    'Mutual Fund': 'GENERAL',
    'Hotels And Tourism': 'HOTEL',
    'Tradings': 'GENERAL',
    'Microfinance': 'BANK',
    'Others': 'GENERAL'
}

# Mapping of raw labels (lowercase, stripped) to template particulars keys
LABEL_MAPPING = {
    # Balance Sheet
    "placement with bank and financial institutions": "placement_bfis",
    "placement with bank & financial institutions": "placement_bfis",
    "placements with bfis": "placement_bfis",
    "loans and advances to customers": "loans_customers",
    "loans to customers": "loans_customers",
    "loan & advances to customers": "loans_customers",
    "investment securities": "investment_securities",
    "total assets": "total_assets",
    "deposits from customers": "deposits_customers",
    "borrowing": "borrowings",
    "borrowings": "borrowings",
    "share capital": "paid_up_capital",
    "paid up capital": "paid_up_capital",
    "paid-up capital": "paid_up_capital",
    "reserves": "reserves",
    "reserves and surplus": "reserves",
    "reserve and surplus": "reserves",
    "total equity": "total_equity",
    "total liabilities": "total_liabilities",
    "net fixed assets": "fixed_assets",
    "property, plant and equipment": "fixed_assets",
    "property and equipment": "fixed_assets",
    "capital work in progress": "cwip",
    "work in progress": "cwip",
    "long term loans": "long_term_loans",
    "long term loans & borrowings": "long_term_loans",
    "loans and borrowings": "loans_borrowings",
    "short term loans": "short_term_loans",
    "short term loans & borrowings": "short_term_loans",
    "current assets": "current_assets",
    "total current assets": "current_assets",
    "current liabilities": "current_liabilities",
    "total current liabilities": "current_liabilities",
    "insurance fund": "insurance_fund",
    "total investments": "investments",
    "investments": "investments",
    "investment and financial assets": "financial_assets",
    
    # Profit & Loss
    "interest income": "interest_income",
    "net interest income": "net_interest_income",
    "net fee and commission income": "net_fee_income",
    "net fee & commission income": "net_fee_income",
    "total operating income": "total_operating_income",
    "impairment charge/(reversal) for loan and other losses": "impairment_charges",
    "impairment charges": "impairment_charges",
    "impairment charge": "impairment_charges",
    "operating profit": "operating_profit",
    "profit for the period": "net_profit",
    "net profit": "net_profit",
    "distributable profit": "distributable_profit",
    "revenue from operations": "revenue",
    "revenue from power sales": "revenue",
    "sales revenue": "revenue",
    "revenue": "revenue",
    "cost of sales": "cost_of_sales",
    "cost of goods sold": "cost_of_sales",
    "cogs": "cost_of_sales",
    "gross profit": "gross_profit",
    "operating expenses": "operating_expenses",
    "administrative and other operating expenses": "operating_expenses",
    "finance costs": "finance_costs",
    "financial costs": "finance_costs",
    "finance cost": "finance_costs",
    "net premium": "net_premium",
    "claims paid": "claims_paid",
    "investment income": "investment_income",
    "management expenses": "expenses",
    "expenses": "expenses",
    
    # Key Ratios
    "pe ratio": "pe_ratio",
    "p/e ratio": "pe_ratio",
    "pe ratio (annualized)": "pe_ratio",
    "p/e ratio (annualized)": "pe_ratio",
    "price earning ratio": "pe_ratio",
    "price earnings ratio": "pe_ratio",
    "annualized p/e": "pe_ratio",
    "basic earnings per share(annualized eps)": "eps_annualized",
    "basic earnings per share": "eps_annualized",
    "annualized eps": "eps_annualized",
    "eps reported": "eps_reported",
    "eps": "eps_reported",
    "reported eps": "eps_reported",
    "non-performing loan(npl) to total loan": "npl",
    "non-performing loan (npl)": "npl",
    "npl": "npl",
    "cost of funds": "cost_of_funds",
    "credit to deposit ratio": "cd_ratio",
    "credit to deposit ratio (cd)": "cd_ratio",
    "cd ratio": "cd_ratio",
    "base rate": "base_rate",
    "interest spread rate": "spread",
    "interest spread": "spread",
    "spread": "spread",
    "net worth per share": "book_value",
    "book value": "book_value",
    "book value reported": "book_value_reported",
    "networth per share": "book_value",
    "roe reported": "roe_reported",
    "return on equity": "roe_reported",
    "roa reported": "roa_reported",
    "return on assets": "roa_reported"
}

# Reconstruct nested schemas for quarterly reports
QUARTERLY_TEMPLATES = {
    "BANK_QUARTERLY": {
        "balance_sheet": {
            "SUMMARY": ["placement_bfis", "loans_customers", "investment_securities", "total_assets", "deposits_customers", "borrowings", "paid_up_capital", "reserves", "total_equity"]
        },
        "profit_loss": {
            "PL": ["interest_income", "net_interest_income", "net_fee_income", "total_operating_income", "impairment_charges", "operating_profit", "net_profit", "distributable_profit"],
            "RATIOS": ["eps_annualized", "npl", "cost_of_funds", "cd_ratio", "base_rate", "spread", "book_value"]
        }
    },
    "HYDRO_QUARTERLY": {
        "balance_sheet": {
            "SUMMARY": ["paid_up_capital", "reserves", "long_term_loans", "total_equity", "total_liabilities", "fixed_assets", "total_assets"]
        },
        "profit_loss": {
            "PL": ["revenue", "cost_of_sales", "gross_profit", "operating_expenses", "operating_profit", "finance_costs", "net_profit", "eps_reported", "book_value_reported"]
        }
    },
    "HOTEL_QUARTERLY": {
        "balance_sheet": {
            "SUMMARY": ["paid_up_capital", "reserves", "total_equity", "loans_borrowings", "current_liabilities", "current_assets", "total_assets"]
        },
        "profit_loss": {
            "PL": ["revenue", "gross_profit", "operating_profit", "net_profit", "shares", "eps_reported", "book_value_reported", "roe_reported"]
        }
    },
    "INSURANCE_QUARTERLY": {
        "balance_sheet": {
            "SUMMARY": ["paid_up_capital", "reserves", "insurance_fund", "total_equity", "investments", "total_assets"]
        },
        "profit_loss": {
            "PL": ["net_premium", "claims_paid", "investment_income", "expenses", "net_profit", "policies_count", "eps_reported", "book_value_reported"]
        }
    },
    "MANUFACTURING_QUARTERLY": {
        "balance_sheet": {
            "SUMMARY": ["paid_up_capital", "reserves", "long_term_loans", "total_equity", "fixed_assets", "total_assets"]
        },
        "profit_loss": {
            "PL": ["revenue", "cost_of_sales", "gross_profit", "operating_expenses", "operating_profit", "net_profit", "eps_reported", "book_value_reported"]
        }
    },
    "GENERAL_QUARTERLY": {
        "balance_sheet": {
            "SUMMARY": ["paid_up_capital", "reserves", "total_equity", "total_liabilities", "total_assets", "current_assets", "current_liabilities"]
        },
        "profit_loss": {
            "PL": ["revenue", "gross_profit", "operating_profit", "net_profit", "eps_reported", "book_value_reported"]
        }
    }
}

class Command(BaseCommand):
    help = 'Fetches stock fundamental and quarterly reports from ShareSansar for active symbols'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=None, help='Limit the number of symbols to fetch')
        parser.add_argument('--ticker', type=str, default=None, help='Fetch a single specific ticker')
        parser.add_argument('--sector', type=str, default=None, help='Filter by sector name')

    def clean_val(self, v):
        if not v or v == "-" or v == "—":
            return None
        if isinstance(v, str):
            v = v.replace(",", "").replace("%", "").replace("Rs.", "").replace("units", "").strip()
        try:
            if "." in v:
                return float(v)
            return int(v)
        except (ValueError, TypeError):
            return v

    def map_to_nested_json(self, template_id, flat_mapped_data):
        template = QUARTERLY_TEMPLATES.get(template_id)
        if not template:
            template = QUARTERLY_TEMPLATES["GENERAL_QUARTERLY"]
        
        balance_sheet = {}
        for section_key, particulars_keys in template["balance_sheet"].items():
            balance_sheet[section_key] = {}
            for pk in particulars_keys:
                balance_sheet[section_key][pk] = flat_mapped_data.get(pk)
                
        profit_loss = {}
        for section_key, particulars_keys in template["profit_loss"].items():
            profit_loss[section_key] = {}
            for pk in particulars_keys:
                profit_loss[section_key][pk] = flat_mapped_data.get(pk)
                
        return balance_sheet, profit_loss

    def parse_table_rows(self, section_id, html_content):
        # Extract table rows under a specific tab ID
        sect_match = re.search(rf'id="{section_id}"[\s\S]*?<table[\s\S]*?>([\s\S]*?)</table>', html_content)
        if not sect_match:
            return {}
        table_content = sect_match.group(1)
        rows = re.findall(r'<tr.*?>([\s\S]*?)</tr>', table_content)
        data_dict = {}
        for row in rows:
            cells = re.findall(r'<t[dh].*?>([\s\S]*?)</t[dh]>', row)
            cleaned_cells = [unescape(re.sub(r'<[^>]*>', '', cell).strip().replace("\n", " ")) for cell in cells]
            if len(cleaned_cells) >= 2:
                key = re.sub(r'\s+', ' ', cleaned_cells[0].strip().lower())
                val = self.clean_val(cleaned_cells[1])
                data_dict[key] = val
        return data_dict

    def handle(self, *args, **options):
        companies = Company.objects.all()
        if options['ticker']:
            companies = companies.filter(symbol=options['ticker'])
        if options['sector']:
            companies = companies.filter(sector=options['sector'])
        if options['limit']:
            companies = companies[:options['limit']]
            
        total = companies.count()
        self.stdout.write(f"Starting fetch for {total} companies...")
        
        session = requests.Session()
        success_count = 0
        
        for idx, company in enumerate(companies):
            ticker = company.symbol
            self.stdout.write(f"[{idx+1}/{total}] Fetching {ticker}...")
            
            try:
                # 1. Fetch Company Page
                url = f"https://www.sharesansar.com/company/{ticker.lower()}"
                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                
                resp = session.get(url, headers=headers, impersonate="chrome", timeout=15)
                if resp.status_code != 200:
                    self.stdout.write(self.style.WARNING(f"  Failed to fetch page for {ticker}. Status: {resp.status_code}"))
                    continue
                    
                html = resp.text
                
                # Parse basic info
                name_match = re.search(r'<h1[^>]*>([^<]+)\(', html)
                company_name = name_match.group(1).strip() if name_match else company.name
                
                comp_id_match = re.search(r'id="companyid"[^>]*>(\d+)</div>', html)
                comp_id = comp_id_match.group(1) if comp_id_match else None
                
                sector_match = re.search(r'id="sector"[^>]*>([^<]+)</div>', html)
                scraped_sector = sector_match.group(1).strip() if sector_match else company.sector
                
                # 52 week high low
                high_low_match = re.search(r'52 Week High-Low\s*:\s*</span>\s*([\d\.,]+)\s*-\s*([\d\.,]+)', html)
                fifty_two_high = self.clean_val(high_low_match.group(1)) if high_low_match else None
                fifty_two_low = self.clean_val(high_low_match.group(2)) if high_low_match else None
                
                # Listed Shares, Paid Up Value, Total Paid Up Value
                profile_table_matches = re.findall(r'<td class="text-bold">([^<]+)</td>\s*<td class="text-bold">([^<]+)</td>', html)
                profile_data = {k.strip(): v.strip() for k, v in profile_table_matches}
                
                listed_shares = self.clean_val(profile_data.get("Listed Shares"))
                paid_up_value = self.clean_val(profile_data.get("Paid Up"))
                total_paid_up = self.clean_val(profile_data.get("Total Paid Up Value"))
                
                operation_date = profile_data.get("Operation Date")
                if operation_date:
                    operation_date = operation_date.strip()
                    if not re.match(r'^\d{4}-\d{2}-\d{2}$', operation_date):
                        operation_date = None
                else:
                    operation_date = None
                
                # Extract CSRF token
                csrf_match = re.search(r'name="_token"\s+value="([^"]+)"', html)
                if not csrf_match:
                    csrf_match = re.search(r'name="csrf-token"\s+content="([^"]+)"', html)
                if not csrf_match:
                    csrf_match = re.search(r'content="([^"]+)"\s+name="_token"', html)
                if not csrf_match:
                    csrf_match = re.search(r'name="_token"\s+content="([^"]+)"', html)
                csrf_token = csrf_match.group(1) if csrf_match else ""
                
                if not comp_id:
                    self.stdout.write(self.style.WARNING(f"  No companyid found for {ticker}, skipping quarterly report fetch."))
                    continue
                
                # 2. Fetch Quarterly Report
                post_url = "https://www.sharesansar.com/company-quarterly-report"
                post_headers = {
                    "X-CSRF-Token": csrf_token,
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": url,
                    "Origin": "https://www.sharesansar.com"
                }
                post_data = {
                    "company": comp_id,
                    "symbol": ticker,
                    "sector": scraped_sector
                }
                
                post_resp = session.post(post_url, headers=post_headers, data=post_data, impersonate="chrome", timeout=15)
                if post_resp.status_code != 200 or not post_resp.text.strip():
                    self.stdout.write(self.style.WARNING(f"  Failed to fetch quarterly report for {ticker}"))
                    continue
                    
                qtr_html = post_resp.text
                
                # Parse fiscal year and quarter
                header_match = re.search(r'<th>Particulars.*?</th>\s*<th>([^<]+)</th>', qtr_html)
                header_text = header_match.group(1).strip() if header_match else ""
                
                quarter_num = None
                if "1st" in header_text or "Q1" in header_text: quarter_num = 1
                elif "2nd" in header_text or "Q2" in header_text: quarter_num = 2
                elif "3rd" in header_text or "Q3" in header_text: quarter_num = 3
                elif "4th" in header_text or "Q4" in header_text: quarter_num = 4
                
                fy_match = re.search(r'(\d{4}/\d{4}|\d{3}-\d{3})', header_text)
                fiscal_year = fy_match.group(1) if fy_match else "Unknown"
                
                # Parse quarterly tables
                raw_balance = self.parse_table_rows("balance", qtr_html)
                raw_profitloss = self.parse_table_rows("profitloss", qtr_html)
                raw_keymetrics = self.parse_table_rows("keymetrics", qtr_html)
                
                # Merge into flat dictionary
                flat_scraped_data = {}
                flat_scraped_data.update(raw_balance)
                flat_scraped_data.update(raw_profitloss)
                flat_scraped_data.update(raw_keymetrics)
                
                # Map flat labels to particulars keys
                mapped_scraped_data = {}
                for raw_lbl, val in flat_scraped_data.items():
                    std_key = LABEL_MAPPING.get(raw_lbl)
                    if std_key:
                        mapped_scraped_data[std_key] = val
                
                # Map to target nested template structures
                base_temp = SECTOR_TO_TEMPLATE.get(company.sector or scraped_sector, "GENERAL")
                template_id = f"{base_temp}_QUARTERLY"
                
                nested_bs, nested_pl = self.map_to_nested_json(template_id, mapped_scraped_data)
                
                # Top-level metric extracts
                scraped_eps = mapped_scraped_data.get("eps_annualized") or mapped_scraped_data.get("eps_reported")
                scraped_pe = mapped_scraped_data.get("pe_ratio")
                scraped_bv = mapped_scraped_data.get("book_value") or mapped_scraped_data.get("book_value_reported")
                scraped_roe = mapped_scraped_data.get("roe_reported")
                
                scraped_net_profit = mapped_scraped_data.get("net_profit")
                scraped_revenue = mapped_scraped_data.get("revenue")
                scraped_operating_profit = mapped_scraped_data.get("operating_profit")
                
                # Handle factors from Rs. in '000 in quarterly report if needed
                # (For top level metrics, EPS/BV/PE are already ratios, but profit/revenue are in '000 on page)
                def scale_currency(val):
                    if val is None:
                        return None
                    return Decimal(str(val)) * 1000  # Scale by 1000
                
                # Save FinancialReport
                if quarter_num and fiscal_year != "Unknown":
                    # Clean fiscal year to match DB pattern if needed (e.g. 2082/2083 -> 082-083)
                    fy_cleaned = fiscal_year
                    fy_match_clean = re.search(r'20(\d{2})/20(\d{2})', fiscal_year)
                    if fy_match_clean:
                        fy_cleaned = f"0{fy_match_clean.group(1)}-0{fy_match_clean.group(2)}"
                    
                    report, created = FinancialReport.objects.update_or_create(
                        ticker=ticker,
                        fiscal_year=fy_cleaned,
                        report_type=FinancialReport.ReportType.QUARTERLY,
                        quarter=quarter_num,
                        defaults={
                            "report_template": template_id,
                            "is_audited": False,
                            "paid_up_capital": Decimal(str(total_paid_up)) if total_paid_up else None,
                            "eps": Decimal(str(scraped_eps)) if scraped_eps else None,
                            "pe_ratio": Decimal(str(scraped_pe)) if scraped_pe else None,
                            "book_value": Decimal(str(scraped_bv)) if scraped_bv else None,
                            "return_on_equity": Decimal(str(scraped_roe)) if scraped_roe else None,
                            "net_profit": scale_currency(scraped_net_profit),
                            "revenue": scale_currency(scraped_revenue),
                            "operating_profit": scale_currency(scraped_operating_profit),
                            "balance_sheet": nested_bs,
                            "profit_loss": nested_pl
                        }
                    )
                    self.stdout.write(f"  Saved FinancialReport: {fy_cleaned} Q{quarter_num} Template={template_id}")
                
                # Save StockFundamental
                fundamental, _ = StockFundamental.objects.update_or_create(
                    ticker=ticker,
                    defaults={
                        "company_name": company_name,
                        "sector": company.sector or scraped_sector,
                        "paid_up_capital": Decimal(str(total_paid_up)) if total_paid_up else None,
                        "shares_outstanding": Decimal(str(listed_shares)) if listed_shares else None,
                        "listed_date": operation_date,
                        "pe_ratio_unaudited": Decimal(str(scraped_pe)) if scraped_pe else None,
                        "eps_unaudited": Decimal(str(scraped_eps)) if scraped_eps else None,
                        "book_value_unaudited": Decimal(str(scraped_bv)) if scraped_bv else None,
                        "fifty_two_week_high": Decimal(str(fifty_two_high)) if fifty_two_high else None,
                        "fifty_two_week_low": Decimal(str(fifty_two_low)) if fifty_two_low else None,
                    }
                )
                self.stdout.write(f"  Saved StockFundamental")
                success_count += 1
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  Error processing {ticker}: {e}"))
                
            # Random delay to be polite to the server
            time.sleep(random.uniform(1.0, 2.5))
            
        self.stdout.write(self.style.SUCCESS(f"Successfully populated fundamental info for {success_count}/{total} symbols."))
