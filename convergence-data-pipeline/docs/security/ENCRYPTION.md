# Encryption and Security Guide

## Overview

The Convergence Data Pipeline implements enterprise-grade security with Google Cloud KMS encryption, row-level security, and multi-layered data protection. This guide covers encryption architecture, implementation, and best practices.

---

## Security Architecture

### Multi-Layer Security Model

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: TRANSPORT ENCRYPTION (TLS 1.3)                    │
│  All API requests encrypted in transit                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: API KEY AUTHENTICATION                             │
│  - SHA256 hash for fast lookup                              │
│  - KMS encryption for storage                               │
│  - Expiration and revocation support                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: DATA ENCRYPTION AT REST (KMS)                     │
│  - API keys encrypted with KMS                               │
│  - Cloud credentials encrypted with KMS                      │
│  - Automatic key rotation every 90 days                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: ROW-LEVEL SECURITY (RLS)                          │
│  - Tenant isolation enforced at database level              │
│  - No cross-tenant data access                              │
│  - Audit logs for compliance                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Google Cloud KMS Integration

### KMS Key Setup

**1. Create KMS Keyring**:
```bash
# Create keyring in us-central1
gcloud kms keyrings create convergence-customer-keys \
  --location=us-central1 \
  --project=gac-prod-471220
```

**2. Create Encryption Keys**:
```bash
# API Key encryption key
gcloud kms keys create api-key-encryption \
  --location=us-central1 \
  --keyring=convergence-customer-keys \
  --purpose=encryption \
  --rotation-period=90d \
  --next-rotation-time=$(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ) \
  --project=gac-prod-471220

# Cloud credentials encryption key
gcloud kms keys create credentials-encryption \
  --location=us-central1 \
  --keyring=convergence-customer-keys \
  --purpose=encryption \
  --rotation-period=90d \
  --next-rotation-time=$(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ) \
  --project=gac-prod-471220
```

**3. Grant Service Account Access**:
```bash
# Grant encrypt/decrypt permissions
gcloud kms keys add-iam-policy-binding api-key-encryption \
  --location=us-central1 \
  --keyring=convergence-customer-keys \
  --member=serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter \
  --project=gac-prod-471220

gcloud kms keys add-iam-policy-binding credentials-encryption \
  --location=us-central1 \
  --keyring=convergence-customer-keys \
  --member=serviceAccount:convergence-api@gac-prod-471220.iam.gserviceaccount.com \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter \
  --project=gac-prod-471220
```

---

## API Key Encryption

### Encryption Flow

```python
from google.cloud import kms_v1
import hashlib
import secrets

class APIKeyManager:
    """Secure API key management with KMS encryption"""

    def __init__(self, project_id: str, location: str, keyring: str, key_name: str):
        self.project_id = project_id
        self.location = location
        self.keyring = keyring
        self.key_name = key_name

        # Construct key path
        self.key_path = (
            f"projects/{project_id}/locations/{location}/"
            f"keyRings/{keyring}/cryptoKeys/{key_name}"
        )

        # Initialize KMS client
        self.kms_client = kms_v1.KeyManagementServiceClient()

    def generate_api_key(self, tenant_id: str) -> str:
        """Generate a secure API key"""
        # Generate 16-character random string
        random_suffix = secrets.token_urlsafe(16)[:16]

        # Format: {tenant_id}_api_{random}
        api_key = f"{tenant_id}_api_{random_suffix}"

        return api_key

    def encrypt_api_key(self, api_key: str) -> bytes:
        """Encrypt API key using Google Cloud KMS"""
        # Convert to bytes
        plaintext = api_key.encode('utf-8')

        # Encrypt with KMS
        encrypt_request = {
            "name": self.key_path,
            "plaintext": plaintext
        }

        response = self.kms_client.encrypt(request=encrypt_request)

        # Return encrypted ciphertext
        return response.ciphertext

    def decrypt_api_key(self, encrypted_api_key: bytes) -> str:
        """Decrypt API key using Google Cloud KMS"""
        # Decrypt with KMS
        decrypt_request = {
            "name": self.key_path,
            "ciphertext": encrypted_api_key
        }

        response = self.kms_client.decrypt(request=decrypt_request)

        # Return plaintext
        return response.plaintext.decode('utf-8')

    def hash_api_key(self, api_key: str) -> str:
        """Generate SHA256 hash for fast lookup"""
        return hashlib.sha256(api_key.encode()).hexdigest()

    def create_secure_api_key(self, tenant_id: str) -> dict:
        """
        Create a secure API key with encryption and hashing

        Returns:
            {
                "api_key": "plaintext_key_shown_once",
                "api_key_hash": "sha256_hash_for_lookup",
                "encrypted_api_key": b"kms_encrypted_bytes"
            }
        """
        # Generate API key
        api_key = self.generate_api_key(tenant_id)

        # Hash for fast lookup
        api_key_hash = self.hash_api_key(api_key)

        # Encrypt for secure storage
        encrypted_api_key = self.encrypt_api_key(api_key)

        return {
            "api_key": api_key,  # Show only once!
            "api_key_hash": api_key_hash,
            "encrypted_api_key": encrypted_api_key
        }


# Usage
key_manager = APIKeyManager(
    project_id="gac-prod-471220",
    location="us-central1",
    keyring="convergence-customer-keys",
    key_name="api-key-encryption"
)

# Create secure API key
result = key_manager.create_secure_api_key("acmeinc_23xv2")

print(f"API Key (show once): {result['api_key']}")
print(f"Hash (for lookup): {result['api_key_hash']}")
print(f"Encrypted (for storage): {result['encrypted_api_key'][:20]}...")
```

### API Key Storage

**BigQuery Table**: `tenants_metadata.tenant_api_keys`

```sql
CREATE TABLE tenants_metadata.tenant_api_keys (
  api_key_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  user_id STRING,                        -- User who created the key
  api_key_hash STRING NOT NULL,          -- SHA256 hash (for fast lookup)
  encrypted_api_key BYTES NOT NULL,      -- KMS-encrypted bytes
  is_active BOOL NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  created_by_user_id STRING              -- Audit: who created this key
);
```

**Security Guarantees**:
- ✅ Plaintext API key never stored in database
- ✅ SHA256 hash used for authentication (fast, secure)
- ✅ KMS encryption for storage (can be recovered if needed)
- ✅ Automatic key rotation with KMS

---

## Cloud Credentials Encryption

### Supported Providers

1. **GCP Service Accounts**
2. **AWS Access Keys**
3. **Azure Service Principals**
4. **OpenAI API Keys**

### Encryption Implementation

```python
from google.cloud import kms_v1
import json

class CredentialsManager:
    """Secure cloud credentials management with KMS encryption"""

    def __init__(self, project_id: str, location: str, keyring: str, key_name: str):
        self.project_id = project_id
        self.location = location
        self.keyring = keyring
        self.key_name = key_name

        self.key_path = (
            f"projects/{project_id}/locations/{location}/"
            f"keyRings/{keyring}/cryptoKeys/{key_name}"
        )

        self.kms_client = kms_v1.KeyManagementServiceClient()

    def encrypt_credentials(self, credentials: dict) -> bytes:
        """
        Encrypt cloud provider credentials

        Args:
            credentials: Dictionary containing credentials
                - GCP: service account JSON
                - AWS: {access_key_id, secret_access_key}
                - Azure: {tenant_id, client_id, client_secret}
                - OpenAI: {api_key}

        Returns:
            Encrypted bytes
        """
        # Convert credentials to JSON string
        credentials_json = json.dumps(credentials)

        # Encrypt with KMS
        encrypt_request = {
            "name": self.key_path,
            "plaintext": credentials_json.encode('utf-8')
        }

        response = self.kms_client.encrypt(request=encrypt_request)

        return response.ciphertext

    def decrypt_credentials(self, encrypted_credentials: bytes) -> dict:
        """
        Decrypt cloud provider credentials

        Returns:
            Dictionary containing credentials
        """
        # Decrypt with KMS
        decrypt_request = {
            "name": self.key_path,
            "ciphertext": encrypted_credentials
        }

        response = self.kms_client.decrypt(request=decrypt_request)

        # Parse JSON
        credentials_json = response.plaintext.decode('utf-8')
        return json.loads(credentials_json)

    def validate_gcp_credentials(self, credentials: dict) -> bool:
        """Validate GCP service account credentials"""
        from google.oauth2 import service_account

        try:
            creds = service_account.Credentials.from_service_account_info(credentials)
            # Test authentication by listing projects
            from google.cloud import resourcemanager_v3
            client = resourcemanager_v3.ProjectsClient(credentials=creds)
            # If no exception, credentials are valid
            return True
        except Exception as e:
            print(f"GCP credentials validation failed: {e}")
            return False

    def validate_aws_credentials(self, credentials: dict) -> bool:
        """Validate AWS access key credentials"""
        import boto3
        from botocore.exceptions import ClientError

        try:
            client = boto3.client(
                'sts',
                aws_access_key_id=credentials['aws_access_key_id'],
                aws_secret_access_key=credentials['aws_secret_access_key']
            )
            # Test authentication by getting caller identity
            client.get_caller_identity()
            return True
        except ClientError as e:
            print(f"AWS credentials validation failed: {e}")
            return False


# Usage
creds_manager = CredentialsManager(
    project_id="gac-prod-471220",
    location="us-central1",
    keyring="convergence-customer-keys",
    key_name="credentials-encryption"
)

# Encrypt GCP service account
gcp_credentials = {
    "type": "service_account",
    "project_id": "customer-project-123",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "client_email": "service-account@customer-project.iam.gserviceaccount.com"
}

encrypted = creds_manager.encrypt_credentials(gcp_credentials)
print(f"Encrypted credentials: {encrypted[:20]}...")

# Decrypt when needed
decrypted = creds_manager.decrypt_credentials(encrypted)
print(f"Decrypted project_id: {decrypted['project_id']}")
```

---

## Row-Level Security (RLS)

### Tenant Isolation Policy

**Purpose**: Ensure tenants can only access their own data, and users can only access data within their tenant

**Implementation**:
```sql
-- Apply row-level security on tenant_api_keys
CREATE ROW ACCESS POLICY tenant_isolation_api_keys
ON tenants_metadata.tenant_api_keys
GRANT TO ('user:*')
FILTER USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenants_metadata.tenants
    WHERE contact_email = SESSION_USER()
  )
);

-- Apply row-level security on tenant_credentials
CREATE ROW ACCESS POLICY tenant_isolation_credentials
ON tenants_metadata.tenant_credentials
GRANT TO ('user:*')
FILTER USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenants_metadata.tenants
    WHERE contact_email = SESSION_USER()
  )
);

-- Apply row-level security on tenant_usage
CREATE ROW ACCESS POLICY tenant_isolation_usage
ON tenants_metadata.tenant_usage
GRANT TO ('user:*')
FILTER USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenants_metadata.tenants
    WHERE contact_email = SESSION_USER()
  )
);

-- Apply row-level security on users table
CREATE ROW ACCESS POLICY tenant_isolation_users
ON tenants_metadata.users
GRANT TO ('user:*')
FILTER USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenants_metadata.tenants
    WHERE contact_email = SESSION_USER()
  )
);
```

**How it Works**:
1. User authenticates with API key
2. System identifies user's email from API key
3. BigQuery automatically filters queries to show only rows where `tenant_id` matches user's tenant
4. No application code changes needed - enforced at database level

---

## Environment Variables for Encryption

Add these to your `.env` file:

```bash
# KMS Configuration
KMS_PROJECT_ID=gac-prod-471220
KMS_LOCATION=us-central1
KMS_KEYRING=convergence-customer-keys
KMS_API_KEY_NAME=api-key-encryption
KMS_CREDENTIALS_KEY_NAME=credentials-encryption

# Tenants Dataset
TENANTS_DATASET_ID=tenants_metadata
```

**Application Configuration**:
```python
# src/app/config.py
from pydantic import BaseSettings

class Settings(BaseSettings):
    # KMS Configuration
    kms_project_id: str = "gac-prod-471220"
    kms_location: str = "us-central1"
    kms_keyring: str = "convergence-customer-keys"
    kms_api_key_name: str = "api-key-encryption"
    kms_credentials_key_name: str = "credentials-encryption"

    # Tenants Dataset
    tenants_dataset_id: str = "tenants_metadata"

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## Security Best Practices

### 1. API Key Management

**Do's**:
- ✅ Rotate API keys every 90 days
- ✅ Use separate keys for dev/staging/prod
- ✅ Set expiration dates on all keys
- ✅ Revoke unused keys immediately
- ✅ Monitor key usage with `last_used_at` field

**Don'ts**:
- ❌ Never commit API keys to version control
- ❌ Never log plaintext API keys
- ❌ Never share API keys via email/chat
- ❌ Never use production keys in development

### 2. KMS Key Management

**Do's**:
- ✅ Enable automatic key rotation (90 days)
- ✅ Use separate keys for different data types
- ✅ Restrict KMS permissions to service accounts only
- ✅ Monitor KMS usage with Cloud Audit Logs
- ✅ Regular key rotation audits

**Don'ts**:
- ❌ Never disable key rotation
- ❌ Never share KMS keys across projects
- ❌ Never grant KMS admin access to applications

### 3. Credentials Management

**Do's**:
- ✅ Validate credentials before storing
- ✅ Encrypt immediately after receiving
- ✅ Use time-limited credentials when possible
- ✅ Audit credential access
- ✅ Rotate cloud provider credentials regularly

**Don'ts**:
- ❌ Never store plaintext credentials
- ❌ Never log credential values
- ❌ Never use root/admin credentials

### 4. Data Access Control

**Do's**:
- ✅ Enforce row-level security on all tenant tables
- ✅ Enforce user-level access controls within tenants
- ✅ Use least-privilege IAM roles
- ✅ Log all data access to audit_logs table with user_id
- ✅ Regular security audits
- ✅ Monitor for anomalous access patterns

**Don'ts**:
- ❌ Never grant broad BigQuery permissions
- ❌ Never disable audit logging
- ❌ Never skip authentication checks

---

## Compliance and Auditing

### Audit Logs

All security-related events are logged to `tenants_metadata.tenant_audit_logs`:

```sql
-- Query recent API key usage by user
SELECT
  tenant_id,
  user_id,
  event_type,
  actor_id,
  created_at
FROM tenants_metadata.tenant_audit_logs
WHERE event_type LIKE 'api_key.%'
  AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY created_at DESC;

-- Query failed authentication attempts per user
SELECT
  tenant_id,
  user_id,
  ip_address,
  user_agent,
  COUNT(*) as failed_attempts
FROM tenants_metadata.tenant_audit_logs
WHERE event_type = 'authentication.failed'
  AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
GROUP BY tenant_id, user_id, ip_address, user_agent
HAVING failed_attempts > 5;
```

### Compliance Standards

**Supported Standards**:
- **SOC 2 Type II**: Audit logs, encryption, access controls
- **GDPR**: Data encryption, right to deletion, audit trail
- **HIPAA**: Encryption at rest and in transit, access logging
- **PCI DSS**: Encryption, key rotation, access controls

---

## Monitoring and Alerts

### Key Metrics to Monitor

1. **KMS Usage**:
   - Encryption/decryption request rate
   - Failed KMS operations
   - Key rotation events

2. **API Key Security**:
   - Failed authentication attempts
   - Expired key usage attempts
   - Revoked key access attempts

3. **Data Access**:
   - Cross-tenant access attempts
   - Unusual query patterns
   - Large data exports

### Alerting Rules

```yaml
# Alert on failed KMS operations
- alert: KMS_Operation_Failed
  condition: kms_operation_errors > 10 in 5m
  severity: critical
  notification: email + slack

# Alert on failed authentication
- alert: Failed_Authentication_Spike
  condition: failed_auth_count > 100 in 1m
  severity: warning
  notification: email

# Alert on key expiration
- alert: API_Key_Expiring_Soon
  condition: days_until_expiration <= 7
  severity: warning
  notification: email
```

---

## Disaster Recovery

### Key Backup and Recovery

**KMS Keys**:
- Google Cloud KMS automatically manages key backups
- Keys are replicated across multiple regions
- Cannot export KMS keys (by design)
- Use Cloud HSM for additional control

**Encrypted Data Backup**:
```bash
# Backup encrypted API keys
bq extract --destination_format=NEWLINE_DELIMITED_JSON \
  tenants_metadata.tenant_api_keys \
  gs://convergence-backup/api-keys/backup-$(date +%Y%m%d).json

# Backup encrypted credentials
bq extract --destination_format=NEWLINE_DELIMITED_JSON \
  tenants_metadata.tenant_credentials \
  gs://convergence-backup/credentials/backup-$(date +%Y%m%d).json

# Backup users data
bq extract --destination_format=NEWLINE_DELIMITED_JSON \
  tenants_metadata.users \
  gs://convergence-backup/users/backup-$(date +%Y%m%d).json
```

**Recovery Process**:
1. KMS keys remain available (managed by Google)
2. Restore encrypted data from backups
3. Decrypt on-demand using KMS
4. Validate data integrity

---

## Related Documentation

- [Tenant Management Architecture](../architecture/TENANT_MANAGEMENT.md)
- [Tenant API Reference](../api/TENANT_API_REFERENCE.md)
- [API Reference](../reference/API_REFERENCE.md)
- [Environment Variables](../reference/ENVIRONMENT_VARIABLES.md)
- [Migration Guide](../guides/MIGRATION_GUIDE.md)
- [Multi-Tenancy Design](../implementation/MULTI_TENANCY_DESIGN.md)

---

**Version**: 2.0.0
**Last Updated**: 2025-11-17
**Security Contact**: security@convergence-pipeline.com
**Breaking Changes**: v2.0.0 includes user-level access controls and audit logging
