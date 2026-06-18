import os
import django
import json
from decimal import Decimal
from pathlib import Path

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import Company, FinancialReport

import datetime

def decimal_serializer(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime.date, datetime.datetime)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def dump_ticker(ticker):
    try:
        company = Company.objects.get(symbol=ticker)
    except Company.DoesNotExist:
        print(f"Company {ticker} not found in DB")
        return

    reports = FinancialReport.objects.filter(ticker=ticker).order_by('fiscal_year', 'quarter')
    reports_data = []
    
    for r in reports:
        report_dict = {
            "ticker": r.ticker,
            "fiscal_year": r.fiscal_year,
            "report_type": r.report_type,
            "quarter": r.quarter,
            "is_audited": r.is_audited,
            "report_template": r.report_template,
            "paid_up_capital": r.paid_up_capital,
            "reserves_and_surplus": r.reserves_and_surplus,
            "net_profit": r.net_profit,
            "eps": r.eps,
            "book_value": r.book_value,
            "return_on_equity": r.return_on_equity,
            "bonus_share": r.bonus_share,
            "cash_dividend": r.cash_dividend,
            "dividend_announced_date": r.dividend_announced_date,
            "dividend_book_close_date": r.dividend_book_close_date,
            "balance_sheet": r.balance_sheet,
            "profit_loss": r.profit_loss,
            "cash_flow": r.cash_flow,
            "key_ratios": r.key_ratios,
        }
        reports_data.append(report_dict)

    fixture_data = {
        "ticker": ticker,
        "company": {
            "name": company.name,
            "sector": company.sector,
            "instrument_type": company.instrument_type,
        },
        "reports": reports_data
    }

    out_path = Path(__file__).resolve().parent.parent / 'backend' / 'stocks' / 'fixtures' / 'financials' / f'{ticker}.json'
    out_path.write_text(json.dumps(fixture_data, default=decimal_serializer, indent=2))
    print(f"Dumped {len(reports_data)} reports for {ticker} to {out_path}")

if __name__ == '__main__':
    dump_ticker('CIT')
    dump_ticker('API')
    dump_ticker('MEN')
    dump_ticker('SAHAS')


