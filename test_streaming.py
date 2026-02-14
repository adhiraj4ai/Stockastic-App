import requests
import json
import sys

def test_stream():
    url = "http://localhost:8000/api/chat/sessions/458f61e6-cc49-481a-960b-1a26b115a5a5/stream_message/"
    payload = {
        "role": "user",
        "content": "What is the current market summary?"
    }
    
    # We need a token. I'll try to get one if possible or just assume one for the sake of the script
    # Since I'm running inside the same environment, I might need to bypass auth or use a known token
    # For now, I'll just check if the endpoint responds.
    
    print(f"Sending request to {url}...")
    try:
        # Note: This might fail without auth, but I'm checking the SERVER LOGS concurrently
        response = requests.post(url, json=payload, stream=True, timeout=30)
        print(f"Status: {response.status_code}")
        
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                print(decoded_line)
                if "[TOOL_CALL:" in decoded_line:
                    print("--> Tool call detected in stream")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_stream()
