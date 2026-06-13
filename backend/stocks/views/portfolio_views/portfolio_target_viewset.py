from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from ...models import PortfolioTarget
from ...serializers import PortfolioTargetSerializer


class PortfolioTargetViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PortfolioTargetSerializer

    def get_queryset(self):
        if self.request.user.username == 'admin':
            return PortfolioTarget.objects.all()
        return PortfolioTarget.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
