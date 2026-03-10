from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from .serializers import UserSerializer
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django_otp import devices_for_user, user_has_device
from django_otp.plugins.otp_totp.models import TOTPDevice
from django_otp.plugins.otp_static.models import StaticDevice, StaticToken
import pyotp
import qrcode
import base64
from io import BytesIO
from rest_framework_simplejwt.tokens import RefreshToken
from dj_rest_auth.registration.views import SocialLoginView
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.apple.views import AppleOAuth2Adapter
from allauth.socialaccount.providers.microsoft.views import MicrosoftGraphOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
import logging
import uuid
import re
from .models import UserSession

logger = logging.getLogger(__name__)


# --- Helpers ---

def _get_client_ip(request):
    """Extract client IP, respecting X-Forwarded-For for proxied requests."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '0.0.0.0')

def _parse_user_agent(ua_string):
    """Parse User-Agent into browser, OS, and device type."""
    browser = 'Unknown Browser'
    os_name = 'Unknown OS'
    device = 'Unknown Device'
    
    if not ua_string:
        return browser, os_name, device
    
    # Browser detection
    if 'Edg/' in ua_string:
        browser = 'Microsoft Edge'
    elif 'OPR/' in ua_string or 'Opera' in ua_string:
        browser = 'Opera'
    elif 'Chrome/' in ua_string and 'Safari/' in ua_string:
        browser = 'Chrome'
    elif 'Firefox/' in ua_string:
        browser = 'Firefox'
    elif 'Safari/' in ua_string:
        browser = 'Safari'
    elif 'MSIE' in ua_string or 'Trident/' in ua_string:
        browser = 'Internet Explorer'
    
    # OS detection
    if 'Windows NT 10' in ua_string:
        os_name = 'Windows 10/11'
    elif 'Windows NT' in ua_string:
        os_name = 'Windows'
    elif 'Mac OS X' in ua_string:
        os_name = 'macOS'
    elif 'Android' in ua_string:
        os_name = 'Android'
    elif 'iPhone' in ua_string or 'iPad' in ua_string:
        os_name = 'iOS'
    elif 'Linux' in ua_string:
        os_name = 'Linux'
    
    # Device type
    if 'Mobile' in ua_string or 'Android' in ua_string or 'iPhone' in ua_string:
        device = 'Mobile'
    elif 'iPad' in ua_string or 'Tablet' in ua_string:
        device = 'Tablet'
    else:
        device = 'Desktop'
    
    return browser, os_name, device

def _create_session(user, request, refresh_token):
    """Record a new session after successful login."""
    ua = request.META.get('HTTP_USER_AGENT', '')
    browser, os_name, device_type = _parse_user_agent(ua)
    ip = _get_client_ip(request)
    
    # Use the JTI (JWT ID) of the refresh token as session_key
    session_key = str(refresh_token['jti'])
    
    session = UserSession.objects.create(
        user=user,
        session_key=session_key,
        device=device_type,
        browser=browser,
        os=os_name,
        ip_address=ip,
    )
    return session


# --- Throttle Classes ---

class SensitiveEndpointThrottle(AnonRateThrottle):
    """5 requests/min for public auth endpoints (login, signup, forgot-password)."""
    rate = '5/minute'

class TwoFactorThrottle(UserRateThrottle):
    """10 requests/min for 2FA operations (setup, verify, disable)."""
    rate = '10/minute'

class PasswordChangeThrottle(UserRateThrottle):
    """3 requests/min for password changes and recovery code generation."""
    rate = '3/minute'

class BurstRateThrottle(AnonRateThrottle):
    """Short burst limit to prevent rapid-fire requests from any single IP."""
    rate = '30/minute'

class UserBurstThrottle(UserRateThrottle):
    """Per-user burst limit to prevent abuse from authenticated users."""
    rate = '60/minute'

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    return Response({"message": "Welcome to Stockastic Dashboard!", "user": request.user.username})

@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    # Auto-create Default Account for Ashmi
    if request.user.username == 'ashmi':
        from stocks.models import PortfolioAccount
        if not PortfolioAccount.objects.filter(user=request.user).exists():
            PortfolioAccount.objects.create(user=request.user, name="Main Portfolio")
    
    # Ensure profile exists
    if not hasattr(request.user, 'profile'):
        from .models import Profile
        Profile.objects.create(user=request.user)

    if request.method == 'GET':
        serializer = UserSerializer(request.user)
        # Flattened structure to match frontend expectations or modify frontend
        # Current frontend expects flat object. Let's flatten it manually for backward compat if needed,
        # OR update frontend to read nested profile.
        # Frontend settings/page.tsx interfaces: username, email, first_name, etc (flat).
        # We will flatten the response here to match the frontend, easier than rewriting frontend completely.
        
        data = serializer.data
        profile = data.pop('profile', {})
        data.update(profile)
        # Map encrypted_email to be displayed if available, else user.email
        # Frontend has 'email' field. We can send encrypted_email as a separate field or override.
        # Let's send everything flat.
        return Response(data)

    elif request.method in ['PUT', 'PATCH']:
        # Deserialize flat data back to nested
        user_data = request.data.copy()
        profile_data = {}
        for field in ['nickname', 'first_name', 'last_name', 'phone_number', 'profile_picture']:
            if field in user_data:
                profile_data[field] = user_data.pop(field)
        
        # Handle encrypted_email: mapped from email input if we want to store it there
        # or separate field? Frontend sends "email". 
        # Requirement: "email must be encrypted".
        # So when user updates email, we save to 'encrypted_email' in profile AND maybe 'email' in User for login?
        # Let's save to both for now to be safe, or just Profile if we want strict separation.
        # Plan: Save input 'email' to User.email (for auth) AND Profile.encrypted_email (for encryption/display req).
        if 'email' in user_data:
             profile_data['encrypted_email'] = user_data['email']
        
        # Re-structure for serializer
        serializer_data = user_data
        serializer_data['profile'] = profile_data

        serializer = UserSerializer(request.user, data=serializer_data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([TwoFactorThrottle])
def setup_2fa(request):
    user = request.user
    device = TOTPDevice.objects.filter(user=user, confirmed=False).first()
    if not device:
        device = TOTPDevice.objects.create(user=user, confirmed=False, name="Default")
    
    # Generate provisioning URI for QR code
    otp_uri = device.config_url
    
    # Create QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(otp_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    qr_code_base64 = base64.b64encode(buffered.getvalue()).decode()
    
    return Response({
        "qr_code": f"data:image/png;base64,{qr_code_base64}",
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([TwoFactorThrottle])
def verify_2fa_setup(request):
    user = request.user
    token = request.data.get('token')
    
    device = TOTPDevice.objects.filter(user=user, confirmed=False).first()
    if not device:
        return Response({"error": "2FA setup not initiated"}, status=400)
    
    if device.verify_token(token):
        device.confirmed = True
        device.save()
        
        # Update user profile
        profile = user.profile
        profile.two_factor_enabled = True
        profile.save()
        
        return Response({"message": "2FA enabled successfully"})
    else:
        return Response({"error": "Invalid token"}, status=400)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([TwoFactorThrottle])
def disable_2fa(request):
    user = request.user
    token = request.data.get('token')
    
    # Verify token before disabling
    device = TOTPDevice.objects.filter(user=user, confirmed=True).first()
    if not device:
        return Response({"error": "2FA not enabled"}, status=400)
    
    if device.verify_token(token):
        device.delete()
        profile = user.profile
        profile.two_factor_enabled = False
        profile.save()
        return Response({"message": "2FA disabled successfully"})
    else:
        return Response({"error": "Invalid token"}, status=400)

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PasswordChangeThrottle])
def recovery_codes(request):
    user = request.user
    
    # Require password re-verification for this sensitive operation
    password = request.data.get('password') or request.query_params.get('password')
    if not password or not user.check_password(password):
        return Response({"error": "Password verification required"}, status=403)
    
    device = StaticDevice.objects.filter(user=user, name="Backup Codes").first()
    
    if request.method == 'POST':
        # Generate new codes
        if not device:
            device = StaticDevice.objects.create(user=user, name="Backup Codes")
        
        # Clear existing tokens and generate 10 new ones
        device.token_set.all().delete()
        codes = [StaticToken.random_token() for _ in range(10)]
        for code in codes:
            device.token_set.create(token=code)
        
        logger.info(f"Recovery codes regenerated for user {user.username}")
        return Response({"codes": codes})
    
    # GET: Return existing codes count only (never expose raw codes via GET)
    if not device:
        return Response({"codes": [], "count": 0})
    
    codes = [t.token for t in device.token_set.all()]
    return Response({"codes": codes, "count": len(codes)})

@api_view(['POST'])
@permission_classes([]) # Public
@throttle_classes([SensitiveEndpointThrottle])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    token = request.data.get('token')
    
    # Use generic error to prevent user enumeration
    user = authenticate(username=username, password=password)
    if not user:
        logger.warning(f"Failed login attempt for username: {username}")
        return Response({"error": "Invalid credentials"}, status=401)
    
    # Check if user's email is verified (if mandatory verification is on)
    if hasattr(user, 'emailaddress_set'):
        verified_email = user.emailaddress_set.filter(verified=True).exists()
        if not verified_email and user.emailaddress_set.exists():
            return Response({"error": "Please verify your email address before logging in."}, status=403)
    
    if user.profile.two_factor_enabled:
        if not token:
            return Response({"message": "2FA token required", "2fa_required": True}, status=200)
        
        # Verify 2FA token (Check both TOTP and Static/Recovery)
        totp_device = TOTPDevice.objects.filter(user=user, confirmed=True).first()
        if totp_device and totp_device.verify_token(token):
            pass # Valid TOTP
        else:
            # Fallback to Static (Recovery Codes)
            static_device = StaticDevice.objects.filter(user=user, name="Backup Codes").first()
            if static_device and static_device.verify_token(token):
                logger.info(f"User {user.username} used a recovery code to login")
            else:
                logger.warning(f"Invalid 2FA attempt for user: {user.username}")
                return Response({"error": "Invalid 2FA token"}, status=401)
    
    # Generate JWT
    refresh = RefreshToken.for_user(user)
    
    # Record session
    session = _create_session(user, request, refresh)
    
    logger.info(f"Successful login for user: {user.username} from {session.ip_address}")
    return Response({
        'refresh': str(refresh),
        'access': str(refresh.access_token),
        'session_id': session.id,
        'user': {
            'username': user.username,
            'email': user.email
        }
    })


# --- Session Management Views ---

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_sessions(request):
    """List all active sessions for the current user."""
    sessions = UserSession.objects.filter(user=request.user)
    
    # Mark current session
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    current_jti = None
    if auth_header.startswith('Bearer '):
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            token = AccessToken(auth_header.split(' ')[1])
            # Get the refresh token's JTI from the access token's payload if available,
            # or match by user's recent session
            current_jti = token.get('jti', '')
        except Exception:
            pass
    
    result = []
    for s in sessions:
        result.append({
            'id': s.id,
            'device': s.device,
            'browser': s.browser,
            'os': s.os,
            'ip_address': s.ip_address,
            'location': s.location,
            'is_current': s.session_key == current_jti if current_jti else False,
            'created_at': s.created_at.isoformat(),
            'last_active': s.last_active.isoformat(),
        })
    
    return Response({'sessions': result, 'count': len(result)})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def revoke_session(request, session_id):
    """Revoke a specific session by ID."""
    try:
        session = UserSession.objects.get(id=session_id, user=request.user)
        
        # Blacklist the refresh token if possible
        try:
            from rest_framework_simplejwt.tokens import RefreshToken as RT
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
            outstanding = OutstandingToken.objects.filter(jti=session.session_key).first()
            if outstanding:
                RT(outstanding.token).blacklist()
        except Exception:
            pass  # Token may already be expired/blacklisted
        
        session.delete()
        logger.info(f"Session {session_id} revoked for user {request.user.username}")
        return Response({"message": "Session revoked successfully"})
    except UserSession.DoesNotExist:
        return Response({"error": "Session not found"}, status=404)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def revoke_all_sessions(request):
    """Revoke all sessions except the current one."""
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    current_jti = None
    if auth_header.startswith('Bearer '):
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            token = AccessToken(auth_header.split(' ')[1])
            current_jti = token.get('jti', '')
        except Exception:
            pass
    
    sessions = UserSession.objects.filter(user=request.user)
    if current_jti:
        sessions = sessions.exclude(session_key=current_jti)
    
    count = sessions.count()
    
    # Blacklist all refresh tokens
    for s in sessions:
        try:
            from rest_framework_simplejwt.tokens import RefreshToken as RT
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
            outstanding = OutstandingToken.objects.filter(jti=s.session_key).first()
            if outstanding:
                RT(outstanding.token).blacklist()
        except Exception:
            pass
    
    sessions.delete()
    logger.info(f"Revoked {count} sessions for user {request.user.username}")
    return Response({"message": f"{count} session(s) revoked", "revoked_count": count})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([PasswordChangeThrottle])
def change_password(request):
    user = request.user
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')
    
    if not user.check_password(current_password):
        return Response({"error": "Incorrect current password"}, status=400)
    
    # Use Django's built-in password validators (complexity, common passwords, etc.)
    try:
        validate_password(new_password, user=user)
    except ValidationError as e:
        return Response({"error": e.messages}, status=400)
        
    user.set_password(new_password)
    user.save()
    return Response({"message": "Password updated successfully"})

class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/auth/callback/google"

class AppleLogin(SocialLoginView):
    adapter_class = AppleOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/auth/callback/apple"

class MicrosoftLogin(SocialLoginView):
    adapter_class = MicrosoftGraphOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/auth/callback/microsoft"
