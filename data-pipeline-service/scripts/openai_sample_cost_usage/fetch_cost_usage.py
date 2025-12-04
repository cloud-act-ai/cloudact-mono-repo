#!/usr/bin/env python3
"""
fetch_cost_usage.py (OpenAI)

Reads local usage logs and generates a cost report.
"""
import sys
import csv
from pathlib import Path
from typing import Dict, List, Any

# Add project root to path to import utils
sys.path.append(str(Path(__file__).resolve().parents[2]))
from scripts.utils.usage_store import get_usage

# Pricing Table (Approximate)
PRICING = {
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
}

def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    # Simple prefix matching
    rate = None
    for k, v in PRICING.items():
        if k in model:
            rate = v
            break
            
    if not rate:
        return 0.0
        
    return (input_tokens / 1000.0) * rate["input"] + (output_tokens / 1000.0) * rate["output"]

def main():
    print("[OPENAI] Fetching cost usage from local logs...")
    events = get_usage(provider="openai")
    
    if not events:
        print("[OPENAI] No usage events found.")
        return

    rows = []
    for event in events:
        cost = calculate_cost(event["model"], event["input_tokens"], event["output_tokens"])
        row = {
            "timestamp_utc": event["timestamp_utc"],
            "model": event["model"],
            "input_tokens": event["input_tokens"],
            "output_tokens": event["output_tokens"],
            "estimated_cost_usd": round(cost, 8)
        }
        rows.append(row)
        
    # Write CSV
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    csv_path = output_dir / "openai_cost_report.csv"
    
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        
    print(f"[OPENAI] Report generated: {csv_path}")

if __name__ == "__main__":
    main()
