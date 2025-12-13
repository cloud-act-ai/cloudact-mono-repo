#!/usr/bin/env python3
"""
generate_traffic.py

Generates API traffic for all 3 LLM providers (OpenAI, Anthropic, Gemini).
Includes timestamp in prompt for tracking when calls occurred.

Usage:
    python generate_traffic.py              # Run all providers
    python generate_traffic.py --provider openai  # Run specific provider
"""
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from openai import api as openai_api
from anthropic import api as anthropic_api
from gemini import api as gemini_api

# Also log to local store as backup
from utils.usage_store import log_usage


def run_openai() -> dict:
    """Run OpenAI traffic generation."""
    print("[OPENAI] Generating traffic...")
    try:
        result = openai_api.generate_traffic()

        # Log locally
        log_usage(
            provider="openai",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            metadata={"request_id": result.get("request_id"), "prompt": result.get("prompt")}
        )

        print(f"  Model: {result['model']}")
        print(f"  Input tokens: {result['input_tokens']}")
        print(f"  Output tokens: {result['output_tokens']}")
        print(f"  Total cost: ${result['total_cost_usd']:.6f}")
        print(f"  Latency: {result['latency_ms']:.2f}ms")
        print(f"  Request ID: {result.get('request_id')}")
        print("  Status: SUCCESS\n")
        return result

    except Exception as e:
        print(f"  Status: FAILED - {e}\n")
        return {"error": str(e), "provider": "openai"}


def run_anthropic() -> dict:
    """Run Anthropic traffic generation."""
    print("[ANTHROPIC] Generating traffic...")
    try:
        result = anthropic_api.generate_traffic()

        # Log locally
        log_usage(
            provider="anthropic",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            metadata={"request_id": result.get("request_id"), "prompt": result.get("prompt")}
        )

        print(f"  Model: {result['model']}")
        print(f"  Input tokens: {result['input_tokens']}")
        print(f"  Output tokens: {result['output_tokens']}")
        print(f"  Total cost: ${result['total_cost_usd']:.6f}")
        print(f"  Latency: {result['latency_ms']:.2f}ms")
        print(f"  Request ID: {result.get('request_id')}")
        print("  Status: SUCCESS\n")
        return result

    except Exception as e:
        print(f"  Status: FAILED - {e}\n")
        return {"error": str(e), "provider": "anthropic"}


def run_gemini() -> dict:
    """Run Gemini traffic generation."""
    print("[GEMINI] Generating traffic...")
    try:
        result = gemini_api.generate_traffic()

        # Log locally
        log_usage(
            provider="gemini",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            metadata={"prompt": result.get("prompt")}
        )

        print(f"  Model: {result['model']}")
        print(f"  Input tokens: {result['input_tokens']}")
        print(f"  Output tokens: {result['output_tokens']}")
        print(f"  Total cost: ${result['total_cost_usd']:.6f}")
        print(f"  Latency: {result['latency_ms']:.2f}ms")
        print("  Status: SUCCESS\n")
        return result

    except Exception as e:
        print(f"  Status: FAILED - {e}\n")
        return {"error": str(e), "provider": "gemini"}


def main():
    parser = argparse.ArgumentParser(description="Generate API traffic for LLM providers")
    parser.add_argument(
        "--provider", "-p",
        choices=["openai", "anthropic", "gemini", "all"],
        default="all",
        help="Provider to run (default: all)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("TRAFFIC GENERATION")
    print("=" * 60)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"Started at: {timestamp}\n")

    results = []
    errors = []

    providers = {
        "openai": run_openai,
        "anthropic": run_anthropic,
        "gemini": run_gemini
    }

    if args.provider == "all":
        for name, func in providers.items():
            result = func()
            if "error" in result:
                errors.append((name, result["error"]))
            else:
                results.append(result)
    else:
        result = providers[args.provider]()
        if "error" in result:
            errors.append((args.provider, result["error"]))
        else:
            results.append(result)

    # Summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    total_providers = 3 if args.provider == "all" else 1
    print(f"Successful: {len(results)}/{total_providers}")
    print(f"Failed: {len(errors)}/{total_providers}")

    if errors:
        print("\nErrors:")
        for provider, error in errors:
            print(f"  - {provider}: {error}")

    if results:
        total_input = sum(r.get("input_tokens", 0) for r in results)
        total_output = sum(r.get("output_tokens", 0) for r in results)
        total_cost = sum(r.get("total_cost_usd", 0) for r in results)
        avg_latency = sum(r.get("latency_ms", 0) for r in results) / len(results)
        print(f"\nTotal tokens used:")
        print(f"  Input: {total_input}")
        print(f"  Output: {total_output}")
        print(f"  Total cost: ${total_cost:.6f}")
        print(f"  Avg latency: {avg_latency:.2f}ms")


if __name__ == "__main__":
    main()
