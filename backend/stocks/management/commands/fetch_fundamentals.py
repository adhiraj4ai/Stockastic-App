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

    @staticmethod
    def _scale_currency(val):
        if val is None:
            return None
        return Decimal(str(val)) * 1000

    @staticmethod
    def _to_dec(val):
        return Decimal(str(val)) if val else None

    @staticmethod
    def _clean_fiscal_year(fiscal_year):
        m = re.search(r'20(\d{2})/20(\d{2})', fiscal_year)
        return f"0{m.group(1)}-0{m.group(2)}" if m else fiscal_year

    def _fetch_company_page(self, session, ticker):
        url = f"https://www.sharesansar.com/company/{ticker.lower()}"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        resp = session.get(url, headers=headers, impersonate="chrome", timeout=15)
        if resp.status_code != 200:
            return None, None
        return url, resp.text

    def _parse_company_html(self, html, company):
        name_m = re.search(r'<h1[^>]*>([^<]+)\(', html)
        cid_m = re.search(r'id="companyid"[^>]*>(\d+)</div>', html)
        sec_m = re.search(r'id="sector"[^>]*>([^<]+)</div>', html)
        hl_m = re.search(r'52 Week High-Low\s*:\s*</span>\s*([\d\.,]+)\s*-\s*([\d\.,]+)', html)
        profile_kv = re.findall(r'<td class="text-bold">([^<]+)</td>\s*<td class="text-bold">([^<]+)</td>', html)
        profile = {k.strip(): v.strip() for k, v in profile_kv}
        op_date = profile.get("Operation Date", "").strip()
        if op_date and not re.match(r'^\d{4}-\d{2}-\d{2}$', op_date):
            op_date = None
        csrf_m = (re.search(r'name="_token"\s+value="([^"]+)"', html)
                  or re.search(r'name="csrf-token"\s+content="([^"]+)"', html)
                  or re.search(r'content="([^"]+)"\s+name="_token"', html))
        return {
            "company_name": name_m.group(1).strip() if name_m else company.name,
            "comp_id": cid_m.group(1) if cid_m else None,
            "scraped_sector": sec_m.group(1).strip() if sec_m else company.sector,
            "fifty_two_high": self.clean_val(hl_m.group(1)) if hl_m else None,
            "fifty_two_low": self.clean_val(hl_m.group(2)) if hl_m else None,
            "listed_shares": self.clean_val(profile.get("Listed Shares")),
            "total_paid_up": self.clean_val(profile.get("Total Paid Up Value")),
            "operation_date": op_date or None,
            "csrf_token": csrf_m.group(1) if csrf_m else "",
        }

    def _fetch_quarterly_html(self, session, url, page_info, ticker):
        post_headers = {
            "X-CSRF-Token": page_info["csrf_token"],
            "X-Requested-With": "XMLHttpRequest",
            "Referer": url, "Origin": "https://www.sharesansar.com",
        }
        post_resp = session.post(
            "https://www.sharesansar.com/company-quarterly-report",
            headers=post_headers,
            data={"company": page_info["comp_id"], "symbol": ticker, "sector": page_info["scraped_sector"]},
            impersonate="chrome", timeout=15,
        )
        if post_resp.status_code != 200 or not post_resp.text.strip():
            return None
        return post_resp.text

    def _parse_quarter_header(self, qtr_html):
        header_m = re.search(r'<th>Particulars.*?</th>\s*<th>([^<]+)</th>', qtr_html)
        header_text = header_m.group(1).strip() if header_m else ""
        quarter_num = None
        for q, markers in [(1, ("1st", "Q1")), (2, ("2nd", "Q2")), (3, ("3rd", "Q3")), (4, ("4th", "Q4"))]:
            if any(m in header_text for m in markers):
                quarter_num = q
                break
        fy_m = re.search(r'(\d{4}/\d{4}|\d{3}-\d{3})', header_text)
        return quarter_num, (fy_m.group(1) if fy_m else "Unknown")

    def _build_mapped_data(self, qtr_html):
        flat = {}
        flat.update(self.parse_table_rows("balance", qtr_html))
        flat.update(self.parse_table_rows("profitloss", qtr_html))
        flat.update(self.parse_table_rows("keymetrics", qtr_html))
        return {LABEL_MAPPING[k]: v for k, v in flat.items() if k in LABEL_MAPPING}

    def _save_financial_report(self, ticker, quarter_num, fiscal_year, template_id, page_info, mapped, bs, pl):
        fy = self._clean_fiscal_year(fiscal_year)
        FinancialReport.objects.update_or_create(
            ticker=ticker, fiscal_year=fy,
            report_type=FinancialReport.ReportType.QUARTERLY, quarter=quarter_num,
            defaults={
                "report_template": template_id, "is_audited": False,
                "paid_up_capital": self._to_dec(page_info["total_paid_up"]),
                "eps": self._to_dec(mapped.get("eps_annualized") or mapped.get("eps_reported")),
                "pe_ratio": self._to_dec(mapped.get("pe_ratio")),
                "book_value": self._to_dec(mapped.get("book_value") or mapped.get("book_value_reported")),
                "return_on_equity": self._to_dec(mapped.get("roe_reported")),
                "net_profit": self._scale_currency(mapped.get("net_profit")),
                "revenue": self._scale_currency(mapped.get("revenue")),
                "operating_profit": self._scale_currency(mapped.get("operating_profit")),
                "balance_sheet": bs, "profit_loss": pl,
            },
        )
        self.stdout.write(f"  Saved FinancialReport: {fy} Q{quarter_num} Template={template_id}")

    def _save_stock_fundamental(self, ticker, page_info, mapped, company):
        scraped_eps = mapped.get("eps_annualized") or mapped.get("eps_reported")
        StockFundamental.objects.update_or_create(
            ticker=ticker,
            defaults={
                "company_name": page_info["company_name"],
                "sector": company.sector or page_info["scraped_sector"],
                "paid_up_capital": self._to_dec(page_info["total_paid_up"]),
                "shares_outstanding": self._to_dec(page_info["listed_shares"]),
                "listed_date": page_info["operation_date"],
                "pe_ratio_unaudited": self._to_dec(mapped.get("pe_ratio")),
                "eps_unaudited": self._to_dec(scraped_eps),
                "book_value_unaudited": self._to_dec(mapped.get("book_value") or mapped.get("book_value_reported")),
                "fifty_two_week_high": self._to_dec(page_info["fifty_two_high"]),
                "fifty_two_week_low": self._to_dec(page_info["fifty_two_low"]),
            },
        )
        self.stdout.write("  Saved StockFundamental")

    def _process_company(self, session, company):
        ticker = company.symbol
        url, html = self._fetch_company_page(session, ticker)
        if not html:
            self.stdout.write(self.style.WARNING(f"  Failed to fetch page for {ticker}."))
            return False
        page_info = self._parse_company_html(html, company)
        if not page_info["comp_id"]:
            self.stdout.write(self.style.WARNING(f"  No companyid for {ticker}, skipping."))
            return False
        qtr_html = self._fetch_quarterly_html(session, url, page_info, ticker)
        if not qtr_html:
            self.stdout.write(self.style.WARNING(f"  Failed to fetch quarterly report for {ticker}"))
            return False
        quarter_num, fiscal_year = self._parse_quarter_header(qtr_html)
        mapped = self._build_mapped_data(qtr_html)
        base_temp = SECTOR_TO_TEMPLATE.get(company.sector or page_info["scraped_sector"], "GENERAL")
        template_id = f"{base_temp}_QUARTERLY"
        nested_bs, nested_pl = self.map_to_nested_json(template_id, mapped)
        if quarter_num and fiscal_year != "Unknown":
            self._save_financial_report(ticker, quarter_num, fiscal_year, template_id, page_info, mapped, nested_bs, nested_pl)
        self._save_stock_fundamental(ticker, page_info, mapped, company)
        return True

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
            self.stdout.write(f"[{idx+1}/{total}] Fetching {company.symbol}...")
            try:
                if self._process_company(session, company):
                    success_count += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  Error processing {company.symbol}: {e}"))
            time.sleep(random.uniform(1.0, 2.5))
        self.stdout.write(self.style.SUCCESS(f"Successfully populated fundamental info for {success_count}/{total} symbols."))
