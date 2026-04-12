from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from .encryption import EncryptedField
from django.utils import timezone

class Profile(models.Model):
    ROLE_CHOICES = [
        ('ADMIN', 'Admin'),
        ('MANAGER', 'Manager'),
        ('SUBSCRIBER', 'Subscriber'),
    ]

    TIER_CHOICES = [
        ('SILVER', 'Silver'),
        ('GOLD', 'Gold'),
        ('PLATINUM', 'Platinum'),
        ('NONE', 'None'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    nickname = models.CharField(max_length=50, blank=True)
    first_name = models.CharField(max_length=50, blank=True)
    last_name = models.CharField(max_length=50, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='SUBSCRIBER')
    subscription_tier = models.CharField(max_length=20, choices=TIER_CHOICES, default='SILVER')
    # Encrypted fields
    phone_number = EncryptedField(blank=True, null=True)
    encrypted_email = EncryptedField(blank=True, null=True)
    # Changed to TextField to support Base64 strings directly
    profile_picture = models.TextField(blank=True, help_text="Base64 encoded profile picture")
    two_factor_enabled = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp when the account was deactivated for retention tracking")

    def __str__(self):
        return f"{self.user.username}'s Profile"


class UserSession(models.Model):
    """Tracks active user sessions for session management and security auditing."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    session_key = models.CharField(max_length=255, unique=True, db_index=True)
    device = models.CharField(max_length=256, blank=True, default='Unknown Device')
    browser = models.CharField(max_length=128, blank=True, default='Unknown Browser')
    os = models.CharField(max_length=128, blank=True, default='Unknown OS')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    location = models.CharField(max_length=256, blank=True, default='')
    is_current = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_active = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_active']

    def __str__(self):
        return f"{self.user.username} — {self.device} ({self.ip_address})"

    @property
    def is_expired(self):
        """Session is considered expired after 24 hours of inactivity."""
        return (timezone.now() - self.last_active).total_seconds() > 86400


class LoginActivity(models.Model):
    """Tracks login attempts (success/failures) for security auditing."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='login_activity', null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default='')
    status = models.CharField(max_length=20, choices=[('SUCCESS', 'Success'), ('FAILED', 'Failed')])
    timestamp = models.DateTimeField(auto_now_add=True)
    location = models.CharField(max_length=256, blank=True, default='')

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.user.username if self.user else 'Unknown'} - {self.status} at {self.timestamp}"


class PasswordHistory(models.Model):
    """Tracks past password hashes to prevent reuse."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_history')
    password_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.created_at}"


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()
    else:
         Profile.objects.create(user=instance)
