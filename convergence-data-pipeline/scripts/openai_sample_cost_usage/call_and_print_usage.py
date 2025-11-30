# call_and_print_usage.py
import os
import requests

API_KEY = os.getenv("OPENAI_API_KEY")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Make an actual model call
payload = {
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello – testing usage now"}]
}

resp = requests.post(
    "https://api.openai.com/v1/chat/completions",
    json=payload,
    headers=headers,
)
print("Chat Completion Status:", resp.status_code)
print("Response:", resp.json())

# Print usage from the response (this is immediate)
usage = resp.json().get("usage", {})
print("\nImmediate Usage (inside completion):")
print(usage)
