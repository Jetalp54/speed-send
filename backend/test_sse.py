#!/usr/bin/env python3
"""
Test SSE endpoint to verify it's working
Run this on your server: python test_sse.py
"""
import requests
import time

def test_sse_stream():
    """Test the SSE stream endpoint"""
    url = "http://localhost:8000/api/v1/live-logs/stream"
    
    print(f"Connecting to {url}...")
    
    try:
        response = requests.get(url, stream=True, timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Headers: {response.headers}")
        print("\nListening for events (press Ctrl+C to stop)...\n")
        
        for line in response.iter_lines():
            if line:
                print(line.decode('utf-8'))
        
    except KeyboardInterrupt:
        print("\nStopped")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_sse_stream()
