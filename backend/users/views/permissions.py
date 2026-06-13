"""Custom DRF permission classes for users views."""
from rest_framework import permissions


class IsPlatformAdmin(permissions.BasePermission):
    """Allow access to users with ADMIN role, staff status, or superuser status."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        if hasattr(user, 'profile') and user.profile.role == 'ADMIN':
            return True
        return False
