"""Shared helper functions for users views."""
import logging
import re

logger = logging.getLogger(__name__)


def _get_client_ip(request):
    """Extract client IP, respecting X-Forwarded-For for proxied requests."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '0.0.0.0')


def _detect_browser(ua_string: str) -> str:
    """Detect browser name from User-Agent string."""
    if 'Edg/' in ua_string:
        return 'Microsoft Edge'
    if 'OPR/' in ua_string or 'Opera' in ua_string:
        return 'Opera'
    if 'Chrome/' in ua_string and 'Safari/' in ua_string:
        return 'Chrome'
    if 'Firefox/' in ua_string:
        return 'Firefox'
    if 'Safari/' in ua_string:
        return 'Safari'
    if 'MSIE' in ua_string or 'Trident/' in ua_string:
        return 'Internet Explorer'
    return 'Unknown Browser'


def _detect_os(ua_string: str) -> str:
    """Detect OS name from User-Agent string."""
    if 'Windows NT 10' in ua_string:
        return 'Windows 10/11'
    if 'Windows NT' in ua_string:
        return 'Windows'
    if 'Mac OS X' in ua_string:
        return 'macOS'
    if 'Android' in ua_string:
        return 'Android'
    if 'iPhone' in ua_string or 'iPad' in ua_string:
        return 'iOS'
    if 'Linux' in ua_string:
        return 'Linux'
    return 'Unknown OS'


def _detect_device(ua_string: str) -> str:
    """Detect device type from User-Agent string."""
    if 'Mobile' in ua_string or 'Android' in ua_string or 'iPhone' in ua_string:
        return 'Mobile'
    if 'iPad' in ua_string or 'Tablet' in ua_string:
        return 'Tablet'
    return 'Desktop'


def _parse_user_agent(ua_string):
    """Parse User-Agent into browser, OS, and device type."""
    if not ua_string:
        return 'Unknown Browser', 'Unknown OS', 'Unknown Device'
    return (
        _detect_browser(ua_string),
        _detect_os(ua_string),
        _detect_device(ua_string),
    )


def _verify_admin_password(request):
    """Verify the provided admin_password against the current user's password.

    Raises PermissionDenied if verification fails or password is missing.
    """
    from rest_framework.exceptions import PermissionDenied, ValidationError

    admin_password = request.data.get('admin_password')
    if not admin_password:
        raise ValidationError(
            {"admin_password": "Password confirmation is required for this sensitive operation."}
        )
    if not request.user.check_password(admin_password):
        raise PermissionDenied("Authentication failed. Incorrect administrative password.")
    return True
