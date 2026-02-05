from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Profile

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ['nickname', 'first_name', 'last_name', 'phone_number', 'encrypted_email', 'profile_picture']

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
        profile.save()

        return instance
