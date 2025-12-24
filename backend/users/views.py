from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    return Response({"message": "Welcome to Stockastic Dashboard!", "user": request.user.username})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    # Auto-create Default Account for Ashmi
    if request.user.username == 'ashmi':
        from stocks.models import PortfolioAccount
        if not PortfolioAccount.objects.filter(user=request.user).exists():
            PortfolioAccount.objects.create(user=request.user, name="Main Portfolio")

    return Response({
        "id": request.user.id,
        "username": request.user.username,
        "email": request.user.email
    })
