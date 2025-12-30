
from django.core.management.base import BaseCommand
from stocks.models import StockFundamental, Company
from stocks.technical import get_technical_indicators
from django.db.models import Max
import json

class Command(BaseCommand):
    help = 'Updates technical indicators for all stocks and calculates sector stats'

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting technical indicator update...")
        
        # 1. Fetch all companies
        companies = Company.objects.all()
        total = companies.count()
        processed = 0
        
        # Temporary storage for aggregation: sector -> indicator_name -> list of {ticker, raw_value}
        sector_data = {} 
        # Store individual results to avoid re-calculating later
        stock_results = {} # ticker -> {indicators: [], sector: str}

        self.stdout.write(f"Processing {total} stocks...")

        for company in companies:
            try:
                # Calculate indicators
                indicators = get_technical_indicators(company.symbol)
                
                if not indicators:
                    # self.stdout.write(f"Skipping {company.symbol} (insufficient data)")
                    continue
                
                stock_results[company.symbol] = {
                    'indicators': indicators,
                    'sector': company.sector or 'Unknown'
                }
                
                # Group by Sector for stats
                sector = company.sector or 'Unknown'

                if sector not in sector_data:
                    sector_data[sector] = {}
                
                for ind in indicators:
                    name = ind['name']
                    raw_val = ind.get('raw_value')
                    
                    if raw_val is not None:
                        if name not in sector_data[sector]:
                            sector_data[sector][name] = []
                        
                        sector_data[sector][name].append({
                            'ticker': company.symbol,
                            'value': raw_val
                        })
                
                processed += 1
                if processed % 50 == 0:
                     self.stdout.write(f"Processed {processed}/{total}")

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error processing {company.symbol}: {e}"))

        self.stdout.write("Calculating sector stats...")
        
        # 2. Compute Sector Highs/Lows
        # sector_stats = { sector: { indicator_name: { max_val, max_ticker, min_val, min_ticker } } }
        sector_stats = {}
        
        for sector, indicators in sector_data.items():
            sector_stats[sector] = {}
            for name, values in indicators.items():
                if not values: continue
                
                # Sort by value
                sorted_vals = sorted(values, key=lambda x: x['value'])
                
                min_obj = sorted_vals[0]
                max_obj = sorted_vals[-1]
                
                sector_stats[sector][name] = {
                    'high_val': max_obj['value'],
                    'high_ticker': max_obj['ticker'],
                    'low_val': min_obj['value'],
                    'low_ticker': min_obj['ticker']
                }

        self.stdout.write("Saving to database...")
        
        # 3. Update Stocks with Sector Info
        update_count = 0
        for ticker, data in stock_results.items():
            try:
                my_indicators = data['indicators']
                sector = data['sector']
                
                updated_indicators = []
                stats = sector_stats.get(sector, {})
                
                for ind in my_indicators:
                    name = ind['name']
                    
                    # Inject Sector Data
                    if name in stats:
                        s = stats[name]
                        # Format
                        if name == 'Bollinger Bands':
                             # Special case: raw_value was %B. 
                             # Display is stored in 'value'. 
                             # We just show max/min %B tickers.
                             ind['sector_high'] = f"{s['high_val']:.2f}" 
                             ind['sector_low'] = f"{s['low_val']:.2f}"
                        else:
                             ind['sector_high'] = f"{s['high_val']:.2f}"
                             ind['sector_low'] = f"{s['low_val']:.2f}"
                             
                        ind['sector_high_ticker'] = s['high_ticker']
                        ind['sector_low_ticker'] = s['low_ticker']
                    
                    # Create clean dict for JSONField
                    updated_indicators.append(ind)
                
                # Get or Create StockFundamental
                stock, created = StockFundamental.objects.get_or_create(ticker=ticker)
                
                # If created, ensure we valid sector from company or inferred
                if created and sector != 'Unknown':
                    stock.sector = sector
                
                stock.technical_indicators = updated_indicators
                
                # We save the whole object or just fields. 
                # Since we might have created it, saving all is safer, or at least sector + indicators
                stock.save(update_fields=['technical_indicators', 'sector'])
                
                update_count += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error saving {ticker}: {e}"))

        self.stdout.write(self.style.SUCCESS(f"Successfully updated technical indicators for {update_count} stocks."))
