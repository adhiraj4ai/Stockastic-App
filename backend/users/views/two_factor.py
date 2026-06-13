"""Two-factor authentication views: setup, verify, disable, recovery codes."""
import base64
import logging
from io import BytesIO

import qrcode
from django_otp.plugins.otp_static.models import StaticDevice, StaticToken
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .throttles import PasswordChangeThrottle, TwoFactorThrottle

logger = logging.getLogger(__name__)

_NUM_RECOVERY_CODES = 10


def _generate_qr_base64(otp_uri: str) -> str:
    """Render an OTP URI as a base64-encoded PNG QR code."""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(otp_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([TwoFactorThrottle])
def setup_2fa(request):
    user = request.user
    device = TOTPDevice.objects.filter(user=user, confirmed=False).first()
    if not device:
        device = TOTPDevice.objects.create(user=user, confirmed=False, name="Default")
    qr_base64 = _generate_qr_base64(device.config_url)
    return Response({"qr_code": f"data:image/png;base64,{qr_base64}"})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([TwoFactorThrottle])
def verify_2fa_setup(request):
    user = request.user
    token = request.data.get('token')
    device = TOTPDevice.objects.filter(user=user, confirmed=False).first()
    if not device:
        return Response({"error": "2FA setup not initiated"}, status=400)
    if not device.verify_token(token):
        return Response({"error": "Invalid token"}, status=400)
    device.confirmed = True
    device.save()
    user.profile.two_factor_enabled = True
    user.profile.save()
    return Response({"message": "2FA enabled successfully"})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([TwoFactorThrottle])
def disable_2fa(request):
    user = request.user
    token = request.data.get('token')
    device = TOTPDevice.objects.filter(user=user, confirmed=True).first()
    if not device:
        return Response({"error": "2FA not enabled"}, status=400)
    if not device.verify_token(token):
        return Response({"error": "Invalid token"}, status=400)
    device.delete()
    user.profile.two_factor_enabled = False
    user.profile.save()
    return Response({"message": "2FA disabled successfully"})


def _verify_recovery_password(user, request) -> bool:
    """Return True if the user provided a valid password, else False."""
    password = request.data.get('password') or request.query_params.get('password')
    return bool(password and user.check_password(password))


def _regenerate_codes(user) -> list[str]:
    """Delete existing recovery codes and generate new ones."""
    device, _ = StaticDevice.objects.get_or_create(user=user, name="Backup Codes")
    device.token_set.all().delete()
    codes = [StaticToken.random_token() for _ in range(_NUM_RECOVERY_CODES)]
    for code in codes:
        device.token_set.create(token=code)
    logger.info("Recovery codes regenerated for user %s", user.username)
    return codes


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PasswordChangeThrottle])
def recovery_codes(request):
    user = request.user
    if not _verify_recovery_password(user, request):
        return Response({"error": "Password verification required"}, status=403)

    if request.method == 'POST':
        return Response({"codes": _regenerate_codes(user)})

    device = StaticDevice.objects.filter(user=user, name="Backup Codes").first()
    if not device:
        return Response({"codes": [], "count": 0})
    codes = [t.token for t in device.token_set.all()]
    return Response({"codes": codes, "count": len(codes)})
