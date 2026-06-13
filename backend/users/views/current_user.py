"""Current user GET/PUT/PATCH view."""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..serializers import UserSerializer


def _ensure_portfolio_account(user) -> None:
    """Auto-create default portfolio account for ashmi."""
    if user.username == 'ashmi':
        from stocks.models import PortfolioAccount
        if not PortfolioAccount.objects.filter(user=user).exists():
            PortfolioAccount.objects.create(user=user, name="Main Portfolio")


def _ensure_profile(user) -> None:
    """Create a profile if one does not yet exist."""
    if not hasattr(user, 'profile'):
        from users.models import Profile
        Profile.objects.create(user=user)


def _flat_user_data(user) -> dict:
    """Serialize user and flatten the nested profile into the top-level dict."""
    serializer = UserSerializer(user)
    data = serializer.data
    profile = data.pop('profile', {})
    data.update(profile)
    return data


def _build_serializer_data(request_data: dict) -> dict:
    """Re-structure flat request data into nested user+profile dict for the serializer."""
    user_data = request_data.copy()
    profile_data: dict = {}
    profile_fields = ['nickname', 'first_name', 'last_name', 'phone_number', 'profile_picture']
    for field in profile_fields:
        if field in user_data:
            profile_data[field] = user_data.pop(field)
    if 'email' in user_data:
        profile_data['encrypted_email'] = user_data['email']
    user_data['profile'] = profile_data
    return user_data


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    _ensure_portfolio_account(request.user)
    _ensure_profile(request.user)

    if request.method == 'GET':
        return Response(_flat_user_data(request.user))

    serializer_data = _build_serializer_data(request.data)
    serializer = UserSerializer(request.user, data=serializer_data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)
