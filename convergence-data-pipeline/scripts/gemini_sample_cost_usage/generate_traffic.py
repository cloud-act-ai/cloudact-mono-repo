#!/usr/bin/env python3
"""
generate_traffic.py (Gemini)

Generates traffic by making a generateContent call and logs usage to a local file.
"""
import os
import sys
import requests
from pathlib import Path

# Add project root to path to import utils
sys.path.append(str(Path(__file__).resolve().parents[2]))
from scripts.utils.usage_store import log_usage

def get_api_key() -> str:
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required.")
    return key

def run_traffic_test():
    print("[GEMINI] Generating traffic...")
    
    model = "gemini-2.5-flash-lite-preview-09-2025"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    
    headers = {"Content-Type": "application/json"}
    params = {"key": get_api_key()}
    payload = {
        "contents": [{"parts": [{"text": "Hello, this is a traffic generation test."}]}]
    }

    try:
        resp = requests.post(url, headers=headers, params=params, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        
        usage = data.get("usageMetadata", {})
        input_tokens = usage.get("promptTokenCount", 0)
        output_tokens = usage.get("candidatesTokenCount", 0)
        
        log_usage(
            provider="gemini",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            metadata={"endpoint": "generateContent"}
        )
        print("[GEMINI] Traffic generated and logged.")

    except Exception as e:
        print(f"[GEMINI] Error: {e}")

if __name__ == "__main__":
    run_traffic_test()
