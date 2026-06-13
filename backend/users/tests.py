"""Smoke tests for the users.views package refactor."""
from django.test import TestCase


class UsersViewsImportTest(TestCase):
    """Verify that every public name from users.views is importable after the package split."""

    def test_all_names_importable(self):
        from users import views  # noqa: F401

        public_names = [
            "AdminUserViewSet",
            "AppleLogin",
            "BurstRateThrottle",
            "GoogleLogin",
            "IsPlatformAdmin",
            "MicrosoftLogin",
            "PasswordChangeThrottle",
            "SensitiveEndpointThrottle",
            "TierPermissionViewSet",
            "TwoFactorThrottle",
            "UserBurstThrottle",
            "change_password",
            "dashboard",
            "disable_2fa",
            "get_current_user",
            "list_sessions",
            "login_activity",
            "login_view",
            "recovery_codes",
            "revoke_all_sessions",
            "revoke_session",
            "setup_2fa",
            "verify_2fa_setup",
        ]
        for name in public_names:
            self.assertIsNotNone(getattr(views, name), f"users.views.{name} should not be None")

    def test_urls_router_references_correct_viewsets(self):
        """Verify the router viewsets are accessible and callable."""
        from users.views import AdminUserViewSet, TierPermissionViewSet
        self.assertTrue(hasattr(AdminUserViewSet, 'queryset'))
        self.assertTrue(hasattr(TierPermissionViewSet, 'queryset'))

    def test_helpers_importable(self):
        from users.views.helpers import _get_client_ip, _parse_user_agent, _verify_admin_password
        self.assertTrue(callable(_get_client_ip))
        self.assertTrue(callable(_parse_user_agent))
        self.assertTrue(callable(_verify_admin_password))

    def test_parse_user_agent_chrome(self):
        from users.views.helpers import _parse_user_agent
        browser, os_name, device = _parse_user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        self.assertEqual(browser, "Chrome")
        self.assertEqual(os_name, "Windows 10/11")
        self.assertEqual(device, "Desktop")

    def test_parse_user_agent_empty(self):
        from users.views.helpers import _parse_user_agent
        browser, os_name, device = _parse_user_agent("")
        self.assertEqual(browser, "Unknown Browser")
        self.assertEqual(os_name, "Unknown OS")
        self.assertEqual(device, "Unknown Device")
