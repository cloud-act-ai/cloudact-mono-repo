#!/usr/bin/env python3
"""
KMS Infrastructure Setup Script

Sets up Cloud KMS keyring and encryption keys for all environments.
Supports: local (dev), staging, and production.

Usage:
    python3 setup_kms_infrastructure.py local
    python3 setup_kms_infrastructure.py staging
    python3 setup_kms_infrastructure.py production
"""

import sys
import os
from google.cloud import kms
from google.api_core import exceptions


def setup_kms(environment: str):
    """Set up KMS keyring and encryption key for the specified environment."""

    # Environment configurations
    configs = {
        "local": {
            "project_id": "gac-prod-471220",
            "keyring_name": "convergence-keyring-dev",
            "service_account": "cloudact-common@gac-prod-471220.iam.gserviceaccount.com"
        },
        "staging": {
            "project_id": "gac-stage-471220",
            "keyring_name": "convergence-keyring-stage",
            "service_account": "convergence-api@gac-stage-471220.iam.gserviceaccount.com"
        },
        "production": {
            "project_id": "gac-prod-471220",
            "keyring_name": "convergence-keyring-prod",
            "service_account": "convergence-api@gac-prod-471220.iam.gserviceaccount.com"
        }
    }

    if environment not in configs:
        print(f"❌ Error: Environment must be one of: {', '.join(configs.keys())}")
        sys.exit(1)

    config = configs[environment]
    project_id = config["project_id"]
    keyring_name = config["keyring_name"]
    service_account = config["service_account"]
    location = "us-central1"
    key_name = "api-key-encryption"

    print(f"\n{'='*80}")
    print(f"🔐 Setting up Cloud KMS for {environment.upper()} environment")
    print(f"{'='*80}\n")
    print(f"  Project ID:       {project_id}")
    print(f"  Location:         {location}")
    print(f"  Keyring:          {keyring_name}")
    print(f"  Key:              {key_name}")
    print(f"  Service Account:  {service_account}")
    print()

    # Set credentials if running locally
    if environment == "local":
        creds_path = "/home/user/cloudact-backend-systems/credentials/gcp-service-account.json"
        if os.path.exists(creds_path):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path
            print(f"✓ Using credentials: {creds_path}\n")

    # Initialize KMS client
    client = kms.KeyManagementServiceClient()

    # Step 1: Create keyring
    print("[1/3] Creating KMS keyring...")
    parent = f"projects/{project_id}/locations/{location}"
    keyring_path = f"{parent}/keyRings/{keyring_name}"

    try:
        keyring = client.create_key_ring(
            request={
                "parent": parent,
                "key_ring_id": keyring_name,
            }
        )
        print(f"      ✅ Keyring created: {keyring.name}")
    except exceptions.AlreadyExists:
        print(f"      ℹ️  Keyring already exists: {keyring_path}")
    except Exception as e:
        print(f"      ❌ Failed to create keyring: {e}")
        sys.exit(1)

    # Step 2: Create encryption key
    print("\n[2/3] Creating encryption key...")
    key_path = f"{keyring_path}/cryptoKeys/{key_name}"

    try:
        key = client.create_crypto_key(
            request={
                "parent": keyring_path,
                "crypto_key_id": key_name,
                "crypto_key": {
                    "purpose": kms.CryptoKey.CryptoKeyPurpose.ENCRYPT_DECRYPT,
                    "version_template": {
                        "algorithm": kms.CryptoKeyVersion.CryptoKeyVersionAlgorithm.GOOGLE_SYMMETRIC_ENCRYPTION,
                    },
                },
            }
        )
        print(f"      ✅ Encryption key created: {key.name}")
    except exceptions.AlreadyExists:
        print(f"      ℹ️  Encryption key already exists: {key_path}")
    except Exception as e:
        print(f"      ❌ Failed to create encryption key: {e}")
        sys.exit(1)

    # Step 3: Grant IAM permissions
    print("\n[3/3] Granting KMS permissions to service account...")

    try:
        # Get current IAM policy
        policy = client.get_iam_policy(request={"resource": key_path})

        # Add the service account as encrypter/decrypter
        member = f"serviceAccount:{service_account}"
        role = "roles/cloudkms.cryptoKeyEncrypterDecrypter"

        # Check if binding already exists
        binding_exists = False
        for binding in policy.bindings:
            if binding.role == role:
                if member in binding.members:
                    binding_exists = True
                    print(f"      ℹ️  IAM binding already exists for {service_account}")
                else:
                    binding.members.append(member)
                    print(f"      ✅ Added {service_account} to existing role binding")
                break

        if not binding_exists:
            # Create new binding
            from google.iam.v1 import policy_pb2
            binding = policy_pb2.Binding(
                role=role,
                members=[member]
            )
            policy.bindings.append(binding)
            print(f"      ✅ Created new role binding for {service_account}")

        # Update the policy
        if not binding_exists or len([b for b in policy.bindings if b.role == role and member not in b.members]) > 0:
            client.set_iam_policy(request={"resource": key_path, "policy": policy})
            print(f"      ✅ IAM policy updated successfully")

    except Exception as e:
        print(f"      ⚠️  Warning: Could not update IAM policy: {e}")
        print(f"      💡 You may need to grant permissions manually:")
        print(f"         gcloud kms keys add-iam-policy-binding {key_name} \\")
        print(f"           --location={location} \\")
        print(f"           --keyring={keyring_name} \\")
        print(f"           --member='serviceAccount:{service_account}' \\")
        print(f"           --role='roles/cloudkms.cryptoKeyEncrypterDecrypter'")

    # Summary
    print(f"\n{'='*80}")
    print(f"✅ KMS setup complete for {environment.upper()} environment!")
    print(f"{'='*80}\n")
    print(f"  Key Ring: {keyring_path}")
    print(f"  Key:      {key_path}")
    print()
    print("Environment variables to use:")
    print(f"  export GCP_KMS_KEY_NAME='{key_path}'")
    print("  # OR")
    print(f"  export KMS_PROJECT_ID='{project_id}'")
    print(f"  export KMS_LOCATION='{location}'")
    print(f"  export KMS_KEYRING='{keyring_name}'")
    print(f"  export KMS_KEY='{key_name}'")
    print()

    return {
        "project_id": project_id,
        "location": location,
        "keyring": keyring_name,
        "key": key_name,
        "key_path": key_path
    }


def test_kms_encryption(key_path: str):
    """Test KMS encryption/decryption."""
    print(f"\n{'='*80}")
    print("🧪 Testing KMS encryption/decryption...")
    print(f"{'='*80}\n")

    try:
        client = kms.KeyManagementServiceClient()

        # Test data
        plaintext = b"test_api_key_12345"
        print(f"  Plaintext: {plaintext.decode()}")

        # Encrypt
        print("\n  [1/2] Encrypting...")
        encrypt_response = client.encrypt(
            request={"name": key_path, "plaintext": plaintext}
        )
        ciphertext = encrypt_response.ciphertext
        print(f"        ✅ Encrypted successfully ({len(ciphertext)} bytes)")

        # Decrypt
        print("\n  [2/2] Decrypting...")
        decrypt_response = client.decrypt(
            request={"name": key_path, "ciphertext": ciphertext}
        )
        decrypted = decrypt_response.plaintext
        print(f"        ✅ Decrypted successfully: {decrypted.decode()}")

        # Verify
        if plaintext == decrypted:
            print(f"\n  ✅ Encryption/decryption test PASSED!")
            return True
        else:
            print(f"\n  ❌ Encryption/decryption test FAILED!")
            return False

    except Exception as e:
        print(f"\n  ❌ Test failed: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 setup_kms_infrastructure.py [local|staging|production]")
        sys.exit(1)

    environment = sys.argv[1].lower()

    # Setup KMS
    result = setup_kms(environment)

    # Test encryption/decryption
    if test_kms_encryption(result["key_path"]):
        print(f"\n{'='*80}")
        print(f"🎉 SUCCESS! KMS is fully configured and tested for {environment.upper()}")
        print(f"{'='*80}\n")
        sys.exit(0)
    else:
        print(f"\n{'='*80}")
        print(f"⚠️  WARNING: KMS configured but encryption test failed")
        print(f"{'='*80}\n")
        sys.exit(1)
