import os
import django
from django.conf import settings

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from chat.llm import LLMFactory
from dotenv import load_dotenv

load_dotenv()

def debug_stream():
    provider = LLMFactory.get_provider()
    print(f"Debug: Using provider {type(provider)}")
    
    messages = [{"role": "user", "content": "Say hello"}]
    
    print("\n--- Generating Response (Non-Streaming) ---")
    try:
        response = provider.generate_response(messages)
        print(f"Type: {type(response)}")
        print(f"Content: {response!r}")
    except Exception as e:
        print(f"Error: {e}")

    print("\n--- Streaming Response ---")
    try:
        for chunk in provider.stream_response(messages):
            print(f"Type: {type(chunk)}")
            print(f"Content: {chunk!r}")
            print("-" * 20)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_stream()
