#!/usr/bin/env python3
"""
generate_traffic.py (OpenAI)

Generates traffic by making a ChatCompletion call and logs usage to a local file.
"""
import os
import sys
import requests
from pathlib import Path

# Add project root to path to import utils
sys.path.append(str(Path(__file__).resolve().parents[2]))
from scripts.utils.usage_store import log_usage

BASE_URL = "https://api.openai.com/v1"

def get_api_key() -> str:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY environment variable is required.")
    return key

def run_traffic_test():
    print("[OPENAI] Generating traffic...")
    
    url = f"{BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {get_api_key()}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "user", "content": "Hello, this is a traffic generation test."}
        ]
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        
        usage = data.get("usage", {})
        model = data.get("model", "gpt-4o-mini")
        
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)
        
        log_usage(
            provider="openai",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            metadata={"endpoint": "/chat/completions", "request_id": data.get("id")}
        )
        print("[OPENAI] Traffic generated and logged.")

    except Exception as e:
        print(f"[OPENAI] Error: {e}")

if __name__ == "__main__":
    run_traffic_test()
