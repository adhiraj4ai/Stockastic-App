"""Custom throttle classes for users views."""
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


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
