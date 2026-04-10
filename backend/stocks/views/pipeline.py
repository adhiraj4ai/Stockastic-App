from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.http import StreamingHttpResponse as StreamingResponse
from django.conf import settings
from django.core.management import call_command
import os
import subprocess
import json
import threading
import io
import csv
import re

from ..models import DataUploadLog, DailyStockPrice, DailyFloorsheet
from ..serializers import DailyStockPriceSerializer

class PipelineViewSet(viewsets.ViewSet):
    """
    ViewSet to manage data pipeline tasks.
    """
    permission_classes = [AllowAny]

    TASKS = {
        'sync_stocks': 'Sync Stock List',
        'sync_prices': 'Sync Daily Prices',
        'broker_analysis': 'Update Broker Data & Accumulation',
        'sync_floorsheet': 'Sync Floorsheet Data',
        'update_indexes': 'Update DB Indexes',
        'generate_signals': 'Generate Strategy Signals',
        'generate_all_signals': 'Generate All Intel Signals',
        'evaluate_signals': 'Evaluate Active Signals',
        'update_indicators': 'Update Technical Indicators',
        'optimize_strategies': 'Global Strategy Optimization',
    }

    @action(detail=False, methods=['get'])
    def history(self, request):
        from django.core.paginator import Paginator
        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', 10)
        logs = DataUploadLog.objects.all().order_by('-created_at')
        paginator = Paginator(logs, page_size)
        try:
            current_page = paginator.page(page)
        except:
            current_page = paginator.page(1)
        data = [{
            'id': l.id,
            'file_name': l.file_name,
            'upload_type': l.get_upload_type_display(),
            'status': l.status,
            'records_count': l.records_count,
            'error_message': l.error_message,
            'created_at': l.created_at
        } for l in current_page]
        return Response({
            'results': data,
            'total': paginator.count,
            'page': current_page.number,
            'pages': paginator.num_pages
        })

    @action(detail=False, methods=['post'])
    def abort_log(self, request):
        log_id = request.data.get('log_id')
        if not log_id: return Response({'error': 'log_id required'}, status=400)
        try:
            log_entry = DataUploadLog.objects.get(id=log_id)
            log_entry.status = 'ABORTED'
            log_entry.save()
            return Response({'message': 'Aborted'})
        except DataUploadLog.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

    @action(detail=False, methods=['get'])
    def status(self, request):
        from datetime import datetime
        statuses = []
        for key, name in self.TASKS.items():
            statuses.append({'id': key, 'name': name, 'status': 'idle', 'last_run': datetime.now().isoformat()})
        return Response(statuses)
    
    @action(detail=False, methods=['post'])
    def trigger_signals(self, request):
        symbol = request.data.get('symbol')
        def run_signals():
            try:
                if symbol: call_command('generate_signals', symbol=symbol)
                else: call_command('generate_signals')
            except Exception as e: print(f"Error: {e}")
        threading.Thread(target=run_signals, daemon=True).start()
        return Response({'status': 'success'})

    def _run_manage_command_stream(self, command_args, log_entry):
        def event_stream():
            yield f"data: {json.dumps({'type': 'init', 'log_id': log_entry.id})}\n\n"
            manage_py = os.path.join(settings.BASE_DIR, 'manage.py')
            cmd = ['python', manage_py] + command_args
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            
            records_found = 0
            for line in process.stdout:
                line_str = line.strip()
                # 1. Parse for common patterns
                # Signals: Total signals saved: 123
                sig_match = re.search(r"Total signals saved: (\d+)", line_str)
                if sig_match: records_found = int(sig_match.group(1))
                
                # Signals (alternate): Saved: 123, Skipped: 45
                saved_match = re.search(r"Saved: (\d+), Skipped:", line_str)
                if saved_match: records_found = int(saved_match.group(1))
                
                # Evaluation: Evaluation complete: 10 WON, 5 LOST
                eval_match = re.search(r"Evaluation complete: (\d+) WON, (\d+) LOST", line_str)
                if eval_match: 
                    # For history, we want to know total signals updated TO won/lost
                    # But we'll also preserve the first 'records_found' if it was a total count
                    records_found = int(eval_match.group(1)) + int(eval_match.group(2))
                
                # Progress: Processed 100/3000 signals...
                prog_eval_match = re.search(r"Processed (\d+)/(\d+) signals", line_str)
                if prog_eval_match:
                    # Just for status feedback, don't necessarily update records_found yet if we want WON/LOST count
                    pass
                
                # Indicators: Successfully updated technical indicators for 250 stocks.
                ind_match = re.search(r"Successfully updated technical indicators for (\d+)", line_str)
                if ind_match: records_found = int(ind_match.group(1))
                
                # Broker Analysis: Broker analysis complete. Total accumulation records: 1234
                broker_match = re.search(r"Broker analysis complete\. Total accumulation records: (\d+)", line_str)
                if broker_match: records_found = int(broker_match.group(1))
                
                # Broad Progress: Processed 50/250 or Processed symbol 50/250
                prog_match = re.search(r"Processed (?:symbol )?(\d+)/\d+", line_str)
                if prog_match: records_found = max(records_found, int(prog_match.group(1)))

                yield f"data: {json.dumps({'type': 'log', 'message': line_str})}\n\n"
            
            process.wait()
            if process.returncode != 0:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Process failed with exit code {process.returncode}. Check logs for details.'})}\n\n"
            
            log_entry.status = 'SUCCESS' if process.returncode == 0 else 'FAILED'
            log_entry.records_count = records_found
            log_entry.save()
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
        return StreamingResponse(event_stream(), content_type='text/event-stream')

    @action(detail=False, methods=['get'])
    def trigger_indicators_stream(self, request):
        log_entry = DataUploadLog.objects.create(file_name='Indicators Update', upload_type='INDICATORS', status='PENDING')
        return self._run_manage_command_stream(['update_technical_indicators'], log_entry)

    @action(detail=False, methods=['get'])
    def generate_signals_stream(self, request):
        symbol = request.query_params.get('symbol', 'all')
        log_entry = DataUploadLog.objects.create(file_name=f'Signals Update ({symbol})', upload_type='SIGNALS', status='PENDING')
        args = ['generate_signals']
        if symbol != 'all': args += ['--symbol', symbol]
        return self._run_manage_command_stream(args, log_entry)

    @action(detail=False, methods=['get'])
    def optimize_strategies_stream(self, request):
        all_symbols = request.query_params.get('all_symbols') == 'true'
        log_entry = DataUploadLog.objects.create(file_name='Strategy Optimization', upload_type='OPTIMIZATION', status='PENDING')
        args = ['optimize_strategies']
        if all_symbols: args += ['--all-symbols']
        return self._run_manage_command_stream(args, log_entry)

    @action(detail=False, methods=['get'])
    def update_broker_analysis_stream(self, request):
        mode = request.query_params.get('mode', 'delta')
        log_entry = DataUploadLog.objects.create(file_name=f'Broker Analysis ({mode})', upload_type='BROKER_ANALYSIS', status='PENDING')
        return self._run_manage_command_stream(['update_broker_analysis', f'--mode={mode}'], log_entry)

    @action(detail=False, methods=['get'])
    def generate_all_signals_stream(self, request):
        log_entry = DataUploadLog.objects.create(file_name='All Intel Signals', upload_type='SIGNALS', status='PENDING')
        return self._run_manage_command_stream(['generate_all_signals'], log_entry)

    @action(detail=False, methods=['get'])
    def trigger_evaluation_stream(self, request):
        log_entry = DataUploadLog.objects.create(file_name='Signal Evaluation', upload_type='EVALUATION', status='PENDING')
        return self._run_manage_command_stream(['evaluate_signals'], log_entry)

    @action(detail=False, methods=['post'])
    def upload_floorsheet(self, request):
        file = request.FILES.get('file')
        if not file: return Response({'error': 'No file uploaded'}, status=400)
        
        try:
            log = DataUploadLog.objects.create(file_name=file.name, upload_type='FLOORSHEET', status='PENDING')
            data = json.load(file)
            
            # Robust data extraction
            if isinstance(data, dict):
                # Look for common keys that might hold the transactions list
                for key in ['data', 'floorsheet', 'rows', 'transactions']:
                    if key in data and isinstance(data[key], list):
                        data = data[key]
                        break
                else:
                    raise ValueError("Invalid JSON format. Could not find a list of sessions/transactions in the JSON.")

            if not isinstance(data, list):
                raise ValueError("Invalid JSON format. Expected list of transactions.")

            items = []
            for row in data:
                # Map keys based on actual JSON structure found in logs
                tid = row.get('contractId') or row.get('transactionId') or row.get('id') or row.get('transaction_id')
                if not tid: continue
                
                items.append(DailyFloorsheet(
                    transaction_id=tid,
                    symbol=row.get('stockSymbol') or row.get('securityCode') or row.get('symbol') or row.get('ticker'),
                    buyer_id=row.get('buyerMemberId') or row.get('buyer_id'),
                    seller_id=row.get('sellerMemberId') or row.get('seller_id'),
                    transaction_quantity=row.get('contractQuantity') or row.get('quantity') or row.get('transaction_quantity'),
                    transaction_rate=row.get('contractRate') or row.get('rate') or row.get('transaction_rate'),
                    transaction_amount=row.get('contractAmount') or row.get('amount') or row.get('transaction_amount'),
                    transaction_date=row.get('businessDate') or row.get('date') or row.get('transaction_date'),
                    transaction_book_id=row.get('tradeBookId') or row.get('contractId') or row.get('book_id') or row.get('transaction_book_id') or 0,
                    stock_id=row.get('stockId') or row.get('stock_id') or 0,
                    buyer_name=row.get('buyerBrokerName') or row.get('buyerMemberName') or row.get('buyer_name'),
                    seller_name=row.get('sellerBrokerName') or row.get('sellerMemberName') or row.get('seller_name'),
                    transaction_datetime=row.get('tradeTime') or row.get('transactionTime') or row.get('datetime') or row.get('transaction_datetime'),
                    security_name=row.get('securityName') or row.get('security_name')
                ))
            
            DailyFloorsheet.objects.bulk_create(items, ignore_conflicts=True)
            log.status, log.records_count = 'SUCCESS', len(items)
            log.save()
            return Response({'message': f'Successfully uploaded {len(items)} records'})
        except Exception as e:
            if 'log' in locals(): log.status, log.error_message = 'FAILED', str(e); log.save()
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def daily_prices(self, request):
        file = request.FILES.get('file')
        date_str = request.data.get('date')
        if not file or not date_str: return Response({'error': 'Missing data'}, status=400)
        try:
            log = DataUploadLog.objects.create(file_name=file.name, upload_type='PRICE', status='PENDING')
            decoded_file = file.read().decode('utf-8')
            reader = csv.DictReader(io.StringIO(decoded_file))
            
            items = []
            def p(v): 
                if not v or v == '-': return 0
                try: return float(str(v).replace(',', ''))
                except: return 0

            for row in reader:
                # Normalize keys: strip whitespace and lowercase
                nrow = {str(k).strip(): v for k, v in row.items() if k is not None}
                
                # Flexible mapping for manual upload
                sym = nrow.get('Symbol') or nrow.get('Ticker') or nrow.get('symbol') or nrow.get('ticker')
                if not sym: continue
                
                items.append(DailyStockPrice(
                    ticker=sym, 
                    date=date_str, 
                    open=p(nrow.get('Open') or nrow.get('open')), 
                    high=p(nrow.get('High') or nrow.get('high')), 
                    low=p(nrow.get('Low') or nrow.get('low')), 
                    close=p(nrow.get('Close') or nrow.get('close') or nrow.get('LTP') or nrow.get('ltp')), 
                    volume=p(nrow.get('Volume') or nrow.get('volume') or nrow.get('Vol') or nrow.get('vol')),
                    prev_close=p(nrow.get('Prev. Close') or nrow.get('prev_close')),
                    turnover=p(nrow.get('Turnover') or nrow.get('turnover')),
                    conf=p(nrow.get('Conf.') or nrow.get('conf')),
                    vwap=p(nrow.get('VWAP') or nrow.get('vwap')),
                    trans=int(p(nrow.get('Trans.') or nrow.get('trans'))),
                    diff=p(nrow.get('Diff') or nrow.get('diff')),
                    range=p(nrow.get('Range') or nrow.get('range')),
                    diff_percent=p(nrow.get('Diff %') or nrow.get('diff_percent')),
                    range_percent=p(nrow.get('Range %') or nrow.get('range_percent')),
                    vwap_percent=p(nrow.get('VWAP %') or nrow.get('vwap_percent')),
                    days_120=p(nrow.get('120 Days') or nrow.get('days_120')),
                    days_180=p(nrow.get('180 Days') or nrow.get('days_180')),
                    weeks_52_high=p(nrow.get('52 Weeks High') or nrow.get('weeks_52_high')),
                    weeks_52_low=p(nrow.get('52 Weeks Low') or nrow.get('weeks_52_low')),
                ))
            
            DailyStockPrice.objects.bulk_create(items, ignore_conflicts=True)
            log.status, log.records_count = 'SUCCESS', len(items)
            log.save()
            return Response({'message': f'Successfully loaded {len(items)} price records'})
        except Exception as e:
            if 'log' in locals(): log.status, log.error_message = 'FAILED', str(e); log.save()
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def fetch_daily_prices_from_github(self, request):
        import requests
        date_str = request.data.get('date')
        if not date_str: return Response({'error': 'Date required'}, status=400)
        try:
            log = DataUploadLog.objects.create(file_name=f"github_{date_str}", upload_type='GITHUB_SYNC', status='PENDING')
            url = f"https://raw.githubusercontent.com/fuunshi/ShareSansarDataScrape/master/Data/{date_str.replace('-', '_')}.csv"
            resp = requests.get(url)
            if resp.status_code != 200:
                log.status = 'FAILED'; log.save()
                return Response({'error': 'Not found on GitHub'}, status=400)
            
            decoded_content = resp.content.decode('utf-8')
            reader = csv.DictReader(io.StringIO(decoded_content))
            items = []
            def p(v): 
                if not v or v == '-': return 0
                try: return float(str(v).replace(',', ''))
                except: return 0
            
            for row in reader:
                # Normalize keys: strip whitespace
                nrow = {str(k).strip(): v for k, v in row.items() if k is not None}
                
                sym = nrow.get('Symbol') or nrow.get('symbol') or nrow.get('Ticker') or nrow.get('ticker')
                if not sym: continue
                
                items.append(DailyStockPrice(
                    ticker=sym, 
                    date=date_str, 
                    open=p(nrow.get('Open') or nrow.get('open')), 
                    high=p(nrow.get('High') or nrow.get('high')), 
                    low=p(nrow.get('Low') or nrow.get('low')), 
                    close=p(nrow.get('Close') or nrow.get('close') or nrow.get('LTP') or nrow.get('ltp')), 
                    volume=p(nrow.get('Vol') or nrow.get('vol') or nrow.get('Volume') or nrow.get('volume')),
                    prev_close=p(nrow.get('Prev. Close') or nrow.get('prev_close')),
                    turnover=p(nrow.get('Turnover') or nrow.get('turnover')),
                    conf=p(nrow.get('Conf.') or nrow.get('conf')),
                    vwap=p(nrow.get('VWAP') or nrow.get('vwap')),
                    trans=int(p(nrow.get('Trans.') or nrow.get('trans'))),
                    diff=p(nrow.get('Diff') or nrow.get('diff')),
                    range=p(nrow.get('Range') or nrow.get('range')),
                    diff_percent=p(nrow.get('Diff %') or nrow.get('diff_percent')),
                    range_percent=p(nrow.get('Range %') or nrow.get('range_percent')),
                    vwap_percent=p(nrow.get('VWAP %') or nrow.get('vwap_percent')),
                    days_120=p(nrow.get('120 Days') or nrow.get('days_120')),
                    days_180=p(nrow.get('180 Days') or nrow.get('days_180')),
                    weeks_52_high=p(nrow.get('52 Weeks High') or nrow.get('weeks_52_high')),
                    weeks_52_low=p(nrow.get('52 Weeks Low') or nrow.get('weeks_52_low')),
                ))
            
            DailyStockPrice.objects.bulk_create(items, ignore_conflicts=True)
            log.status, log.records_count = 'SUCCESS', len(items)
            log.save()
            return Response({'message': f'Successfully synced {len(items)} github price records'})
        except Exception as e:
            if 'log' in locals(): log.status, log.error_message = 'FAILED', str(e); log.save()
            return Response({'error': str(e)}, status=500)
