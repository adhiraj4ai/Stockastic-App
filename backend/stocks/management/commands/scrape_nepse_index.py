import re
from datetime import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import DailyIndexValue
from curl_cffi import requests

class Command(BaseCommand):
    help = 'Scrapes the daily NEPSE Index values from MeroLagani Indices page'

    def handle(self, *args, **options):
        url = "https://merolagani.com/Indices.aspx"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        self.stdout.write(f"Fetching indices from {url}...")
        try:
            resp = requests.get(url, headers=headers, impersonate="chrome", timeout=15)
            if resp.status_code != 200:
                self.stdout.write(self.style.ERROR(f"Failed to fetch indices. Status code: {resp.status_code}"))
                return
                
            html = resp.text
            
            # Regex pattern to match rows in MeroLagani indices table
            pattern = re.compile(
                r'<td class="text-center[^>]*>(\d+)</td>\s*'
                r'<td class="text-center[^>]*>(\d{4}/\d{2}/\d{2})</td>\s*'
                r'<td class="text-right[^>]*>([\d\.,\-]+)</td>\s*'
                r'<td class="text-right[^>]*>([\d\.,\-]+)</td>\s*'
                r'<td class="text-right[^>]*>([\d\.,\-]+)%</td>'
            )
            
            matches = pattern.findall(html)
            self.stdout.write(f"Parsed {len(matches)} rows from page HTML.")
            
            created_count = 0
            updated_count = 0
            
            for m in matches:
                # 1. Parse fields
                date_str = m[1].replace("/", "-")
                parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                
                val = Decimal(m[2].replace(",", ""))
                change = Decimal(m[3].replace(",", ""))
                pct_change = Decimal(m[4].replace(",", ""))
                
                # 2. Update or create record
                index_val, created = DailyIndexValue.objects.update_or_create(
                    index_name="NEPSE Index",
                    date=parsed_date,
                    defaults={
                        "value": val,
                        "change": change,
                        "change_percent": pct_change
                    }
                )
                
                if created:
                    created_count += 1
                else:
                    updated_count += 1
                    
            self.stdout.write(self.style.SUCCESS(
                f"Successfully scraped indices: {created_count} created, {updated_count} updated."
            ))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error scraping indices: {e}"))
