"""Administrative ViewSet for managing users and their roles."""
import logging

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response

from ..models import TierPermission
from ..serializers import AdminUserSerializer, TierPermissionSerializer
from .helpers import _verify_admin_password
from .permissions import IsPlatformAdmin

logger = logging.getLogger(__name__)

_SENSITIVE_FIELDS = ['role', 'subscription_tier', 'is_active']


def _coerce_bool(value) -> bool:
    if isinstance(value, str):
        return value.lower() == 'true'
    return bool(value)


def _is_deactivation_request(is_active) -> bool:
    return is_active is False or str(is_active).lower() == 'false'


def _is_activation_request(is_active, instance) -> bool:
    return (is_active is True or str(is_active).lower() == 'true') and not instance.is_active


def _handle_deactivation(instance) -> None:
    """Record deactivation timestamp if the account is currently active."""
    if instance.is_active:
        instance.profile.deactivated_at = timezone.now()
        instance.profile.save()


def _handle_activation(instance) -> None:
    """Clear deactivation timestamp on re-activation."""
    instance.profile.deactivated_at = None
    instance.profile.save()


def _apply_active_flag(instance, is_active, request) -> None:
    """Verify admin password for sensitive changes, then persist the is_active flag."""
    if any(field in request.data for field in _SENSITIVE_FIELDS):
        _verify_admin_password(request)
    instance.is_active = _coerce_bool(is_active)
    instance.save()


def _process_active_change(instance, is_active, request) -> Response | None:
    """Handle deactivation guard for protected accounts; return error Response or None."""
    if _is_deactivation_request(is_active):
        if _is_protected(instance):
            return Response(
                {"error": "Security Restriction: Administrative/Staff accounts cannot be deactivated via this interface."},
                status=403,
            )
        _handle_deactivation(instance)
    elif _is_activation_request(is_active, instance):
        _handle_activation(instance)
    return None


def _is_protected(user) -> bool:
    """Return True if the account is protected from deactivation/deletion."""
    is_admin_role = hasattr(user, 'profile') and user.profile.role == 'ADMIN'
    return user.is_superuser or user.is_staff or is_admin_role


def _check_destroy_preconditions(instance) -> Response | None:
    """Validate the 3-step destroy guard. Return an error Response if invalid, else None."""
    if _is_protected(instance):
        return Response(
            {"error": "Security Restriction: Administrative accounts cannot be deleted. Downgrade the role first if removal is necessary."},
            status=403,
        )
    if instance.is_active:
        return Response(
            {"error": "Security Restriction: Account must be deactivated before it can be deleted."},
            status=400,
        )
    deactivated_at = getattr(instance, 'profile', None).deactivated_at if hasattr(instance, 'profile') else None
    if not deactivated_at:
        return Response(
            {"error": "Security Restriction: Account deactivation timestamp missing. Please re-activate and deactivate to start the 90-day timer."},
            status=400,
        )
    days_deactivated = (timezone.now() - deactivated_at).days
    if days_deactivated < 90:
        return Response(
            {"error": f"Security Restriction: Account must be deactivated for at least 90 days before permanent deletion. Current hold time: {days_deactivated} days."},
            status=400,
        )
    return None


class AdminUserViewSet(viewsets.ModelViewSet):
    """Administrative ViewSet for managing users and their roles. Restricted to platform admins."""

    queryset = User.objects.all().select_related('profile').order_by('-date_joined')
    serializer_class = AdminUserSerializer
    permission_classes = [IsPlatformAdmin]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        _verify_admin_password(request)
        error = _check_destroy_preconditions(instance)
        if error:
            return error
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        is_active = request.data.get('is_active')
        error = _process_active_change(instance, is_active, request)
        if error:
            return error
        if is_active is not None:
            _apply_active_flag(instance, is_active, request)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        is_active = request.data.get('is_active')
        error = _process_active_change(instance, is_active, request)
        if error:
            return error
        if is_active is not None:
            _apply_active_flag(instance, is_active, request)
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
