# Integration Setup - Test Plan

## API Tests (Port 8000)

Integration CRUD, credential encryption, and provider validation.

### Test Matrix (28 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Setup GCP integration (Service Account JSON) | API | 200, credential encrypted and stored |
| 2 | Setup AWS integration (IAM Role ARN) | API | 200, IAM role ARN stored |
| 3 | Setup AWS integration (Access Key + Secret) | API | 200, both keys encrypted |
| 4 | Setup Azure integration (Service Principal JSON) | API | 200, credential encrypted |
| 5 | Setup OCI integration (API Key) | API | 200, API key encrypted |
| 6 | Setup OpenAI integration (API key `sk-*`) | API | 200, key encrypted, validation passed |
| 7 | Setup Anthropic integration (API key `sk-ant-*`) | API | 200, key encrypted, validation passed |
| 8 | Setup Gemini integration (API key) | API | 200, key encrypted, validation passed |
| 9 | Setup DeepSeek integration (API key) | API | 200, key encrypted, validation passed |
| 10 | List all integrations for org | API | 200, array of integration metadata |
| 11 | Get specific integration metadata | API | 200, metadata without raw credential |
| 12 | Update existing credential | API | 200, new credential replaces old |
| 13 | Delete integration | API | 200, integration removed |
| 14 | Validate GCP credential (format + BQ access) | Validation | `validation_status: VALID` |
| 15 | Validate OpenAI credential (GET /models) | Validation | `validation_status: VALID` |
| 16 | Validate Anthropic credential (GET /models) | Validation | `validation_status: VALID` |
| 17 | Reject invalid API key format | Validation | `validation_status: INVALID` with error |
| 18 | Reject GCP SA JSON missing required fields | Validation | 422, lists missing fields (`type`, `project_id`, `private_key`, `client_email`) |
| 19 | Reject unknown provider | Validation | 404, provider not in registry |
| 20 | KMS encryption applied on store | Security | Encrypted blob in `org_integration_credentials`, not plaintext |
| 21 | Raw credentials never in API response | Security | GET returns metadata only, no `api_key` or `private_key` |
| 22 | Raw credentials never in logs | Security | SHA256 fingerprint (first 8 chars) logged instead |
| 23 | Runtime decryption with 5-min TTL cache | Security | Decrypted value cached, re-decrypted after TTL |
| 24 | GCP IAM role verification on setup | Validation | `roles/bigquery.dataViewer` and `roles/bigquery.jobUser` checked |
| 25 | GCP billing export table configuration | Config | `billing_export_table` path stored in metadata |
| 26 | GCP multi-billing account support | Config | Up to 10 additional billing accounts accepted |
| 27 | Rate limit configuration per provider | Config | Rate limits read from `providers.yml` |
| 28 | SaaS manual entry (Canva, Slack, ChatGPT Plus) | API | Manual entry accepted without API validation |

## Frontend Tests

### Frontend Route Matrix (10 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | `/integrations` dashboard loads | Nav | Integration overview page |
| 2 | `/integrations/cloud-providers` lists providers | Nav | GCP, AWS, Azure visible |
| 3 | `/integrations/cloud-providers/gcp` setup page | Nav | GCP SA upload form |
| 4 | `/integrations/llm` lists LLM providers | Nav | OpenAI, Anthropic, Gemini, DeepSeek |
| 5 | `/integrations/llm/openai` setup page | Nav | API key input form |
| 6 | `/integrations/llm/anthropic` setup page | Nav | API key input form |
| 7 | `/integrations/llm/gemini` setup page | Nav | API key input form |
| 8 | `/integrations/llm/deepseek` setup page | Nav | API key input form |
| 9 | `/integrations/subscriptions/[provider]` page | Nav | Subscription management form |
| 10 | Integration status indicator | UI | "Connected" / "Not configured" badge |

## Provider Registry Tests

### Registry Validation (6 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | `providers.yml` has all 11+ providers | Config | Cloud (4) + GenAI (4) + SaaS (3+) |
| 2 | Each provider has `credential_type` | Config | `api_key`, `service_account_json`, etc. |
| 3 | Each provider has `validation_endpoint` | Config | Endpoint URL for connection test |
| 4 | Each provider has `rate_limit` | Config | `requests_per_minute` defined |
| 5 | Each provider has `data_tables` | Config | Target table names listed |
| 6 | Provider key is lowercase | Config | `openai`, not `OpenAI` |

## Verification Commands

```bash
# 1. Setup OpenAI integration
curl -X POST "http://localhost:8000/api/v1/integrations/{org}/openai/setup" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"api_key": "sk-test-key-here"}'

# 2. Validate credential
curl -X POST "http://localhost:8000/api/v1/integrations/{org}/openai/validate" \
  -H "X-API-Key: $ORG_API_KEY"

# 3. List all integrations
curl -s "http://localhost:8000/api/v1/integrations/{org}" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool

# 4. Get specific integration metadata
curl -s "http://localhost:8000/api/v1/integrations/{org}/openai" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -m json.tool

# 5. Setup GCP integration
curl -X POST "http://localhost:8000/api/v1/integrations/{org}/gcp/setup" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "your-gcp-project",
    "service_account_key": "{base64_encoded_key}",
    "billing_dataset": "billing_export",
    "billing_export_table": "project.dataset.gcp_billing_export_v1_ABCDEF"
  }'

# 6. Verify no raw credentials in response
curl -s "http://localhost:8000/api/v1/integrations/{org}/openai" \
  -H "X-API-Key: $ORG_API_KEY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
assert 'api_key' not in json.dumps(data), 'RAW CREDENTIAL LEAKED!'
print('PASS: No raw credentials in response')
"

# 7. Verify provider registry
python3 -c "
import yaml
with open('03-data-pipeline-service/configs/system/providers.yml') as f:
    providers = yaml.safe_load(f)
print(f'Total providers: {len(providers)}')
for name, config in providers.items():
    print(f'  {name}: type={config.get(\"type\")}, credential={config.get(\"credential_type\")}')
"

# 8. Delete integration
curl -X DELETE "http://localhost:8000/api/v1/integrations/{org}/openai" \
  -H "X-API-Key: $ORG_API_KEY"

# 9. Check KMS encryption in BigQuery
bq query --use_legacy_sql=false \
  "SELECT credential_id, provider, validation_status, LENGTH(encrypted_credential) as blob_size FROM \`{project}.organizations.org_integration_credentials\` WHERE org_slug = '{org}'"
```

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| GCP SA JSON upload | Frontend > Cloud Providers > GCP > Upload JSON | File accepted, validation starts |
| GCP IAM role check | Upload valid SA with BQ roles | `validation_status: VALID` |
| GCP IAM role missing | Upload SA without BQ roles | `validation_status: INVALID` with role list |
| OpenAI key setup | Frontend > LLM > OpenAI > Enter key | Connection test passes, "Connected" shown |
| Invalid API key rejection | Enter garbage key > validate | Error message, `validation_status: INVALID` |
| Credential rotation | Update existing key > run pipeline | Pipeline uses new credential seamlessly |
| Cross-org isolation | Setup in Org A > list from Org B | Org B cannot see Org A credentials |
| KMS encryption verification | Check BigQuery `org_integration_credentials` | Only encrypted blob stored, not plaintext |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| CRUD API tests | 13/13 (100%) |
| Validation tests | 8/8 (100%) |
| Security tests | 4/4 (100%) -- zero raw credential exposure |
| Frontend route tests | 10/10 (100%) |
| Provider registry tests | 6/6 (100%) |
| GCP-specific tests | 3/3 (100%) |
| Cross-org credential leakage | 0 |
| Raw credentials in logs | 0 |
| Raw credentials in API responses | 0 |

## Known Limitations

1. **KMS dependency**: Encryption/decryption tests require access to GCP KMS key ring -- tests may need mock KMS in local environment
2. **Provider validation**: Connection tests require valid API keys for each provider -- use test/sandbox keys where available
3. **GCP IAM verification**: Checking IAM roles requires the SA to have `iam.serviceAccounts.getIamPolicy` permission
4. **Rate limits**: Provider rate limits are enforced at runtime -- hard to test without hitting actual provider APIs
5. **5-min TTL cache**: Runtime decryption cache TTL is not easily testable in isolation -- requires time-based testing or cache mocking
6. **SaaS providers**: Canva, Slack, ChatGPT Plus use manual entry -- no API validation endpoint available
7. **Multi-billing GCP**: Testing 10+ billing accounts requires enterprise-tier GCP setup
