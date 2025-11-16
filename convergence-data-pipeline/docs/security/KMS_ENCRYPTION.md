# KMS Encryption Utilities

Google Cloud KMS encryption/decryption utilities for securing sensitive data in the convergence data pipeline.

## Overview

This module provides simple encryption and decryption functions using Google Cloud KMS (Key Management Service). It's designed for encrypting sensitive values like API keys, credentials, and other secrets before storing them in databases or configuration files.

## Configuration

### Environment Variables

You can configure KMS in two ways:

**Option 1: Full Key Name (Recommended)**
```bash
export GCP_KMS_KEY_NAME="projects/my-project/locations/us-central1/keyRings/convergence-keyring/cryptoKeys/convergence-encryption-key"
```

**Option 2: Individual Components**
```bash
export KMS_PROJECT_ID="my-project"
export KMS_LOCATION="us-central1"
export KMS_KEYRING="convergence-keyring"
export KMS_KEY="convergence-encryption-key"
```

### Required GCP Setup

1. **Create KMS Keyring** (if not exists):
   ```bash
   gcloud kms keyrings create convergence-keyring \
     --location us-central1
   ```

2. **Create Encryption Key**:
   ```bash
   gcloud kms keys create convergence-encryption-key \
     --location us-central1 \
     --keyring convergence-keyring \
     --purpose encryption
   ```

3. **Grant Permissions**:
   ```bash
   # For service account
   gcloud kms keys add-iam-policy-binding convergence-encryption-key \
     --location us-central1 \
     --keyring convergence-keyring \
     --member serviceAccount:YOUR_SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com \
     --role roles/cloudkms.cryptoKeyEncrypterDecrypter
   ```

## Usage

### Basic Encryption/Decryption

```python
from src.core.security import encrypt_value, decrypt_value

# Encrypt a sensitive value
api_key = "sk-1234567890abcdef"
encrypted = encrypt_value(api_key)
# encrypted is bytes, store in database or file

# Decrypt when needed
decrypted = decrypt_value(encrypted)
assert decrypted == api_key
```

### Base64 Encoding (for text storage)

```python
from src.core.security.kms_encryption import encrypt_value_base64, decrypt_value_base64

# Encrypt and encode as base64 string
encrypted_b64 = encrypt_value_base64("my-secret-api-key")
# encrypted_b64 is a string, can be stored in JSON or text fields

# Decrypt from base64
decrypted = decrypt_value_base64(encrypted_b64)
```

### Example: Encrypting API Keys

```python
import json
from src.core.security import encrypt_value_base64, decrypt_value_base64

# Store encrypted API keys
config = {
    "openai_api_key": encrypt_value_base64("sk-..."),
    "google_api_key": encrypt_value_base64("AIza...")
}

with open("encrypted_config.json", "w") as f:
    json.dump(config, f)

# Later, decrypt when using
with open("encrypted_config.json", "r") as f:
    config = json.load(f)

openai_key = decrypt_value_base64(config["openai_api_key"])
google_key = decrypt_value_base64(config["google_api_key"])
```

## Functions

### `encrypt_value(plaintext: str) -> bytes`
Encrypts a plaintext string using GCP KMS.

**Args:**
- `plaintext`: The string to encrypt

**Returns:**
- Encrypted ciphertext as bytes

**Raises:**
- `ValueError`: If plaintext is empty or KMS configuration is invalid
- `Exception`: If KMS encryption fails

### `decrypt_value(ciphertext: bytes) -> str`
Decrypts ciphertext using GCP KMS.

**Args:**
- `ciphertext`: The encrypted bytes to decrypt

**Returns:**
- Decrypted plaintext as string

**Raises:**
- `ValueError`: If ciphertext is empty or KMS configuration is invalid
- `Exception`: If KMS decryption fails

### `encrypt_value_base64(plaintext: str) -> str`
Encrypts and returns as base64-encoded string for text storage.

**Args:**
- `plaintext`: The string to encrypt

**Returns:**
- Base64-encoded encrypted ciphertext

### `decrypt_value_base64(ciphertext_b64: str) -> str`
Decrypts from base64-encoded string.

**Args:**
- `ciphertext_b64`: Base64-encoded encrypted ciphertext

**Returns:**
- Decrypted plaintext as string

## Security Best Practices

1. **Never commit unencrypted secrets** to version control
2. **Use KMS for sensitive data** like API keys, database passwords, credentials
3. **Rotate keys regularly** - GCP KMS supports automatic key rotation
4. **Use IAM permissions** to restrict who can encrypt/decrypt
5. **Audit KMS usage** - Enable Cloud Audit Logs for KMS operations
6. **Use envelope encryption** for large data (KMS has 64KB limit per operation)

## Error Handling

```python
from google.api_core.exceptions import GoogleAPIError
from src.core.security import encrypt_value, decrypt_value

try:
    encrypted = encrypt_value("my-secret")
    decrypted = decrypt_value(encrypted)
except ValueError as e:
    print(f"Configuration error: {e}")
except GoogleAPIError as e:
    print(f"KMS API error: {e}")
```

## Testing

For local development/testing without real KMS:

```python
# Set environment variable to skip KMS in tests
export DISABLE_KMS_ENCRYPTION=true

# Or use mock in tests
from unittest.mock import patch

with patch('src.core.security.kms_encryption._get_kms_client'):
    # Your test code here
    pass
```

## Limitations

- **Size Limit**: GCP KMS has a 64KB limit for encrypt/decrypt operations
- **Cost**: KMS charges per 10,000 operations - monitor usage
- **Latency**: Network call to KMS adds ~100-200ms per operation
- **Quotas**: Default quota is 600 requests/minute per key

For large data or high-frequency operations, consider envelope encryption or caching decrypted values in memory.
