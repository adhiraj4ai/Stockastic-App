"""Session creation and JWT helpers shared by login views."""
import logging

from ..models import UserSession
from .helpers import _get_client_ip, _parse_user_agent

logger = logging.getLogger(__name__)


def _create_session(user, request, refresh_token):
    """Record a new session after successful login."""
    ua = request.META.get('HTTP_USER_AGENT', '')
    browser, os_name, device_type = _parse_user_agent(ua)
    ip = _get_client_ip(request)
    session_key = str(refresh_token['jti'])

    return UserSession.objects.create(
        user=user,
        session_key=session_key,
        device=device_type,
        browser=browser,
        os=os_name,
        ip_address=ip,
    )


def _get_current_jti(request) -> str:
    """Extract the JTI from the Bearer token in the Authorization header."""
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return ''
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken(auth_header.split(' ')[1])
        return token.get('jti', '')
    except Exception:
        return ''


def _blacklist_session_token(session_key: str) -> None:
    """Attempt to blacklist the JWT refresh token for a session."""
    try:
        from rest_framework_simplejwt.tokens import RefreshToken as RT
        from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
        outstanding = OutstandingToken.objects.filter(jti=session_key).first()
        if outstanding:
            RT(outstanding.token).blacklist()
    except Exception:
        pass
