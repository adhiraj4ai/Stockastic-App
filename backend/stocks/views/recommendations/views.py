"""
DRF API view functions for recommendation endpoints.
"""
import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .broker_accumulation_engine import BrokerAccumulationRecommendationEngine
from .smart_accumulated_crossover_engine import SmartAccumulatedCrossoverRecommendationEngine
from .ichimoku_accumulation_engine import IchimokuAccumulationRecommendationEngine
from .shared_helpers import _resolve_raw_history, _build_history_response

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_broker_accumulation_recommendations(request):
    """Get broker accumulation recommendations for the latest date."""
    try:
        transaction_date = request.query_params.get('date')
        sector = request.query_params.get('sector')
        engine = BrokerAccumulationRecommendationEngine()
        recommendations = engine.execute(transaction_date=transaction_date, sector=sector)
        return Response(recommendations)
    except Exception as e:
        logger.exception("Error generating broker accumulation recommendations")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_broker_accumulation_history(request):
    """
    Get signal history for a specific symbol.
    Triggers a backfill if no recent history exists (auto-healing).
    """
    symbol = request.query_params.get('symbol')
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=400)
    try:
        engine = BrokerAccumulationRecommendationEngine()
        raw_history = _resolve_raw_history(engine, "BROKER_ACCUMULATION", symbol)
        return Response(_build_history_response(symbol, raw_history))
    except Exception as e:
        logger.exception(f"Error generating history for {symbol}")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_smart_accumulated_crossover_recommendations(request):
    """Get Smart Accumulated Crossover recommendations."""
    try:
        transaction_date = request.query_params.get('date')
        sector = request.query_params.get('sector')
        engine = SmartAccumulatedCrossoverRecommendationEngine()
        recommendations = engine.execute(transaction_date=transaction_date, sector=sector)
        return Response(recommendations)
    except Exception as e:
        logger.exception("Error generating smart accumulated crossover recommendations")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_smart_accumulated_crossover_history(request):
    """Get signal history for Smart Accumulated Crossover."""
    symbol = request.query_params.get('symbol')
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=400)
    try:
        engine = SmartAccumulatedCrossoverRecommendationEngine()
        raw_history = _resolve_raw_history(engine, "SMART_CROSSOVER", symbol)
        return Response(_build_history_response(symbol, raw_history))
    except Exception as e:
        logger.exception(f"Error generating smart accumulated crossover history for {symbol}")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_ichimoku_accumulation_recommendations(request):
    """Get Ichimoku Cloud + Accumulation recommendations."""
    try:
        transaction_date = request.query_params.get('date')
        sector = request.query_params.get('sector')
        engine = IchimokuAccumulationRecommendationEngine()
        recommendations = engine.execute(transaction_date=transaction_date, sector=sector)
        return Response(recommendations)
    except Exception as e:
        logger.exception("Error generating ichimoku accumulation recommendations")
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_ichimoku_accumulation_history(request):
    """Get signal history for Ichimoku Cloud + Accumulation."""
    symbol = request.query_params.get('symbol')
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=400)
    try:
        engine = IchimokuAccumulationRecommendationEngine()
        raw_history = _resolve_raw_history(engine, "ICHIMOKU", symbol)
        return Response(_build_history_response(symbol, raw_history))
    except Exception as e:
        logger.exception(f"Error generating ichimoku accumulation history for {symbol}")
        return Response({'error': str(e)}, status=500)
