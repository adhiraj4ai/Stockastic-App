"""Social OAuth login views (Google, Apple, Microsoft)."""
from allauth.socialaccount.providers.apple.views import AppleOAuth2Adapter
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.microsoft.views import MicrosoftGraphOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView


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
