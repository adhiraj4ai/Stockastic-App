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
    return Response({
        "id": request.user.id,
        "username": request.user.username,
        "email": request.user.email
    })
