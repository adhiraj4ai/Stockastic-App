from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ...models import DailyStockPrice, StockFundamental, Company
from ...serializers import StockFundamentalSerializer
from ...technical import get_technical_indicators
from ._broker_accumulation import _get_broker_accumulation
from ._fundamental_enrichment import _enrich_fundamental_data


def _resolve_prev_close(ticker, latest_price):
    """Return the previous close price for the given ticker."""
    prev_price_obj = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date')[1:2]
    if prev_price_obj and prev_price_obj[0].close is not None:
        return prev_price_obj[0].close
    if latest_price and latest_price.open is not None:
        return latest_price.open
    return 0


def _build_price_data(latest_price, prev_close):
    """Build the price dict from the latest price object."""
    if not latest_price:
        return {}
    current_close = latest_price.close if latest_price.close is not None else 0
    change = current_close - prev_close
    percent_change = (change / prev_close * 100) if prev_close else 0
    return {
        'close': current_close,
        'open': latest_price.open if latest_price.open is not None else 0,
        'high': latest_price.high if latest_price.high is not None else 0,
        'low': latest_price.low if latest_price.low is not None else 0,
        'volume': latest_price.volume if latest_price.volume is not None else 0,
        'change': change,
        'percent_change': percent_change,
        'date': latest_price.date,
    }


def _fetch_company_data(ticker):
    """Return company dict or None if not found."""
    try:
        company = Company.objects.get(symbol=ticker)
        return {
            'symbol': company.symbol,
            'name': company.name,
            'sector': company.sector,
            'status': company.status,
        }
    except Company.DoesNotExist:
        return None


def _fetch_fundamental_data(ticker):
    """Return (fundamental_data dict, fundamental_obj or None)."""
    try:
        fundamental = StockFundamental.objects.get(ticker=ticker)
        return dict(StockFundamentalSerializer(fundamental).data), fundamental
    except StockFundamental.DoesNotExist:
        return {}, None


@api_view(['GET'])
@permission_classes([AllowAny])
def stock_detail(request, ticker):
    fundamental_data, fundamental_obj = _fetch_fundamental_data(ticker)
    fundamental_data['broker_accumulation'] = _get_broker_accumulation(ticker)
    latest_price = DailyStockPrice.objects.filter(ticker=ticker).order_by('-date').first()
    prev_close = _resolve_prev_close(ticker, latest_price)
    return Response({
        'company': _fetch_company_data(ticker),
        'fundamental': _enrich_fundamental_data(fundamental_data, fundamental_obj),
        'technical_indicators': get_technical_indicators(ticker),
        'price': _build_price_data(latest_price, prev_close),
    })
