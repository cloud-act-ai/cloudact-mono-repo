#!/usr/bin/env python3
"""
generate_traffic.py (Anthropic)

Generates traffic by making a Messages API call and logs usage to a local file.
"""
import os
import sys
import requests
from pathlib import Path

# Add project root to path to import utils
sys.path.append(str(Path(__file__).resolve().parents[2]))
from scripts.utils.usage_store import log_usage

def get_api_key() -> str:
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is required.")
    return key

def run_traffic_test():
    print("[ANTHROPIC] Generating traffic...")
    
    model = "claude-3-opus-20240229"
    url = "https://api.anthropic.com/v1/messages"
    
    headers = {
        "x-api-key": get_api_key(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    
    payload = {
        "model": model,
        "max_tokens": 1024,
        "messages": [
            {"role": "user", "content": "Hello, this is a traffic generation test."}
        ]
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        
        usage = data.get("usage", {})
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        
        log_usage(
            provider="anthropic",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            metadata={"endpoint": "messages", "request_id": data.get("id")}
        )
        print("[ANTHROPIC] Traffic generated and logged.")

    except Exception as e:
        print(f"[ANTHROPIC] Error: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"[ANTHROPIC] Response: {e.response.text}")

if __name__ == "__main__":
    run_traffic_test()
