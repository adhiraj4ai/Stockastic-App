"""Password change view."""
import logging
import threading

from django.conf import settings
from django.contrib.auth.hashers import check_password as auth_check_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import PasswordHistory
from .throttles import PasswordChangeThrottle

logger = logging.getLogger(__name__)

_SECURITY_EMAIL = 'security@stockastic.com'
_PASSWORD_HISTORY_LIMIT = 5


def _password_in_history(new_password: str, user) -> bool:
    """Return True if the new password matches any of the last N history entries."""
    for history in PasswordHistory.objects.filter(user=user)[:_PASSWORD_HISTORY_LIMIT]:
        if auth_check_password(new_password, history.password_hash):
            return True
    return False


def _send_password_change_alert(user) -> None:
    """Fire-and-forget email notification after a successful password change."""
    def _send():
        try:
            send_mail(
                subject="Your Password Has Been Changed",
                message=(
                    "Your account password was just successfully updated. "
                    "If you did not make this change, please contact support immediately."
                ),
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', _SECURITY_EMAIL),
                recipient_list=[user.email],
                fail_silently=True,
            )
        except Exception as exc:
            logger.error("Failed to send password change alert: %s", exc)

    threading.Thread(target=_send, daemon=True).start()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PasswordChangeThrottle])
def change_password(request):
    user = request.user
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')

    if not user.check_password(current_password):
        return Response({"error": "Incorrect current password"}, status=400)

    try:
        validate_password(new_password, user=user)
    except ValidationError as exc:
        return Response({"error": exc.messages}, status=400)

    if _password_in_history(new_password, user):
        return Response({"error": "You cannot reuse any of your last 5 passwords."}, status=400)

    user.set_password(new_password)
    user.save()
    PasswordHistory.objects.create(user=user, password_hash=user.password)

    if user.email:
        _send_password_change_alert(user)

    return Response({"message": "Password updated successfully"})
