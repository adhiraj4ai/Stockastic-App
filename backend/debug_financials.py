import os
import django
import json
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import FinancialReport
from stocks.serializers import FinancialReportSerializer

def debug_financials():
    ticker = 'ACLBSL' 
    print(f"Checking financials for {ticker}...")
    
    reports = FinancialReport.objects.filter(ticker=ticker).order_by('-fiscal_year', '-quarter')
    print(f"Found {reports.count()} reports.")
    for report in reports:
        print(f"ID: {report.id}, FY: {report.fiscal_year}, Q: {report.quarter}, Type: {report.report_type}, BS: {bool(report.balance_sheet)}")
        if report.id == 35:
            print("Deleting empty phantom report ID 35...")
            report.delete()
    
    reports = FinancialReport.objects.filter(ticker=ticker).order_by('-fiscal_year', '-quarter')
    print(f"Remaining: {reports.count()}")

if __name__ == '__main__':
    debug_financials()
