import os
import django
from django.conf import settings

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

def create_test_user():
    username = 'admin'
    email = 'admin@example.com'
    password = 'admin'
    
    if not User.objects.filter(username=username).exists():
        print(f"Creating superuser: {username}")
        User.objects.create_superuser(username, email, password)
        print(f"User '{username}' created with password '{password}'")
    else:
        print(f"User '{username}' already exists. Resetting password to '{password}'")
        user = User.objects.get(username=username)
        user.set_password(password)
        user.save()
        print(f"Password for '{username}' has been reset to '{password}'")

if __name__ == "__main__":
    create_test_user()
