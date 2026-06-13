from django.core.management.base import BaseCommand
from stocks.models import DailyStockPrice, DailyFloorsheet, StockFundamental
from django.utils import timezone
import random
from datetime import timedelta
from decimal import Decimal

_NABIL_FUND_INDICATORS = [
    {"name": "PE TTM", "value": "19.81", "sector_high": "278.19", "sector_high_ticker": "NICA", "sector_low": "8.77", "sector_low_ticker": "PRVU"},
    {"name": "PBV", "value": "2.08", "sector_high": "2.82", "sector_high_ticker": "SCB", "sector_low": "0.92", "sector_low_ticker": "NBL"},
    {"name": "ROE TTM", "value": "10.96 %", "sector_high": "16.22 %", "sector_high_ticker": "EBL", "sector_low": "0.58 %", "sector_low_ticker": "NICA"},
    {"name": "PS TTM", "value": "3.43", "sector_high": "7.56", "sector_high_ticker": "SCB", "sector_low": "1.51", "sector_low_ticker": "ADBL"},
    {"name": "PEG (3-5) yrs", "value": "1.55", "sector_high": "9.24", "sector_high_ticker": "SBI", "sector_low": "0.31", "sector_low_ticker": "PRVU"},
    {"name": "ROA TTM", "value": "1.10 %", "sector_high": "1.99 %", "sector_high_ticker": "SCB", "sector_low": "0.05 %", "sector_low_ticker": "NICA"},
    {"name": "Dividend Yield", "value": "2.50 %", "sector_high": "4.68 %", "sector_high_ticker": "LSL", "sector_low": "1.98 %", "sector_low_ticker": "PCBL"},
    {"name": "Payout Ratio", "value": "49.53 %", "sector_high": "88.66 %", "sector_high_ticker": "CZBIL", "sector_low": "24.11 %", "sector_low_ticker": "PCBL"},
    {"name": "QOQ Earnings Growth", "value": "-1.40 %", "sector_high": "202.43 %", "sector_high_ticker": "NICA", "sector_low": "11.30 %", "sector_low_ticker": "SBI"},
    {"name": "YOY Earnings Growth", "value": "-14.57 %", "sector_high": "22.92 %", "sector_high_ticker": "GBIME", "sector_low": "4.57 %", "sector_low_ticker": "EBL"},
    {"name": "Distance From Graham Number", "value": "35.22 %", "sector_high": "348.26 %", "sector_high_ticker": "NICA", "sector_low": "-38.00 %", "sector_low_ticker": "NBL"},
    {"name": "Debt to Equity", "value": "9.37", "sector_high": "12.35", "sector_high_ticker": "NICA", "sector_low": "6.23", "sector_low_ticker": "SCB"},
]

_NABIL_TECH_INDICATORS = [
    {"name": "RSI 14", "value": "44.41", "sector_high": "68.08", "sector_high_ticker": "SBL", "sector_low": "40.13", "sector_low_ticker": "PRVU"},
    {"name": "MFI 14", "value": "29.88", "sector_high": "81.73", "sector_high_ticker": "SBI", "sector_low": "29.88", "sector_low_ticker": "NABIL"},
    {"name": "Price Relative Strength", "value": "65.31 %", "sector_high": "96.33 %", "sector_high_ticker": "SBL", "sector_low": "18.37 %", "sector_low_ticker": "PRVU"},
    {"name": "%B", "value": "35 %", "sector_high": "93 %", "sector_high_ticker": "SBI", "sector_low": "25 %", "sector_low_ticker": "CZBIL"},
    {"name": "Stochastic 14", "value": "33.03", "sector_high": "85.45", "sector_high_ticker": "SBL", "sector_low": "14.16", "sector_low_ticker": "NIMB"},
    {"name": "MACD", "value": "Bearish", "sector_high": "-", "sector_high_ticker": "-", "sector_low": "-", "sector_low_ticker": "-"},
    {"name": "SMA 10", "value": "Bearish", "sector_high": "-", "sector_high_ticker": "-", "sector_low": "-", "sector_low_ticker": "-"},
    {"name": "SMA 20", "value": "Bearish", "sector_high": "-", "sector_high_ticker": "-", "sector_low": "-", "sector_low_ticker": "-"},
    {"name": "SMA 50", "value": "Bearish", "sector_high": "-", "sector_high_ticker": "-", "sector_low": "-", "sector_low_ticker": "-"},
    {"name": "SMA 200", "value": "Bullish", "sector_high": "-", "sector_high_ticker": "-", "sector_low": "-", "sector_low_ticker": "-"},
    {"name": "Volume Trend", "value": "High", "sector_high": "-", "sector_high_ticker": "-", "sector_low": "-", "sector_low_ticker": "-"},
    {"name": "3M Price Trend", "value": "Bearish", "sector_high": "-", "sector_high_ticker": "-", "sector_low": "-", "sector_low_ticker": "-"},
]

_BANK_TICKERS = ['NABIL', 'SCB', 'NICA']


class Command(BaseCommand):
    help = 'Seeds database with dummy stock data'

    def _nabil_data(self):
        return {
            "fund_indicators": _NABIL_FUND_INDICATORS,
            "tech_indicators": _NABIL_TECH_INDICATORS,
            "market_cap": Decimal("135257928827.83"),
            "free_float_mcap": Decimal("54103171531.13"),
            "shares_outstanding": Decimal("270569972"),
            "public_shares": Decimal("108227989"),
            "listed_date": timezone.datetime(1985, 11, 24).date(),
            "sector": "Commercial Banks",
        }

    def _empty_data(self, ticker):
        return {
            "fund_indicators": [], "tech_indicators": [],
            "market_cap": None, "free_float_mcap": None,
            "shares_outstanding": None, "public_shares": None,
            "listed_date": None,
            "sector": "Commercial Banks" if ticker in _BANK_TICKERS else "Others",
        }

    def _build_accumulation_data(self, brokers):
        accumulation_data = {}
        for time_range in ['2Y', '1Y', '6M', '3M', '1W', '1D']:
            records = (
                [{"broker": random.choice(brokers), "qty": random.randint(1000, 50000), "type": "BUY"}
                 for _ in range(random.randint(3, 8))]
                + [{"broker": random.choice(brokers), "qty": random.randint(1000, 50000), "type": "SELL"}
                   for _ in range(random.randint(3, 8))]
            )
            records.sort(key=lambda x: x['qty'], reverse=True)
            accumulation_data[time_range] = records
        return accumulation_data

    def _seed_fundamental(self, ticker, brokers):
        self.stdout.write(f'Seeding fundamentals for {ticker}...')
        data = self._nabil_data() if ticker == 'NABIL' else self._empty_data(ticker)
        defaults = {
            "company_name": f"{ticker} Bank Ltd." if ticker in _BANK_TICKERS else f"{ticker} Company",
            "sector": data["sector"],
            "market_cap": data["market_cap"],
            "shares_outstanding": data["shares_outstanding"],
            "public_shares": data["public_shares"],
            "free_float_market_cap": data["free_float_mcap"],
            "listed_date": data["listed_date"],
            "fundamental_indicators": data["fund_indicators"],
            "technical_indicators": data["tech_indicators"],
            "broker_accumulation": self._build_accumulation_data(brokers),
        }
        if ticker == 'NABIL':
            defaults.update({"eps": Decimal("22.3"), "pe_ratio": Decimal("19.81"), "book_value": Decimal("240")})
        StockFundamental.objects.update_or_create(ticker=ticker, defaults=defaults)

    def _generate_price_rows(self, ticker, start_date, end_date):
        rows = []
        current_price = Decimal(random.uniform(100, 1000))
        current_date = start_date
        while current_date <= end_date:
            change = Decimal(random.uniform(-10, 10))
            open_price = max(current_price + change, Decimal(10))
            close_price = max(open_price + Decimal(random.uniform(-5, 5)), Decimal(10))
            high_price = max(open_price, close_price) + Decimal(random.uniform(0, 10))
            low_price = max(min(open_price, close_price) - Decimal(random.uniform(0, 10)), Decimal(1))
            rows.append(DailyStockPrice(
                ticker=ticker, date=current_date,
                open=open_price, high=high_price, low=low_price, close=close_price,
                volume=random.randint(1000, 50000),
            ))
            current_price = close_price
            current_date += timedelta(days=1)
        return rows

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding data...')
        tickers = ['NABIL', 'SCB', 'NICA', 'HIDCL', 'MLBSL']
        brokers = [str(i) for i in range(1, 60)]
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=365 * 2)
        for ticker in tickers:
            self._seed_fundamental(ticker, brokers)
        existing = set(DailyStockPrice.objects.values_list('ticker', flat=True).distinct())
        daily_prices = []
        for ticker in tickers:
            if ticker in existing:
                self.stdout.write(f'Skipping prices for {ticker}, already exists.')
                continue
            daily_prices.extend(self._generate_price_rows(ticker, start_date, end_date))
        DailyStockPrice.objects.bulk_create(daily_prices, batch_size=1000, ignore_conflicts=True)
        self.stdout.write(self.style.SUCCESS(f'Successfully seeded comprehensive data for {tickers}'))
