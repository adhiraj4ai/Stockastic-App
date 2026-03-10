from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from . import views

urlpatterns = [
    path("auth/google/", views.GoogleLogin.as_view(), name="google_login"),
    path("auth/apple/", views.AppleLogin.as_view(), name="apple_login"),
    path("auth/microsoft/", views.MicrosoftLogin.as_view(), name="microsoft_login"),
    path("auth/", include("dj_rest_auth.urls")),
    path("auth/registration/", include("dj_rest_auth.registration.urls")),
    path("account/login/", views.login_view, name="account_login"),
    path("account/2fa/setup/", views.setup_2fa, name="setup_2fa"),
    path("account/2fa/verify/", views.verify_2fa_setup, name="verify_2fa"),
    path("account/2fa/disable/", views.disable_2fa, name="disable_2fa"),
    path("account/2fa/recovery-codes/", views.recovery_codes, name="recovery_codes"),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("users/me/", views.get_current_user, name="user_me"),
    path("users/change_password/", views.change_password, name="change_password"),
    path("sessions/", views.list_sessions, name="list_sessions"),
    path("sessions/<int:session_id>/revoke/", views.revoke_session, name="revoke_session"),
    path("sessions/revoke-all/", views.revoke_all_sessions, name="revoke_all_sessions"),
]

