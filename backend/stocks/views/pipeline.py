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
from stocks.services.ingest_validation import validate_price_rows


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_numeric(v):
    """Parse a CSV field to float; return 0 for blank or dash values."""
    if not v or v == '-':
        return 0
    try:
        return float(str(v).replace(',', ''))
    except Exception:
        return 0


def _normalise_row(row):
    """Strip whitespace from all CSV row keys."""
    return {str(k).strip(): v for k, v in row.items() if k is not None}


def _extract_symbol(nrow):
    """Return the ticker symbol from a normalised CSV row."""
    return nrow.get('Symbol') or nrow.get('Ticker') or nrow.get('symbol') or nrow.get('ticker')


def _build_price_object(nrow, date_str):
    """Construct a DailyStockPrice instance from a normalised CSV row."""
    p = _parse_numeric
    sym = _extract_symbol(nrow)
    return DailyStockPrice(
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
    )


def _parse_csv_prices(reader, date_str):
    """Build a list of DailyStockPrice objects from a csv.DictReader."""
    items = []
    for row in reader:
        nrow = _normalise_row(row)
        sym = _extract_symbol(nrow)
        if not sym:
            continue
        items.append(_build_price_object(nrow, date_str))
    return items


def _persist_prices(items, log):
    """Validate, bulk-create and update the log entry; return (valid, rejected)."""
    valid, rejected = validate_price_rows(items)
    DailyStockPrice.objects.bulk_create(valid, ignore_conflicts=True)
    log.status, log.records_count = 'SUCCESS', len(valid)
    if rejected:
        log.error_message = f"rejected {len(rejected)}: " + "; ".join(
            f"{t} ({r})" for t, r in rejected[:20]
        )
    log.save()
    return valid, rejected


def _fail_log(log, exc):
    """Mark a DataUploadLog as FAILED and save."""
    log.status = 'FAILED'
    log.error_message = str(exc)
    log.save()


def _extract_floorsheet_list(data):
    """Extract a list of transaction rows from a raw JSON payload (dict or list)."""
    if isinstance(data, dict):
        for key in ['data', 'floorsheet', 'rows', 'transactions']:
            if key in data and isinstance(data[key], list):
                return data[key]
        raise ValueError("Invalid JSON format. Could not find a list of sessions/transactions in the JSON.")
    if not isinstance(data, list):
        raise ValueError("Invalid JSON format. Expected list of transactions.")
    return data


def _build_floorsheet_object(row):
    """Map a raw JSON row to a DailyFloorsheet instance; return None if no tid."""
    tid = row.get('contractId') or row.get('transactionId') or row.get('id') or row.get('transaction_id')
    if not tid:
        return None
    return DailyFloorsheet(
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
        security_name=row.get('securityName') or row.get('security_name'),
    )


def _update_records_found(line_str, current):
    """Parse a log line for record counts; return updated count."""
    patterns = [
        (r"Total signals saved: (\d+)", lambda m: int(m.group(1))),
        (r"Saved: (\d+), Skipped:", lambda m: int(m.group(1))),
        (r"Evaluation complete: (\d+) WON, (\d+) LOST", lambda m: int(m.group(1)) + int(m.group(2))),
        (r"Successfully updated technical indicators for (\d+)", lambda m: int(m.group(1))),
        (r"Broker analysis complete\. Total accumulation records: (\d+)", lambda m: int(m.group(1))),
        (r"Total records saved: (\d+)", lambda m: int(m.group(1))),
    ]
    for pattern, extractor in patterns:
        m = re.search(pattern, line_str)
        if m:
            return extractor(m)
    prog = re.search(r"Processed (?:symbol )?(\d+)/\d+", line_str)
    if prog:
        return max(current, int(prog.group(1)))
    return current


def _stream_process(process, log_entry):
    """Yield SSE events from a subprocess and finalise the log entry."""
    records_found = 0
    for line in process.stdout:
        line_str = line.strip()
        records_found = _update_records_found(line_str, records_found)
        yield f"data: {json.dumps({'type': 'log', 'message': line_str})}\n\n"
    process.wait()
    if process.returncode != 0:
        yield f"data: {json.dumps({'type': 'error', 'message': f'Process failed with exit code {process.returncode}. Check logs for details.'})}\n\n"
    log_entry.status = 'SUCCESS' if process.returncode == 0 else 'FAILED'
    log_entry.records_count = records_found
    log_entry.save()
    yield f"data: {json.dumps({'type': 'done'})}\n\n"


# ---------------------------------------------------------------------------
# ViewSet
# ---------------------------------------------------------------------------

class PipelineViewSet(viewsets.ViewSet):
    """ViewSet to manage data pipeline tasks."""

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
        except Exception:
            current_page = paginator.page(1)
        data = [
            {
                'id': l.id, 'file_name': l.file_name,
                'upload_type': l.get_upload_type_display(), 'status': l.status,
                'records_count': l.records_count, 'error_message': l.error_message,
                'created_at': l.created_at,
            }
            for l in current_page
        ]
        return Response({'results': data, 'total': paginator.count, 'page': current_page.number, 'pages': paginator.num_pages})

    @action(detail=False, methods=['post'])
    def abort_log(self, request):
        log_id = request.data.get('log_id')
        if not log_id:
            return Response({'error': 'log_id required'}, status=400)
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
        statuses = [
            {'id': key, 'name': name, 'status': 'idle', 'last_run': datetime.now().isoformat()}
            for key, name in self.TASKS.items()
        ]
        return Response(statuses)

    @action(detail=False, methods=['post'])
    def trigger_signals(self, request):
        symbol = request.data.get('symbol')

        def run_signals():
            try:
                if symbol:
                    call_command('generate_signals', symbol=symbol)
                else:
                    call_command('generate_signals')
            except Exception as e:
                print(f"Error: {e}")

        threading.Thread(target=run_signals, daemon=True).start()
        return Response({'status': 'success'})

    def _run_manage_command_stream(self, command_args, log_entry):
        def event_stream():
            yield f"data: {json.dumps({'type': 'init', 'log_id': log_entry.id})}\n\n"
            manage_py = os.path.join(settings.BASE_DIR, 'manage.py')
            cmd = ['python', manage_py] + command_args
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            yield from _stream_process(process, log_entry)

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
        if symbol != 'all':
            args += ['--symbol', symbol]
        return self._run_manage_command_stream(args, log_entry)

    @action(detail=False, methods=['get'])
    def optimize_strategies_stream(self, request):
        all_symbols = request.query_params.get('all_symbols') == 'true'
        log_entry = DataUploadLog.objects.create(file_name='Strategy Optimization', upload_type='OPTIMIZATION', status='PENDING')
        args = ['optimize_strategies']
        if all_symbols:
            args += ['--all-symbols']
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

    @action(detail=False, methods=['get'])
    def ingest_market_data_stream(self, request):
        datasets = request.query_params.get('datasets', 'prices,floorsheet,summary,companies,indices')
        date_str = request.query_params.get('date')
        log_entry = DataUploadLog.objects.create(
            file_name=f'NepseAPI Ingest ({datasets})', upload_type='API_INGEST', status='PENDING'
        )
        args = ['ingest_market_data', '--datasets', datasets]
        if date_str:
            args += ['--date', date_str]
        return self._run_manage_command_stream(args, log_entry)

    @action(detail=False, methods=['post'])
    def upload_floorsheet(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded'}, status=400)
        log = DataUploadLog.objects.create(file_name=file.name, upload_type='FLOORSHEET', status='PENDING')
        try:
            raw_data = _extract_floorsheet_list(json.load(file))
            items = [obj for row in raw_data for obj in [_build_floorsheet_object(row)] if obj]
            DailyFloorsheet.objects.bulk_create(items, ignore_conflicts=True)
            log.status, log.records_count = 'SUCCESS', len(items)
            log.save()
            return Response({'message': f'Successfully uploaded {len(items)} records'})
        except Exception as e:
            _fail_log(log, e)
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def daily_prices(self, request):
        file = request.FILES.get('file')
        date_str = request.data.get('date')
        if not file or not date_str:
            return Response({'error': 'Missing data'}, status=400)
        log = DataUploadLog.objects.create(file_name=file.name, upload_type='PRICE', status='PENDING')
        try:
            reader = csv.DictReader(io.StringIO(file.read().decode('utf-8')))
            items = _parse_csv_prices(reader, date_str)
            valid, rejected = _persist_prices(items, log)
            return Response({
                'message': f'Loaded {len(valid)} price records',
                'rejected': [{'ticker': t, 'reason': r} for t, r in rejected],
            })
        except Exception as e:
            _fail_log(log, e)
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def fetch_daily_prices_from_github(self, request):
        import requests as http_requests
        date_str = request.data.get('date')
        if not date_str:
            return Response({'error': 'Date required'}, status=400)
        log = DataUploadLog.objects.create(file_name=f"github_{date_str}", upload_type='GITHUB_SYNC', status='PENDING')
        try:
            url = f"https://raw.githubusercontent.com/fuunshi/ShareSansarDataScrape/master/Data/{date_str.replace('-', '_')}.csv"
            resp = http_requests.get(url)
            if resp.status_code != 200:
                _fail_log(log, 'Not found on GitHub')
                return Response({'error': 'Not found on GitHub'}, status=400)
            reader = csv.DictReader(io.StringIO(resp.content.decode('utf-8')))
            items = _parse_csv_prices(reader, date_str)
            valid, rejected = _persist_prices(items, log)
            return Response({
                'message': f'Synced {len(valid)} github price records',
                'rejected': [{'ticker': t, 'reason': r} for t, r in rejected],
            })
        except Exception as e:
            _fail_log(log, e)
            return Response({'error': str(e)}, status=500)
