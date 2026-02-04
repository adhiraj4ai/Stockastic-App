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

from ..models import DataUploadLog, DailyStockPrice
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

    @action(detail=False, methods=['get'])
    def trigger_indicators_stream(self, request):
        log_entry = DataUploadLog.objects.create(file_name='Indicators Update', upload_type='INDICATORS', status='PENDING')
        def event_stream():
            manage_py = os.path.join(settings.BASE_DIR, 'manage.py')
            cmd = ['python', manage_py, 'update_indicators']
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            for line in process.stdout:
                yield f"data: {json.dumps({'log': line.strip()})}\n\n"
            process.wait()
            log_entry.status = 'SUCCESS' if process.returncode == 0 else 'FAILED'
            log_entry.save()
        return StreamingResponse(event_stream(), content_type='text/event-stream')

    @action(detail=False, methods=['get'])
    def generate_signals_stream(self, request):
        symbol = request.query_params.get('symbol', 'all')
        log_entry = DataUploadLog.objects.create(file_name=f'Signals Update ({symbol})', upload_type='SIGNALS', status='PENDING')
        def event_stream():
            manage_py = os.path.join(settings.BASE_DIR, 'manage.py')
            args = ['generate_signals']
            if symbol != 'all': args += ['--symbol', symbol]
            process = subprocess.Popen(['python', manage_py] + args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            for line in process.stdout:
                yield f"data: {json.dumps({'log': line.strip()})}\n\n"
            process.wait()
            log_entry.status = 'SUCCESS' if process.returncode == 0 else 'FAILED'
            log_entry.save()
        return StreamingResponse(event_stream(), content_type='text/event-stream')

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
            for row in reader:
                sym = row.get('Symbol') or row.get('Ticker')
                if not sym: continue
                items.append(DailyStockPrice(
                    ticker=sym, date=date_str, open=row.get('Open', 0), 
                    high=row.get('High', 0), low=row.get('Low', 0), 
                    close=row.get('Close', 0), volume=row.get('Volume', 0)
                ))
            DailyStockPrice.objects.bulk_create(items, ignore_conflicts=True)
            log.status, log.records_count = 'SUCCESS', len(items)
            log.save()
            return Response({'message': 'Success'})
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
            reader = csv.DictReader(io.StringIO(resp.content.decode('utf-8')))
            items = []
            def p(v): return float(v.replace(',', '')) if v and v != '-' else 0
            for row in reader:
                sym = row.get('Symbol')
                if not sym: continue
                items.append(DailyStockPrice(
                    ticker=sym, date=date_str, open=p(row.get('Open')), 
                    high=p(row.get('High')), low=p(row.get('Low')), 
                    close=p(row.get('Close')), volume=p(row.get('Vol'))
                ))
            DailyStockPrice.objects.bulk_create(items, ignore_conflicts=True)
            log.status, log.records_count = 'SUCCESS', len(items)
            log.save()
            return Response({'message': 'Success'})
        except Exception as e:
            if 'log' in locals(): log.status, log.error_message = 'FAILED', str(e); log.save()
            return Response({'error': str(e)}, status=500)
