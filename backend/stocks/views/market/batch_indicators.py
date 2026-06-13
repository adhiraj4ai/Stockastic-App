from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ._batch_indicator_helpers import (
    _fetch_latest_date,
    _fetch_price_df,
    _compute_ticker_result,
)


@api_view(['GET'])
@permission_classes([AllowAny])
def batch_indicators(request):
    """
    Calculate current technical indicators (RSI, MACD, ROC, Trends) for a list of symbols.
    Query param: ?symbols=AAPL,MSFT,GOOG
    """
    symbols_str = request.GET.get('symbols', '')
    if not symbols_str:
        return Response({})
    symbols = [s.strip().upper() for s in symbols_str.split(',') if s.strip()]
    if not symbols:
        return Response({})

    latest_date = _fetch_latest_date()
    if not latest_date:
        return Response({})

    df_all = _fetch_price_df(symbols, latest_date)
    if df_all.empty:
        return Response({})

    results = {}
    for ticker in symbols:
        t_df = df_all[df_all['ticker'] == ticker].copy()
        if t_df.empty or len(t_df) < 5:
            continue
        t_df.set_index('date', inplace=True)
        results[ticker] = _compute_ticker_result(ticker, t_df)

    return Response(results)
