from ..models.market import Company
from ..models.fundamentals import StockFundamental
from ..technical import get_technical_indicators
import logging

logger = logging.getLogger(__name__)

class DataSyncService:
    @staticmethod
    def update_all_technical_indicators(progress_callback=None):
        """Calculates and updates technical indicators for all stocks, including sector stats."""
        companies = Company.objects.all()
        total = companies.count()
        processed = 0
        
        sector_data = {} 
        stock_results = {} 

        for company in companies:
            try:
                indicators = get_technical_indicators(company.symbol)
                if not indicators:
                    continue
                
                stock_results[company.symbol] = {
                    'indicators': indicators,
                    'sector': company.sector or 'Unknown'
                }
                
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
                if progress_callback:
                    progress_callback(processed, total)

            except Exception as e:
                logger.error(f"Error processing {company.symbol}: {e}")

        sector_stats = DataSyncService._calculate_sector_stats(sector_data)
        update_count = DataSyncService._save_indicators_with_stats(stock_results, sector_stats)
        
        return update_count

    @staticmethod
    def _calculate_sector_stats(sector_data):
        """Computes Sector Highs/Lows for indicators."""
        sector_stats = {}
        for sector, indicators in sector_data.items():
            sector_stats[sector] = {}
            for name, values in indicators.items():
                if not values: continue
                sorted_vals = sorted(values, key=lambda x: x['value'])
                min_obj = sorted_vals[0]
                max_obj = sorted_vals[-1]
                
                sector_stats[sector][name] = {
                    'high_val': max_obj['value'],
                    'high_ticker': max_obj['ticker'],
                    'low_val': min_obj['value'],
                    'low_ticker': min_obj['ticker']
                }
        return sector_stats

    @staticmethod
    def _save_indicators_with_stats(stock_results, sector_stats):
        """Persists indicators to the database with injected sector information."""
        update_count = 0
        for ticker, data in stock_results.items():
            try:
                my_indicators = data['indicators']
                sector = data['sector']
                stats = sector_stats.get(sector, {})
                
                updated_indicators = []
                for ind in my_indicators:
                    name = ind['name']
                    if name in stats:
                        s = stats[name]
                        ind['sector_high'] = f"{s['high_val']:.2f}"
                        ind['sector_low'] = f"{s['low_val']:.2f}"
                        ind['sector_high_ticker'] = s['high_ticker']
                        ind['sector_low_ticker'] = s['low_ticker']
                    updated_indicators.append(ind)
                
                stock, created = StockFundamental.objects.get_or_create(ticker=ticker)
                if created and sector != 'Unknown':
                    stock.sector = sector
                
                stock.technical_indicators = updated_indicators
                stock.save(update_fields=['technical_indicators', 'sector'])
                update_count += 1
            except Exception as e:
                logger.error(f"Error saving {ticker}: {e}")
        return update_count
