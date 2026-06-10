import logging

from django.core.cache import cache
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..services.ticker_verdict import build_verdict
from ..services.position_sizing import default_account_for, sizing_block_for

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 min — verdict is symbol-level; sizing is attached per request


class TickerVerdictView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        symbol = symbol.upper()
        cache_key = f"ticker_verdict:{symbol}"
        verdict = cache.get(cache_key)
        if verdict is None:
            try:
                verdict = build_verdict(symbol)
            except Exception:
                logger.exception("ticker verdict failed for %s", symbol)
                return Response({"detail": "Verdict computation failed."},
                                status=status.HTTP_502_BAD_GATEWAY)
            cache.set(cache_key, verdict, CACHE_TTL)
        data = dict(verdict)  # don't mutate the cached dict
        data["sizing"] = sizing_block_for(
            default_account_for(request.user),
            verdict.get("entry"),
            (verdict.get("targets") or {}).get("sl"),
        )
        return Response(data)
