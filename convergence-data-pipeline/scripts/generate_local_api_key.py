"""
Generate API keys locally without BigQuery dependency.
Stores keys in secrets folder for local development.
"""

import secrets
import hashlib
import json
from datetime import datetime
from pathlib import Path


def generate_api_key(tenant_id: str) -> tuple[str, str]:
    """
    Generate a secure API key for a tenant.

    Args:
        tenant_id: Tenant identifier

    Returns:
        Tuple of (plaintext_key, hashed_key)
    """
    # Generate random 32-byte key
    random_bytes = secrets.token_bytes(32)

    # Base64-like encoding (URL-safe)
    key_suffix = secrets.token_urlsafe(32)

    # Format: sk_{tenant_id}_{key_suffix}
    api_key = f"sk_{tenant_id}_{key_suffix}"

    # Hash the key (SHA256)
    hashed_key = hashlib.sha256(api_key.encode()).hexdigest()

    return api_key, hashed_key


def save_api_key(tenant_id: str, api_key: str, hashed_key: str, description: str = "Local dev key"):
    """
    Save API key to secrets folder.

    Args:
        tenant_id: Tenant identifier
        api_key: Plaintext API key
        hashed_key: SHA256 hash of API key
        description: Key description
    """
    # Create secrets directory
    secrets_dir = Path.home() / ".cloudact-secrets" / tenant_id
    secrets_dir.mkdir(parents=True, exist_ok=True)

    # Save metadata
    metadata = {
        "tenant_id": tenant_id,
        "api_key_hash": hashed_key,
        "description": description,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "permissions": ["pipelines:run", "pipelines:read"]
    }

    metadata_file = secrets_dir / "api_key_metadata.json"
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)

    # Save plaintext key (WARNING: Keep this secure!)
    key_file = secrets_dir / "api_key.txt"
    with open(key_file, 'w') as f:
        f.write(api_key)

    # Set restrictive permissions
    key_file.chmod(0o600)

    return metadata_file, key_file


if __name__ == "__main__":
    import sys

    tenant_id = sys.argv[1] if len(sys.argv) > 1 else "acme1281"
    description = sys.argv[2] if len(sys.argv) > 2 else "Local development API key"

    print(f"Generating API key for tenant: {tenant_id}")

    # Generate key
    api_key, hashed_key = generate_api_key(tenant_id)

    # Save to secrets folder
    metadata_file, key_file = save_api_key(tenant_id, api_key, hashed_key, description)

    print(f"\n✅ API Key Generated Successfully!")
    print(f"\nTenant ID: {tenant_id}")
    print(f"API Key: {api_key}")
    print(f"Hashed Key: {hashed_key}")
    print(f"\n📁 Files created:")
    print(f"  - {metadata_file}")
    print(f"  - {key_file}")
    print(f"\n⚠️  IMPORTANT: Save the API key now - it won't be shown again!")
    print(f"\nTo use this key, set it in your .env file:")
    print(f"  ACME1281_API_KEY={api_key}")
