from rest_framework import viewsets, permissions
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from .serializers import UserSerializer, AdminUserSerializer, TierPermissionSerializer
from .models import UserSession, LoginActivity, PasswordHistory, TierPermission
from django.contrib.auth.models import User
from django.db import models
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
import threading
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.hashers import check_password as auth_check_password

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

def _verify_admin_password(request):
    """
    Verify the provided admin_password against the current authenticated user's password.
    Raises a PermissionDenied exception if verification fails or password is missing.
    """
    from rest_framework.exceptions import PermissionDenied, ValidationError
    admin_password = request.data.get('admin_password')
    
    if not admin_password:
        raise ValidationError({"admin_password": "Password confirmation is required for this sensitive operation."})
        
    if not request.user.check_password(admin_password):
        raise PermissionDenied("Authentication failed. Incorrect administrative password.")
    
    return True

# --- Custom Permissions ---

class IsPlatformAdmin(permissions.BasePermission):
    """
    Custom permission to allow access to users with ADMIN role in profile,
    staff status, or superuser status.
    """
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        
        # Admin bypass based on staff/superuser status
        if user.is_staff or user.is_superuser:
            return True
            
        # Admin bypass based on profile role
        if hasattr(user, 'profile') and user.profile.role == 'ADMIN':
            return True
            
        return False
    

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
    scope = 'sensitive_anon'
    rate = '5/minute'

class TwoFactorThrottle(UserRateThrottle):
    """10 requests/min for 2FA operations (setup, verify, disable)."""
    scope = 'two_factor'
    rate = '10/minute'

class PasswordChangeThrottle(UserRateThrottle):
    """3 requests/min for password changes and recovery code generation."""
    scope = 'password_change'
    rate = '3/minute'

class BurstRateThrottle(AnonRateThrottle):
    """Short burst limit to prevent rapid-fire requests from any single IP."""
    scope = 'burst_anon'
    rate = '30/minute'

class UserBurstThrottle(UserRateThrottle):
    """Per-user burst limit to prevent abuse from authenticated users."""
    scope = 'user_burst'
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
    
    ip_address = _get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')[:512]
    
    # Use generic error to prevent user enumeration
    user = authenticate(request, username=username, password=password)
    if not user:
        logger.warning(f"Failed login attempt for username: {username}")
        LoginActivity.objects.create(
            user=User.objects.filter(username=username).first(),
            ip_address=ip_address,
            user_agent=user_agent,
            status='FAILED'
        )
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
    
    # Send email if new IP/Device mix (has not been successfully logged into in the last 30 days)
    recent_activity = LoginActivity.objects.filter(
        user=user, ip_address=ip_address, user_agent=user_agent, status='SUCCESS'
    ).exists()
    
    if not recent_activity and user.email:
        def send_login_alert():
            try:
                send_mail(
                    subject="New Login to Your Account",
                    message=f"We detected a new login to your account from {session.device} ({session.os}) at {session.ip_address}.",
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'security@stockastic.com'),
                    recipient_list=[user.email],
                    fail_silently=True,
                )
            except Exception as e:
                logger.error(f"Failed to send login alert: {e}")
        
        threading.Thread(target=send_login_alert, daemon=True).start()

    # Record Login Activity
    LoginActivity.objects.create(
        user=user,
        ip_address=ip_address,
        user_agent=user_agent,
        status='SUCCESS',
        location=session.location
    )
    
    logger.info(f"Successful login for user: {user.username} from {session.ip_address}")

    response = Response({
        'session_id': session.id,
        'user': {
            'username': user.username,
            'email': user.email
        }
    })

    # Set JWT cookies manually for this custom login view
    from django.conf import settings
    
    cookie_config = settings.REST_AUTH
    access_token = str(refresh.access_token)
    refresh_token = str(refresh)

    response.set_cookie(
        key=cookie_config['JWT_AUTH_COOKIE'],
        value=access_token,
        httponly=cookie_config['JWT_AUTH_HTTPONLY'],
        secure=cookie_config['JWT_AUTH_SECURE'],
        samesite=cookie_config['JWT_AUTH_SAMESITE'],
    )
    
    response.set_cookie(
        key=cookie_config['JWT_AUTH_REFRESH_COOKIE'],
        value=refresh_token,
        httponly=cookie_config['JWT_AUTH_HTTPONLY'],
        secure=cookie_config['JWT_AUTH_SECURE'],
        samesite=cookie_config['JWT_AUTH_SAMESITE'],
    )

    return response


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
    
    # Enforce 5-password history rule
    for history in PasswordHistory.objects.filter(user=user)[:5]:
        if auth_check_password(new_password, history.password_hash):
            return Response({"error": "You cannot reuse any of your last 5 passwords."}, status=400)
        
    user.set_password(new_password)
    user.save()
    
    # Record in history
    PasswordHistory.objects.create(user=user, password_hash=user.password)

    # Send Notification
    if user.email:
        def send_password_alert():
            try:
                send_mail(
                    subject="Your Password Has Been Changed",
                    message="Your account password was just successfully updated. If you did not make this change, please contact support immediately.",
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'security@stockastic.com'),
                    recipient_list=[user.email],
                    fail_silently=True,
                )
            except Exception as e:
                logger.error(f"Failed to send password change alert: {e}")
        threading.Thread(target=send_password_alert, daemon=True).start()

    return Response({"message": "Password updated successfully"})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def login_activity(request):
    """Fetch the user's recent login activity."""
    activities = LoginActivity.objects.filter(user=request.user)[:20]
    result = []
    for a in activities:
        result.append({
            'status': a.status,
            'ip_address': a.ip_address,
            'user_agent': a.user_agent,
            'timestamp': a.timestamp.isoformat(),
            'location': a.location
        })
    return Response({'activity': result})

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
class AdminUserViewSet(viewsets.ModelViewSet):
    """
    Administrative ViewSet for managing users and their roles.
    Restricted to superusers.
    """
    queryset = User.objects.all().select_related('profile').order_by('-date_joined')
    serializer_class = AdminUserSerializer
    permission_classes = [IsPlatformAdmin]

    def _is_protected(self, user):
        """Check if account is protected from deactivation/deletion."""
        is_admin_role = hasattr(user, 'profile') and user.profile.role == 'ADMIN'
        return user.is_superuser or user.is_staff or is_admin_role

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # REQUIRES PASSWORD
        _verify_admin_password(request)

        # 1. Protect Admins
        if self._is_protected(instance):
            return Response(
                {"error": "Security Restriction: Administrative accounts cannot be deleted. Downgrade the role first if removal is necessary."},
                status=403
            )

        # 2. Account MUST be deactivated first
        if instance.is_active:
            return Response(
                {"error": "Security Restriction: Account must be deactivated before it can be deleted."},
                status=400
            )

        # 3. Must wait 90 days since deactivation
        deactivated_at = getattr(instance, 'profile', None).deactivated_at if hasattr(instance, 'profile') else None
        if not deactivated_at:
            return Response(
                {"error": "Security Restriction: Account deactivation timestamp missing. Please re-activate and deactivate to start the 90-day timer."},
                status=400
            )
        
        from django.utils import timezone
        days_deactivated = (timezone.now() - deactivated_at).days
        if days_deactivated < 90:
            return Response(
                {"error": f"Security Restriction: Account must be deactivated for at least 90 days before permanent deletion. Current hold time: {days_deactivated} days."},
                status=400
            )

        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        is_active = request.data.get('is_active')
        
        # Prevent deactivation of protected accounts
        if is_active is False or str(is_active).lower() == 'false':
            if self._is_protected(instance):
                return Response(
                    {"error": "Security Restriction: Administrative/Staff accounts cannot be deactivated via this interface."},
                    status=403
                )
            
            # Record deactivation time if it's a new deactivation
            if instance.is_active:
                from django.utils import timezone
                instance.profile.deactivated_at = timezone.now()
                instance.profile.save()
        
        # Reset deactivation time if reactivated
        elif (is_active is True or str(is_active).lower() == 'true') and not instance.is_active:
            instance.profile.deactivated_at = None
            instance.profile.save()
        
        # Update instance status explicitly to ensure persistence
        if is_active is not None:
            # SENSITIVE: Role, Tier, or Deactivation change
            sensitive_fields = ['role', 'subscription_tier', 'is_active']
            if any(field in request.data for field in sensitive_fields):
                _verify_admin_password(request)

            instance.is_active = (str(is_active).lower() == 'true') if isinstance(is_active, str) else bool(is_active)
            instance.save()
            
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        is_active = request.data.get('is_active')

        # Prevent deactivation of protected accounts
        if is_active is False or str(is_active).lower() == 'false':
            if self._is_protected(instance):
                return Response(
                    {"error": "Security Restriction: Administrative/Staff accounts cannot be deactivated via this interface."},
                    status=403
                )

            # Record deactivation time if it's a new deactivation
            if instance.is_active:
                from django.utils import timezone
                instance.profile.deactivated_at = timezone.now()
                instance.profile.save()

        # Reset deactivation time if reactivated
        elif (is_active is True or str(is_active).lower() == 'true') and not instance.is_active:
            instance.profile.deactivated_at = None
            instance.profile.save()
        
        # Update instance status explicitly to ensure persistence
        if is_active is not None:
             # SENSITIVE: Role, Tier, or Deactivation change
            sensitive_fields = ['role', 'subscription_tier', 'is_active']
            if any(field in request.data for field in sensitive_fields):
                _verify_admin_password(request)

            instance.is_active = (str(is_active).lower() == 'true') if isinstance(is_active, str) else bool(is_active)
            instance.save()
        
        return super().partial_update(request, *args, **kwargs)

    def get_queryset(self):
        queryset = super().get_queryset()
        role = self.request.query_params.get('role')
        search = self.request.query_params.get('search')
        
        if role:
            queryset = queryset.filter(profile__role=role)
        if search:
            queryset = queryset.filter(
                models.Q(username__icontains=search) | 
                models.Q(email__icontains=search) |
                models.Q(profile__first_name__icontains=search) |
                models.Q(profile__last_name__icontains=search)
            )
        return queryset


class TierPermissionViewSet(viewsets.ModelViewSet):
    """ViewSet to manage tier-based permissions."""
    queryset = TierPermission.objects.all()
    serializer_class = TierPermissionSerializer
    permission_classes = [IsPlatformAdmin]

    def get_queryset(self):
        tier = self.request.query_params.get('tier')
        if tier:
            return self.queryset.filter(tier=tier)
        return self.queryset.order_by('tier', 'module_key')

    def create(self, request, *args, **kwargs):
        _verify_admin_password(request)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        _verify_admin_password(request)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        _verify_admin_password(request)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        _verify_admin_password(request)
        return super().destroy(request, *args, **kwargs)
