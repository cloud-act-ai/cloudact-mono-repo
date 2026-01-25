---
name: encryption-decryption-flow
enabled: true
event: all
pattern: (encrypt|decrypt|kms|credential.*secret)
action: warn
---

**KMS:** Store via API (8000) → Decrypt in Pipeline (8001). Use existing `kms_encryption.py`.

See: `02-api-service/src/core/security/kms_encryption.py`
