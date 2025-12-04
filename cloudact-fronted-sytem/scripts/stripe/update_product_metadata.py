#!/usr/bin/env python3
"""
Update Stripe Product Metadata & Price Tax Settings Script

Updates product metadata and price tax behavior for both sandbox and production environments.
This metadata is required for the billing system to work correctly.

Usage:
    python update_product_metadata.py [--sandbox-only] [--production-only] [--skip-tax]

Environment Variables (loaded from .env.local):
    STRIPE_SECRET_KEY          - Sandbox/Test API key (sk_test_...)
    STRIPE_LIVE_SECRET_KEY     - Production API key (sk_live_...) [optional]

Requirements:
    pip install stripe python-dotenv
"""

import os
import sys
from pathlib import Path

try:
    import stripe
except ImportError:
    print("Error: stripe package not installed. Run: pip install stripe")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("Error: python-dotenv package not installed. Run: pip install python-dotenv")
    sys.exit(1)


def load_env_file():
    """Load environment variables from .env.local"""
    # Find the project root (where .env.local is)
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent  # scripts/stripe -> scripts -> project root
    env_file = project_root / ".env.local"

    if env_file.exists():
        load_dotenv(env_file)
        print(f"Loaded environment from: {env_file}")
    else:
        print(f"Warning: .env.local not found at {env_file}")
        print("Using environment variables from shell")


def update_product_metadata(secret_key, product_id, metadata, env_name=""):
    """Update a single product's metadata"""
    stripe.api_key = secret_key
    try:
        result = stripe.Product.modify(product_id, metadata=metadata)
        print(f"  ✓ Updated product {result.name} ({product_id})")
        return result
    except stripe.error.StripeError as e:
        print(f"  ✗ Failed to update product {product_id}: {e}")
        return None


def set_product_tax_code(secret_key, product_id, tax_code="txcd_10000000"):
    """Set the default tax code for a product (Software as a Service)"""
    stripe.api_key = secret_key
    try:
        # txcd_10000000 = Software as a Service (SaaS) - business use
        result = stripe.Product.modify(product_id, tax_code=tax_code)
        print(f"  ✓ Set tax code for {result.name}: {tax_code}")
        return result
    except stripe.error.StripeError as e:
        print(f"  ✗ Failed to set tax code for {product_id}: {e}")
        return None


def list_and_show_prices(secret_key, product_id, product_name):
    """List prices for a product and show their details"""
    stripe.api_key = secret_key
    try:
        prices = stripe.Price.list(product=product_id, active=True)
        print(f"\n  Prices for {product_name}:")
        for price in prices.data:
            amount = price.unit_amount / 100 if price.unit_amount else 0
            interval = price.recurring.interval if price.recurring else "one-time"
            tax = price.tax_behavior or "NOT SET"
            print(f"    - {price.id}: ${amount}/{interval} (tax_behavior: {tax})")
        return prices.data
    except stripe.error.StripeError as e:
        print(f"  ✗ Failed to list prices: {e}")
        return []


# Plan metadata configuration (shared between sandbox and production)
PLAN_METADATA = {
    "starter": {
        "plan_id": "starter",
        "teamMembers": "2",
        "providers": "3",
        "pipelinesPerDay": "6",
        "concurrentPipelines": "20",
        "features": "Owner + 1 member (2 total)|Up to 3 providers|6 pipelines per day|20 concurrent pipelines",
        "order": "1"
    },
    "professional": {
        "plan_id": "professional",
        "teamMembers": "6",
        "providers": "6",
        "pipelinesPerDay": "25",
        "concurrentPipelines": "20",
        "features": "Owner + 5 members (6 total)|Up to 6 providers|25 pipelines per day|20 concurrent pipelines",
        "order": "2",
        "is_popular": "true"
    },
    "scale": {
        "plan_id": "scale",
        "teamMembers": "11",
        "providers": "10",
        "pipelinesPerDay": "100",
        "concurrentPipelines": "20",
        "features": "Owner + 10 members (11 total)|Up to 10 providers|100 pipelines per day|20 concurrent pipelines",
        "order": "3"
    }
}

# Sandbox product IDs (Test mode)
SANDBOX_PRODUCTS = {
    "starter": {"product_id": "prod_TT7yNcYkTzFD3E"},
    "professional": {"product_id": "prod_TT7yNdcvYwdCs0"},
    "scale": {"product_id": "prod_TT7y5aAyK7ldHV"}
}

# Production product IDs (Live mode)
PRODUCTION_PRODUCTS = {
    "starter": {"product_id": "prod_TTFsoDYNuuYpgq"},
    "professional": {"product_id": "prod_TTFuekPKDVhoBg"},
    "scale": {"product_id": "prod_TTFuFkz3dQcFFt"}
}


def process_environment(secret_key, products, env_name, skip_tax=False):
    """Process all products in an environment"""
    if not secret_key:
        print(f"\n⚠️  Skipping {env_name}: No API key configured")
        return

    print(f"\n{'🧪' if 'sandbox' in env_name.lower() else '🚀'} Processing {env_name}...")
    print("-" * 50)

    for plan_name, details in products.items():
        print(f"\n📦 {plan_name.upper()}")

        # Get metadata for this plan
        metadata = PLAN_METADATA.get(plan_name, {})

        # Update product metadata
        update_product_metadata(
            secret_key,
            details["product_id"],
            metadata,
            env_name
        )

        if not skip_tax:
            # Set tax code for the product
            set_product_tax_code(secret_key, details["product_id"])

            # Show current prices
            list_and_show_prices(secret_key, details["product_id"], plan_name)


def main():
    # Load environment variables from .env.local
    load_env_file()

    # Get API keys from environment
    sandbox_key = os.getenv("STRIPE_SECRET_KEY")
    production_key = os.getenv("STRIPE_LIVE_SECRET_KEY")

    # Parse arguments
    sandbox_only = "--sandbox-only" in sys.argv
    production_only = "--production-only" in sys.argv
    skip_tax = "--skip-tax" in sys.argv

    print("=" * 50)
    print("Stripe Product & Price Configuration")
    print("=" * 50)

    # Validate keys
    if not sandbox_key and not production_only:
        print("\n⚠️  STRIPE_SECRET_KEY not found in environment")
        print("   Add it to .env.local or set it in your shell")

    if not production_key and not sandbox_only:
        print("\n⚠️  STRIPE_LIVE_SECRET_KEY not found in environment")
        print("   Production updates will be skipped")

    if not production_only and sandbox_key:
        process_environment(sandbox_key, SANDBOX_PRODUCTS, "SANDBOX", skip_tax)

    if not sandbox_only and production_key:
        process_environment(production_key, PRODUCTION_PRODUCTS, "PRODUCTION", skip_tax)

    print("\n" + "=" * 50)
    print("✅ Done!")
    print("=" * 50)

    if not skip_tax:
        print("\n⚠️  IMPORTANT: If you see 'tax_behavior: NOT SET' above:")
        print("   You have two options to fix the tax error:")
        print("")
        print("   Option 1: Disable automatic tax (recommended for testing)")
        print("   → Go to Stripe Dashboard > Settings > Tax")
        print("   → Turn OFF 'Automatic tax calculation'")
        print("")
        print("   Option 2: Create new prices with tax_behavior set")
        print("   → Go to Stripe Dashboard > Products > [Product] > Add price")
        print("   → Set 'Tax behavior' to 'Exclusive' or 'Inclusive'")
        print("   → Archive the old price without tax_behavior")


if __name__ == "__main__":
    main()
