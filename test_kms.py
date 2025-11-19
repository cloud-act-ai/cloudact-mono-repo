#!/usr/bin/env python3
"""Quick test script for KMS encryption/decryption"""
import os
import sys

# Set credentials
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/home/user/cloudact-backend-systems/credentials/gcp-service-account.json'

# Add the project to path
sys.path.insert(0, '/home/user/cloudact-backend-systems/convergence-data-pipeline')

def test_kms_encryption():
    """Test KMS encryption and decryption"""
    from src.core.security.kms_encryption import encrypt_value, decrypt_value

    print("=" * 60)
    print("KMS ENCRYPTION TEST")
    print("=" * 60)

    # Test data
    test_secret = "test_api_key_12345_secret_data"
    print(f"\n1. Original secret: {test_secret}")

    # Encrypt
    print("\n2. Encrypting with KMS...")
    try:
        encrypted = encrypt_value(test_secret)
        print(f"   ✓ Encrypted successfully! (bytes length: {len(encrypted)})")
    except Exception as e:
        print(f"   ✗ Encryption failed: {e}")
        return False

    # Decrypt
    print("\n3. Decrypting with KMS...")
    try:
        decrypted = decrypt_value(encrypted)
        print(f"   ✓ Decrypted successfully: {decrypted}")
    except Exception as e:
        print(f"   ✗ Decryption failed: {e}")
        return False

    # Verify
    print("\n4. Verification...")
    if decrypted == test_secret:
        print("   ✓ SUCCESS! Decrypted value matches original")
        return True
    else:
        print("   ✗ FAILED! Decrypted value does not match")
        return False

if __name__ == "__main__":
    # Set KMS config
    os.environ['KMS_PROJECT_ID'] = 'gac-prod-471220'
    os.environ['KMS_LOCATION'] = 'us-central1'
    os.environ['KMS_KEYRING'] = 'convergence-keyring-prod'
    os.environ['KMS_KEY'] = 'api-key-encryption'

    success = test_kms_encryption()

    print("\n" + "=" * 60)
    if success:
        print("KMS INTEGRATION TEST: PASSED ✓")
    else:
        print("KMS INTEGRATION TEST: FAILED ✗")
    print("=" * 60)

    sys.exit(0 if success else 1)
