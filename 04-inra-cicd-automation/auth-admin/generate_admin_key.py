#!/usr/bin/env python3
"""
Generate CA Root API Key
========================
Generates a secure CA Root API key for platform-level operations.

Usage:
    python scripts/generate_admin_key.py

The generated key should be set as CA_ROOT_API_KEY environment variable:
    export CA_ROOT_API_KEY="ca_root_..."

CA Root API keys are used for:
- Creating/managing organizations
- Creating/revoking organization API keys
- System bootstrap operations
- Platform-level administration

Security:
- Uses cryptographically secure random token generation
- 43-character URL-safe base64 encoded (256 bits of entropy)
- Prefixed with 'ca_root_' for easy identification
"""

import secrets
import os
import sys


def generate_ca_root_api_key() -> str:
    """
    Generate a cryptographically secure CA Root API key.

    Returns:
        Secure CA Root API key with 'ca_root_' prefix
    """
    # Generate 32 bytes (256 bits) of cryptographically secure random data
    # This becomes a 43-character URL-safe base64 string
    secure_token = secrets.token_urlsafe(32)

    # Prefix with 'ca_root_' for easy identification
    ca_root_key = f"ca_root_{secure_token}"

    return ca_root_key


def main():
    """Generate and display CA Root API key with instructions."""
    print("=" * 70)
    print("CA ROOT API KEY GENERATOR")
    print("=" * 70)
    print()

    # Generate the key
    ca_root_key = generate_ca_root_api_key()

    print("✓ Generated secure CA Root API key (256 bits of entropy):")
    print()
    print(f"    {ca_root_key}")
    print()
    print("=" * 70)
    print("SETUP INSTRUCTIONS")
    print("=" * 70)
    print()
    print("1. Set the environment variable:")
    print()
    print(f"   export CA_ROOT_API_KEY='{ca_root_key}'")
    print()
    print("2. For production, add to your deployment configuration:")
    print()
    print(f"   CA_ROOT_API_KEY={ca_root_key}")
    print()
    print("3. Store securely (e.g., GCP Secret Manager):")
    print()
    print("   gcloud secrets create ca-root-api-key \\")
    print(f"       --data-file=<(echo -n '{ca_root_key}')")
    print()
    print("=" * 70)
    print("USAGE")
    print("=" * 70)
    print()
    print("Use this key in the 'X-CA-Root-Key' header for admin endpoints:")
    print()
    print("  # Bootstrap system")
    print("  curl -X POST http://localhost:8000/api/v1/admin/bootstrap \\")
    print(f"       -H 'X-CA-Root-Key: {ca_root_key}' \\")
    print("       -H 'Content-Type: application/json' \\")
    print("       -d '{\"force_recreate_dataset\": false}'")
    print()
    print("  # Onboard organization")
    print("  curl -X POST http://localhost:8000/api/v1/organizations/onboard \\")
    print(f"       -H 'X-CA-Root-Key: {ca_root_key}' \\")
    print("       -H 'Content-Type: application/json' \\")
    print("       -d '{\"org_slug\": \"acmecorp\", \"company_name\": \"Acme Corp\", \"admin_email\": \"admin@acme.com\"}'")
    print()
    print("=" * 70)
    print("SECURITY NOTES")
    print("=" * 70)
    print()
    print("⚠️  CRITICAL SECURITY REQUIREMENTS:")
    print()
    print("  1. NEVER commit this key to version control")
    print("  2. Store in secure secret management (GCP Secret Manager, HashiCorp Vault)")
    print("  3. Rotate regularly (every 90 days recommended)")
    print("  4. Use different keys for staging and production")
    print("  5. Audit all CA Root API key usage")
    print("  6. Revoke immediately if compromised")
    print()
    print("=" * 70)

    # Optionally save to file
    save_to_file = input("\nSave to .env.ca_root file? (y/N): ").strip().lower()
    if save_to_file == 'y':
        env_file = os.path.join(os.path.dirname(__file__), '..', '.env.ca_root')
        with open(env_file, 'w') as f:
            f.write(f"# CA Root API Key - DO NOT COMMIT\n")
            f.write(f"# Generated: {__import__('datetime').datetime.utcnow().isoformat()}Z\n")
            f.write(f"CA_ROOT_API_KEY={ca_root_key}\n")
        print(f"\n✓ Saved to {env_file}")
        print("⚠️  Remember to add .env.ca_root to .gitignore!")

    print()


if __name__ == "__main__":
    main()
