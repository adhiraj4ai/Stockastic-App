from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .serializers import UserSerializer
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login
from django_otp import devices_for_user
from django_otp.plugins.otp_totp.models import TOTPDevice
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
        "secret": device.key
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
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

@api_view(['POST'])
@permission_classes([]) # Public
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    token = request.data.get('token')
    
    user = authenticate(username=username, password=password)
    if not user:
        return Response({"error": "Invalid credentials"}, status=401)
    
    if user.profile.two_factor_enabled:
        if not token:
            return Response({"message": "2FA token required", "2fa_required": True}, status=200)
        
        # Verify 2FA token
        device = TOTPDevice.objects.filter(user=user, confirmed=True).first()
        if not device or not device.verify_token(token):
            return Response({"error": "Invalid 2FA token"}, status=401)
    
    # Generate JWT
    refresh = RefreshToken.for_user(user)
    return Response({
        'refresh': str(refresh),
        'access': str(refresh.access_token),
        'user': {
            'username': user.username,
            'email': user.email
        }
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')
    
    if not user.check_password(current_password):
        return Response({"error": "Incorrect current password"}, status=400)
    
    if not new_password or len(new_password) < 6:
        return Response({"error": "New password must be at least 6 characters"}, status=400)
        
    user.set_password(new_password)
    user.save()
    return Response({"message": "Password updated successfully"})

class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/api/auth/callback/google"

class AppleLogin(SocialLoginView):
    adapter_class = AppleOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/api/auth/callback/apple"

class MicrosoftLogin(SocialLoginView):
    adapter_class = MicrosoftGraphOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/api/auth/callback/microsoft"
