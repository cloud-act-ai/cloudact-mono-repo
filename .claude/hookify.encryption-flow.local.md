---
name: encryption-decryption-flow
enabled: true
event: all
pattern: (encrypt|decrypt|kms|credential.*secret|api.?key.*stor|secure.*storage)
action: warn
---

**Encryption/Decryption Flow - Use Existing KMS**

This project uses GCP KMS for all credential encryption. DO NOT create custom encryption.

**Setup (already configured):**
```
02-api-service/src/core/security/kms_encryption.py
  - encrypt_value(plaintext) -> bytes
  - decrypt_value(ciphertext) -> str
  - Config: KMS_KEY_NAME env var
```

**Store Credentials (integration setup):**
```
POST /integrations/{org_slug}/{provider}/setup
  -> KMSStoreIntegrationProcessor (kms_store.py)
  -> encrypt_value(credential)
  -> INSERT INTO org_integration_credentials WHERE org_slug = @org_slug
```

**Retrieve Credentials (pipeline execution):**
```
Pipeline runs
  -> decrypt_credentials(org_slug, provider) from kms_decrypt.py
  -> SELECT encrypted_credential WHERE org_slug = @org_slug
  -> decrypt_value(encrypted_bytes)
  -> Use in API call
```

**Org Isolation:** Shared KMS key, data isolated by `org_slug` column in BigQuery.

**Files:**
- `02-api-service/src/core/security/kms_encryption.py` - Core KMS functions
- `02-api-service/src/core/processors/integrations/kms_store.py` - Store credentials
- `03-data-pipeline-service/src/core/security/kms_decryption.py` - Retrieve credentials
