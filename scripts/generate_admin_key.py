#!/usr/bin/env python3
"""
Generate Admin API Key
======================
Generates a secure admin API key for platform-level operations.

Usage:
    python scripts/generate_admin_key.py

The generated key should be set as ADMIN_API_KEY environment variable:
    export ADMIN_API_KEY="admin_..."

Admin API keys are used for:
- Creating/managing tenants
- Creating/revoking tenant API keys
- System bootstrap operations
- Platform-level administration

Security:
- Uses cryptographically secure random token generation
- 43-character URL-safe base64 encoded (256 bits of entropy)
- Prefixed with 'admin_' for easy identification
"""

import secrets
import os
import sys


def generate_admin_api_key() -> str:
    """
    Generate a cryptographically secure admin API key.

    Returns:
        Secure admin API key with 'admin_' prefix
    """
    # Generate 32 bytes (256 bits) of cryptographically secure random data
    # This becomes a 43-character URL-safe base64 string
    secure_token = secrets.token_urlsafe(32)

    # Prefix with 'admin_' for easy identification
    admin_key = f"admin_{secure_token}"

    return admin_key


def main():
    """Generate and display admin API key with instructions."""
    print("=" * 70)
    print("ADMIN API KEY GENERATOR")
    print("=" * 70)
    print()

    # Generate the key
    admin_key = generate_admin_api_key()

    print("✓ Generated secure admin API key (256 bits of entropy):")
    print()
    print(f"    {admin_key}")
    print()
    print("=" * 70)
    print("SETUP INSTRUCTIONS")
    print("=" * 70)
    print()
    print("1. Set the environment variable:")
    print()
    print(f"   export ADMIN_API_KEY='{admin_key}'")
    print()
    print("2. For production, add to your deployment configuration:")
    print()
    print(f"   ADMIN_API_KEY={admin_key}")
    print()
    print("3. Store securely (e.g., GCP Secret Manager):")
    print()
    print("   gcloud secrets create admin-api-key \\")
    print(f"       --data-file=<(echo -n '{admin_key}')")
    print()
    print("=" * 70)
    print("USAGE")
    print("=" * 70)
    print()
    print("Use this key in the 'X-Admin-Key' header for admin endpoints:")
    print()
    print("  # Bootstrap system")
    print("  curl -X POST http://localhost:8000/api/v1/admin/bootstrap \\")
    print(f"       -H 'X-Admin-Key: {admin_key}' \\")
    print("       -H 'Content-Type: application/json' \\")
    print("       -d '{\"force_recreate_dataset\": false}'")
    print()
    print("  # Create tenant")
    print("  curl -X POST http://localhost:8000/api/v1/admin/tenants \\")
    print(f"       -H 'X-Admin-Key: {admin_key}' \\")
    print("       -H 'Content-Type: application/json' \\")
    print("       -d '{\"tenant_id\": \"acmecorp\", \"description\": \"Acme Corp\"}'")
    print()
    print("  # Generate tenant API key")
    print("  curl -X POST http://localhost:8000/api/v1/admin/api-keys \\")
    print(f"       -H 'X-Admin-Key: {admin_key}' \\")
    print("       -H 'Content-Type: application/json' \\")
    print("       -d '{\"tenant_id\": \"acmecorp\", \"description\": \"Production API key\"}'")
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
    print("  5. Audit all admin API key usage")
    print("  6. Revoke immediately if compromised")
    print()
    print("=" * 70)

    # Optionally save to file
    save_to_file = input("\nSave to .env.admin file? (y/N): ").strip().lower()
    if save_to_file == 'y':
        env_file = os.path.join(os.path.dirname(__file__), '..', '.env.admin')
        with open(env_file, 'w') as f:
            f.write(f"# Admin API Key - DO NOT COMMIT\n")
            f.write(f"# Generated: {__import__('datetime').datetime.utcnow().isoformat()}Z\n")
            f.write(f"ADMIN_API_KEY={admin_key}\n")
        print(f"\n✓ Saved to {env_file}")
        print("⚠️  Remember to add .env.admin to .gitignore!")

    print()


if __name__ == "__main__":
    main()
