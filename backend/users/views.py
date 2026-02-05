from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .serializers import UserSerializer
from django.contrib.auth.models import User

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    return Response({"message": "Welcome to Stockastic Dashboard!", "user": request.user.username})

@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    # Auto-create Default Account for Ashmi
    if request.user.username == 'ashmi':
        from stocks.models import PortfolioAccount
        if not PortfolioAccount.objects.filter(user=request.user).exists():
            PortfolioAccount.objects.create(user=request.user, name="Main Portfolio")
    
    # Ensure profile exists
    if not hasattr(request.user, 'profile'):
        from .models import Profile
        Profile.objects.create(user=request.user)

    if request.method == 'GET':
        serializer = UserSerializer(request.user)
        # Flattened structure to match frontend expectations or modify frontend
        # Current frontend expects flat object. Let's flatten it manually for backward compat if needed,
        # OR update frontend to read nested profile.
        # Frontend settings/page.tsx interfaces: username, email, first_name, etc (flat).
        # We will flatten the response here to match the frontend, easier than rewriting frontend completely.
        
        data = serializer.data
        profile = data.pop('profile', {})
        data.update(profile)
        # Map encrypted_email to be displayed if available, else user.email
        # Frontend has 'email' field. We can send encrypted_email as a separate field or override.
        # Let's send everything flat.
        return Response(data)

    elif request.method in ['PUT', 'PATCH']:
        # Deserialize flat data back to nested
        user_data = request.data.copy()
        profile_data = {}
        for field in ['nickname', 'first_name', 'last_name', 'phone_number', 'profile_picture']:
            if field in user_data:
                profile_data[field] = user_data.pop(field)
        
        # Handle encrypted_email: mapped from email input if we want to store it there
        # or separate field? Frontend sends "email". 
        # Requirement: "email must be encrypted".
        # So when user updates email, we save to 'encrypted_email' in profile AND maybe 'email' in User for login?
        # Let's save to both for now to be safe, or just Profile if we want strict separation.
        # Plan: Save input 'email' to User.email (for auth) AND Profile.encrypted_email (for encryption/display req).
        if 'email' in user_data:
             profile_data['encrypted_email'] = user_data['email']
        
        # Re-structure for serializer
        serializer_data = user_data
        serializer_data['profile'] = profile_data

        serializer = UserSerializer(request.user, data=serializer_data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
