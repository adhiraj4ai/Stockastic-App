import os
import django
import sys
import json
import time

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from django.contrib.auth import get_user_model
from chat.models import ChatSession
from rest_framework_simplejwt.tokens import RefreshToken

def run_test():
    User = get_user_model()
    # Create or get user
    u, created = User.objects.get_or_create(username='debug_stream', email='debug_stream@example.com')
    if created or not u.check_password('password'):
        u.set_password('password')
        u.save()

    # Generate JWT Token
    refresh = RefreshToken.for_user(u)
    access_token = str(refresh.access_token)

    # Create session
    s = ChatSession.objects.create(user=u, title='Debug Session')

    print(f"User: {u.username}")
    print(f"Access Token: {access_token[:20]}...")
    print(f"Session: {s.id}")

    # Use requests
    try:
        import requests
        print("Using requests library...")
        url = f"http://127.0.0.1:8000/api/chat/sessions/{s.id}/stream_message/"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        data = {"role": "user", "content": "Show me a detailed market activity report for this week. Focus on volume breakouts and gainers."}

        print(f"Connecting to {url}...")
        start_time = time.time()
        
        with requests.post(url, headers=headers, json=data, stream=True) as r:
            print(f"Response Status: {r.status_code}")
            if r.status_code != 200:
                print(f"Error: {r.text}")
                return

            print("--- STREAM START ---")
            for line in r.iter_lines():
                if line:
                    decoded = line.decode('utf-8')
                    print(f"[{time.time() - start_time:.2f}s] {decoded}")
            print("--- STREAM END ---")
            
    except ImportError:
        print("Requests library not found. Please install it or run from outside.")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_test()
