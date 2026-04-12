from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Profile

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ['nickname', 'first_name', 'last_name', 'phone_number', 'encrypted_email', 'profile_picture', 'role', 'subscription_tier']

class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'profile']

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        profile = instance.profile

        instance.email = validated_data.get('email', instance.email)
        instance.save()

        profile.nickname = profile_data.get('nickname', profile.nickname)
        profile.first_name = profile_data.get('first_name', profile.first_name)
        profile.last_name = profile_data.get('last_name', profile.last_name)
        profile.phone_number = profile_data.get('phone_number', profile.phone_number)
        profile.encrypted_email = profile_data.get('encrypted_email', profile.encrypted_email)
        profile.profile_picture = profile_data.get('profile_picture', profile.profile_picture)
        profile.role = profile_data.get('role', profile.role)
        profile.subscription_tier = profile_data.get('subscription_tier', profile.subscription_tier)
        profile.save()

        return instance

class AdminUserSerializer(serializers.ModelSerializer):
    """
    Flattened serializer for administrative user management.
    Uses SerializerMethodFields for safe, flexible data representation.
    """
    nickname = serializers.SerializerMethodField()
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    subscription_tier = serializers.SerializerMethodField()
    profile_picture = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True)
    password = serializers.CharField(write_only=True, required=False)
    deactivated_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'nickname', 'first_name', 'last_name', 'role', 'subscription_tier', 'date_joined', 'last_login', 'password', 'profile_picture', 'is_active', 'deactivated_at']

    def get_nickname(self, obj):
        return getattr(obj, 'profile', None).nickname if hasattr(obj, 'profile') else ""

    def get_first_name(self, obj):
        return getattr(obj, 'profile', None).first_name if hasattr(obj, 'profile') else ""

    def get_last_name(self, obj):
        return getattr(obj, 'profile', None).last_name if hasattr(obj, 'profile') else ""
    def get_role(self, obj):
        return getattr(obj, 'profile', None).role if hasattr(obj, 'profile') else "SUBSCRIBER"

    def get_subscription_tier(self, obj):
        return getattr(obj, 'profile', None).subscription_tier if hasattr(obj, 'profile') else "NONE"

    def get_profile_picture(self, obj):
        if hasattr(obj, 'profile') and obj.profile.profile_picture:
            return obj.profile.profile_picture.url if hasattr(obj.profile.profile_picture, 'url') else None
        return None

    def get_deactivated_at(self, obj):
        return getattr(obj, 'profile', None).deactivated_at if hasattr(obj, 'profile') else None

    def create(self, validated_data):
        # Extract flattened fields from initial_data as they are MethodFields
        initial = self.initial_data
        role = initial.get('role', 'SUBSCRIBER')
        # Allow subscription tier for any role, default to PLATINUM for ADMIN
        default_tier = 'PLATINUM' if role == 'ADMIN' else 'SILVER'
        subscription_tier = initial.get('subscription_tier', default_tier)
        nickname = initial.get('nickname', '')
        first_name = initial.get('first_name', '')
        last_name = initial.get('last_name', '')
        password = validated_data.pop('password', None)
        
        # Create User
        user = User.objects.create_user(**validated_data)
        if password:
            user.set_password(password)
            user.save()
            
        # Profile is created via signals, update it
        profile, created = Profile.objects.get_or_create(user=user)
        profile.role = role
        profile.subscription_tier = subscription_tier
        profile.nickname = nickname
        profile.first_name = first_name
        profile.last_name = last_name
        profile.save()
            
        return user

    def update(self, instance, validated_data):
        # Extract flattened fields from initial_data as they are MethodFields
        initial = self.initial_data
        role = initial.get('role')
        subscription_tier = initial.get('subscription_tier')
        nickname = initial.get('nickname')
        first_name = initial.get('first_name')
        last_name = initial.get('last_name')
        password = validated_data.pop('password', None)
        
        # Update User
        instance.username = validated_data.get('username', instance.username)
        instance.email = validated_data.get('email', instance.email)
        instance.is_active = validated_data.get('is_active', instance.is_active)
        if password:
            instance.set_password(password)
        instance.save()
        
        # Update Profile
        profile, created = Profile.objects.get_or_create(user=instance)
        if role is not None: profile.role = role
        if subscription_tier is not None: profile.subscription_tier = subscription_tier
        if nickname is not None: profile.nickname = nickname
        if first_name is not None: profile.first_name = first_name
        if last_name is not None: profile.last_name = last_name
        profile.save()
        
        return instance
