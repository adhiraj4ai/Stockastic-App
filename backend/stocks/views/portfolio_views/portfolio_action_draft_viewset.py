from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ...models.portfolio import PortfolioActionDraft
from ...serializers import PortfolioActionDraftSerializer
from ...services.portfolio_drafts import confirm_draft, DraftError


class PortfolioActionDraftViewSet(viewsets.ReadOnlyModelViewSet):
    """List/detail a user's proposed portfolio actions; confirm or cancel them.

    Drafts are created by the chat portfolio-manager tools, not via POST here.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioActionDraftSerializer

    def get_queryset(self):
        qs = PortfolioActionDraft.objects.filter(user=self.request.user)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        return qs

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        draft = self.get_object()
        try:
            result = confirm_draft(draft)
        except DraftError as e:
            return Response({"error": str(e)}, status=status.HTTP_409_CONFLICT)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        draft.refresh_from_db()
        return Response({"status": draft.status, "kind": draft.kind, "result": result})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        draft = self.get_object()
        if draft.status == PortfolioActionDraft.Status.PENDING:
            draft.status = PortfolioActionDraft.Status.CANCELLED
            draft.save(update_fields=['status'])
        elif draft.status != PortfolioActionDraft.Status.CANCELLED:
            return Response(
                {"error": f"Draft is {draft.status} and cannot be cancelled."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"status": draft.status})
