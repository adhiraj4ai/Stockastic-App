from decimal import Decimal

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from ..models import AccumulationCandidate, PortfolioAccount
from ..serializers.accumulation_candidate import AccumulationCandidateSerializer

DEFAULT_RISK_PCT = Decimal("1")
PERCENT_DIVISOR = Decimal("100")


def suggested_quantity(account, entry, stop):
    """Risk-based size: (balance * risk%) / per-share risk, floored to whole shares."""
    per_share_risk = entry - stop
    if per_share_risk <= 0:
        return 0
    risk_pct = account.default_risk_percentage or DEFAULT_RISK_PCT
    balance = account.balance or Decimal("0")
    budget = balance * risk_pct / PERCENT_DIVISOR
    qty = int(budget / per_share_risk)
    affordable = int(balance / entry) if entry > 0 else 0
    return max(min(qty, affordable), 0)


class AccumulationCandidateViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AccumulationCandidateSerializer
    lookup_field = "symbol"

    def get_queryset(self):
        return (
            AccumulationCandidate.objects
            .filter(status=AccumulationCandidate.Status.ACTIVE)
            .order_by("-score")
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        account_id = self.request.query_params.get("account")
        if not account_id:
            return ctx
        account = PortfolioAccount.objects.filter(
            id=account_id, user=self.request.user
        ).first()
        if account:
            ctx["qty_by_symbol"] = {
                c.symbol: suggested_quantity(
                    account, c.suggested_entry, c.suggested_stop
                )
                for c in self.get_queryset()
            }
        return ctx
