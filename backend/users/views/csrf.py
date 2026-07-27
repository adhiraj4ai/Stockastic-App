"""CSRF token helper view."""
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([])
@ensure_csrf_cookie
def csrf_token_view(request):
    """GET endpoint to set and return the CSRF token cookie."""
    token = get_token(request)
    return Response({'csrfToken': token, 'detail': 'CSRF cookie set'})
