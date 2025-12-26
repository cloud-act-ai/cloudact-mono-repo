#!/usr/bin/env python3
"""
generate_traffic.py

Generates API traffic for GenAI providers (OpenAI, Anthropic, Gemini, Azure OpenAI).
Logs usage to genai_payg_usage.csv via usage_store.

Usage:
    python generate_traffic.py              # Run all providers
    python generate_traffic.py --provider openai  # Run specific provider
"""
import os
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

# Add current directory to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

# Load .env file if exists
ENV_FILE = SCRIPT_DIR / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        if line.strip() and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())

from openai import api as openai_api
from anthropic import api as anthropic_api
from gemini import api as gemini_api

# Use new genai structure
from utils.usage_store import log_payg_usage
from utils.pricing_loader import calculate_cost


def run_openai() -> dict:
    """Run OpenAI traffic generation."""
    print("[OPENAI] Generating traffic...")
    try:
        result = openai_api.generate_traffic()

        # Calculate cost using new pricing loader
        cost_data = calculate_cost(
            provider="openai",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
        )

        # Log to genai_payg_usage.csv
        log_payg_usage(
            provider="openai",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            cost_usd=cost_data["total_cost"],
            request_id=result.get("request_id", ""),
            org_slug="acme",
            environment="dev",
            status="success",
            latency_ms=int(result.get("latency_ms", 0)),
        )

        print(f"  Model: {result['model']}")
        print(f"  Input tokens: {result['input_tokens']}")
        print(f"  Output tokens: {result['output_tokens']}")
        print(f"  Total cost: ${cost_data['total_cost']:.6f}")
        print(f"  Latency: {result['latency_ms']:.2f}ms")
        print(f"  Request ID: {result.get('request_id')}")
        print("  Status: SUCCESS\n")

        result["calculated_cost_usd"] = cost_data["total_cost"]
        return result

    except Exception as e:
        print(f"  Status: FAILED - {e}\n")
        return {"error": str(e), "provider": "openai"}


def run_anthropic() -> dict:
    """Run Anthropic traffic generation."""
    print("[ANTHROPIC] Generating traffic...")
    try:
        result = anthropic_api.generate_traffic()

        # Calculate cost using new pricing loader
        cost_data = calculate_cost(
            provider="anthropic",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
        )

        # Log to genai_payg_usage.csv
        log_payg_usage(
            provider="anthropic",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            cost_usd=cost_data["total_cost"],
            request_id=result.get("request_id", ""),
            org_slug="acme",
            environment="dev",
            status="success",
            latency_ms=int(result.get("latency_ms", 0)),
        )

        print(f"  Model: {result['model']}")
        print(f"  Input tokens: {result['input_tokens']}")
        print(f"  Output tokens: {result['output_tokens']}")
        print(f"  Total cost: ${cost_data['total_cost']:.6f}")
        print(f"  Latency: {result['latency_ms']:.2f}ms")
        print(f"  Request ID: {result.get('request_id')}")
        print("  Status: SUCCESS\n")

        result["calculated_cost_usd"] = cost_data["total_cost"]
        return result

    except Exception as e:
        print(f"  Status: FAILED - {e}\n")
        return {"error": str(e), "provider": "anthropic"}


def run_gemini() -> dict:
    """Run Gemini traffic generation."""
    print("[GEMINI] Generating traffic...")
    try:
        result = gemini_api.generate_traffic()

        # Calculate cost using new pricing loader
        cost_data = calculate_cost(
            provider="gemini",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
        )

        # Log to genai_payg_usage.csv
        log_payg_usage(
            provider="gemini",
            model=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            cost_usd=cost_data["total_cost"],
            org_slug="acme",
            environment="dev",
            status="success",
            latency_ms=int(result.get("latency_ms", 0)),
        )

        print(f"  Model: {result['model']}")
        print(f"  Input tokens: {result['input_tokens']}")
        print(f"  Output tokens: {result['output_tokens']}")
        print(f"  Total cost: ${cost_data['total_cost']:.6f}")
        print(f"  Latency: {result['latency_ms']:.2f}ms")
        print("  Status: SUCCESS\n")

        result["calculated_cost_usd"] = cost_data["total_cost"]
        return result

    except Exception as e:
        print(f"  Status: FAILED - {e}\n")
        return {"error": str(e), "provider": "gemini"}


def run_azure_openai() -> dict:
    """
    Simulate Azure OpenAI traffic.
    Uses same OpenAI API but logs as azure_openai provider.
    """
    print("[AZURE_OPENAI] Generating traffic...")
    try:
        # Use OpenAI API but with Azure-hosted model names
        result = openai_api.generate_traffic()

        # Override with Azure-equivalent model
        azure_model = "gpt-4o"  # Azure hosted

        # Calculate cost using azure_openai pricing
        cost_data = calculate_cost(
            provider="azure_openai",
            model=azure_model,
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
        )

        # Log to genai_payg_usage.csv as azure_openai
        log_payg_usage(
            provider="azure_openai",
            model=azure_model,
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            cost_usd=cost_data["total_cost"],
            request_id=result.get("request_id", ""),
            org_slug="acme",
            environment="prod",  # Simulate prod for Azure
            status="success",
            latency_ms=int(result.get("latency_ms", 0)),
        )

        print(f"  Model: {azure_model} (Azure hosted)")
        print(f"  Input tokens: {result['input_tokens']}")
        print(f"  Output tokens: {result['output_tokens']}")
        print(f"  Total cost: ${cost_data['total_cost']:.6f}")
        print(f"  Latency: {result['latency_ms']:.2f}ms")
        print("  Status: SUCCESS\n")

        return {
            "provider": "azure_openai",
            "model": azure_model,
            "input_tokens": result["input_tokens"],
            "output_tokens": result["output_tokens"],
            "calculated_cost_usd": cost_data["total_cost"],
            "latency_ms": result.get("latency_ms", 0),
        }

    except Exception as e:
        print(f"  Status: FAILED - {e}\n")
        return {"error": str(e), "provider": "azure_openai"}


def main():
    parser = argparse.ArgumentParser(description="Generate API traffic for GenAI providers")
    parser.add_argument(
        "--provider", "-p",
        choices=["openai", "anthropic", "gemini", "azure_openai", "all"],
        default="all",
        help="Provider to run (default: all)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("GENAI TRAFFIC GENERATION")
    print("=" * 60)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"Started at: {timestamp}\n")

    results = []
    errors = []

    providers = {
        "openai": run_openai,
        "anthropic": run_anthropic,
        "gemini": run_gemini,
        "azure_openai": run_azure_openai,
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
    total_providers = len(providers) if args.provider == "all" else 1
    print(f"Successful: {len(results)}/{total_providers}")
    print(f"Failed: {len(errors)}/{total_providers}")

    if errors:
        print("\nErrors:")
        for provider, error in errors:
            print(f"  - {provider}: {error}")

    if results:
        total_input = sum(r.get("input_tokens", 0) for r in results)
        total_output = sum(r.get("output_tokens", 0) for r in results)
        total_cost = sum(r.get("calculated_cost_usd", 0) for r in results)
        avg_latency = sum(r.get("latency_ms", 0) for r in results) / len(results)
        print(f"\nTotal tokens used:")
        print(f"  Input: {total_input}")
        print(f"  Output: {total_output}")
        print(f"  Total cost: ${total_cost:.6f}")
        print(f"  Avg latency: {avg_latency:.2f}ms")

    print(f"\nUsage logged to: output/usage/genai_payg_usage.csv")


if __name__ == "__main__":
    main()
