"""Custom login view with JWT cookie response and 2FA support."""
import logging
import threading

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django_otp.plugins.otp_static.models import StaticDevice
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import LoginActivity
from .helpers import _get_client_ip
from .session_helpers import _create_session
from .throttles import SensitiveEndpointThrottle

logger = logging.getLogger(__name__)

_SECURITY_EMAIL = 'security@stockastic.com'


def _record_failed_login(username: str, ip: str, ua: str) -> None:
    logger.warning("Failed login attempt for username: %s", username)
    LoginActivity.objects.create(
        user=User.objects.filter(username=username).first(),
        ip_address=ip,
        user_agent=ua,
        status='FAILED',
    )


def _email_verified(user) -> bool:
    """Return True if the user has a verified email or has no email addresses at all."""
    if not hasattr(user, 'emailaddress_set'):
        return True
    has_emails = user.emailaddress_set.exists()
    if not has_emails:
        return True
    return user.emailaddress_set.filter(verified=True).exists()


def _verify_2fa(user, token: str) -> bool:
    """Return True if the TOTP or recovery-code token is valid."""
    totp = TOTPDevice.objects.filter(user=user, confirmed=True).first()
    if totp and totp.verify_token(token):
        return True
    static = StaticDevice.objects.filter(user=user, name="Backup Codes").first()
    if static and static.verify_token(token):
        logger.info("User %s used a recovery code to login", user.username)
        return True
    return False


def _send_login_alert_async(user, session) -> None:
    """Fire-and-forget email alert for a new device/IP login."""
    def _send():
        try:
            send_mail(
                subject="New Login to Your Account",
                message=(
                    f"We detected a new login to your account from "
                    f"{session.device} ({session.os}) at {session.ip_address}."
                ),
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', _SECURITY_EMAIL),
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception as exc:
            logger.error("Failed to send login alert: %s", exc)

    threading.Thread(target=_send, daemon=True).start()


def _set_jwt_cookies(response, refresh: RefreshToken) -> None:
    """Attach access + refresh JWT cookies to the response."""
    cfg = settings.REST_AUTH
    response.set_cookie(
        key=cfg['JWT_AUTH_COOKIE'],
        value=str(refresh.access_token),
        httponly=cfg['JWT_AUTH_HTTPONLY'],
        secure=cfg['JWT_AUTH_SECURE'],
        samesite=cfg['JWT_AUTH_SAMESITE'],
    )
    response.set_cookie(
        key=cfg['JWT_AUTH_REFRESH_COOKIE'],
        value=str(refresh),
        httponly=cfg['JWT_AUTH_HTTPONLY'],
        secure=cfg['JWT_AUTH_SECURE'],
        samesite=cfg['JWT_AUTH_SAMESITE'],
    )


def _build_success_response(user, session) -> Response:
    return Response({
        'session_id': session.id,
        'user': {'username': user.username, 'email': user.email},
    })


def _check_2fa(user, token: str) -> Response | None:
    """Return an error/challenge Response if 2FA check fails, else None."""
    if not user.profile.two_factor_enabled:
        return None
    if not token:
        return Response({"message": "2FA token required", "2fa_required": True}, status=200)
    if not _verify_2fa(user, token):
        logger.warning("Invalid 2FA attempt for user: %s", user.username)
        return Response({"error": "Invalid 2FA token"}, status=401)
    return None


def _complete_login(user, request, ip: str, ua: str) -> Response:
    """Create session, record activity, send alert if new device, return response."""
    refresh = RefreshToken.for_user(user)
    session = _create_session(user, request, refresh)
    recent = LoginActivity.objects.filter(
        user=user, ip_address=ip, user_agent=ua, status='SUCCESS'
    ).exists()
    if not recent and user.email:
        _send_login_alert_async(user, session)
    LoginActivity.objects.create(
        user=user, ip_address=ip, user_agent=ua, status='SUCCESS', location=session.location
    )
    logger.info("Successful login for user: %s from %s", user.username, session.ip_address)
    response = _build_success_response(user, session)
    _set_jwt_cookies(response, refresh)
    return response


@api_view(['POST'])
@permission_classes([])
@throttle_classes([SensitiveEndpointThrottle])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    token = request.data.get('token')
    ip = _get_client_ip(request)
    ua = request.META.get('HTTP_USER_AGENT', '')[:512]

    user = authenticate(request, username=username, password=password)
    if not user:
        _record_failed_login(username, ip, ua)
        return Response({"error": "Invalid credentials"}, status=401)

    if not _email_verified(user):
        return Response({"error": "Please verify your email address before logging in."}, status=403)

    two_fa_response = _check_2fa(user, token)
    if two_fa_response is not None:
        return two_fa_response

    return _complete_login(user, request, ip, ua)
