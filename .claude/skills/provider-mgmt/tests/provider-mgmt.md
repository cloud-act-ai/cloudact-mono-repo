# Provider Management - Test Plan

## Provider Validation Tests

Provider lifecycle validation via registry checks, processor tests, and pipeline execution:
- **Registry:** `03-data-pipeline-service/configs/system/providers.yml`
- **Processors:** `03-data-pipeline-service/src/core/processors/`
- **Integration Router:** `02-api-service/src/app/routers/integrations.py`
- **Run (API):** `cd 02-api-service && python -m pytest tests/ -v`
- **Run (Pipeline):** `cd 03-data-pipeline-service && python -m pytest tests/ -v`

### Test Matrix (30 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | providers.yml is valid YAML | Config | Parses without errors |
| 2 | All providers have required fields (type, credential_type, display_name) | Config | No missing required fields |
| 3 | Provider types are valid (cloud, genai/llm, saas) | Config | Only valid types present |
| 4 | All genai providers have api_key credential_type | Config | Consistent credential types |
| 5 | All cloud providers have appropriate credential_type | Config | service_account, access_key, iam_role |
| 6 | All providers have validation_endpoint defined | Config | Non-empty URL path per provider |
| 7 | All providers have rate_limit configuration | Config | requests_per_minute > 0 |
| 8 | OpenAI processor exists and is registered | Processor | Class in PROCESSOR_REGISTRY |
| 9 | Anthropic processor exists and is registered | Processor | Class in PROCESSOR_REGISTRY |
| 10 | GCP processor exists and is registered | Processor | Class in PROCESSOR_REGISTRY |
| 11 | Gemini processor exists and is registered | Processor | Class in PROCESSOR_REGISTRY |
| 12 | DeepSeek processor exists and is registered | Processor | Class in PROCESSOR_REGISTRY |
| 13 | All processors implement ProcessorProtocol | Processor | extract_usage + calculate_costs methods |
| 14 | PROCESSOR_REGISTRY matches providers.yml | Cross-check | Every active provider has a processor |
| 15 | OpenAI pipeline config exists | Pipeline | YAML config at configs/openai/ |
| 16 | Anthropic pipeline config exists | Pipeline | YAML config at configs/anthropic/ |
| 17 | GCP pipeline config exists | Pipeline | YAML config at configs/gcp/ |
| 18 | All pipeline configs have valid pipeline_id template | Pipeline | Contains {org_slug} placeholder |
| 19 | Credential encryption roundtrip (encrypt + decrypt) | Security | Decrypted value matches original |
| 20 | Credential validation rejects invalid API key | Security | 400 error with "Invalid API key" |
| 21 | Credential stored as encrypted blob (not plaintext) | Security | encrypted_value != plaintext |
| 22 | Integration setup endpoint exists for all providers | API | POST /integrations/{org}/{provider}/setup returns 200 |
| 23 | Duplicate credential deactivates previous | API | Old credential is_active = false |
| 24 | Provider not in registry returns 404 | API | "Provider not found" error |
| 25 | GenAI pricing seed CSV exists per genai provider | Seed Data | CSV file at configs/genai/seed/{provider}/ |
| 26 | Pricing CSV has required columns | Seed Data | model_id, input_price, output_price, effective_date |
| 27 | Pipeline run writes x_* lineage fields | Pipeline | x_org_slug, x_pipeline_id, x_run_id present in output |
| 28 | Pipeline output normalizes to FOCUS 1.3 | Pipeline | Rows written to cost_data_standard_1_3 |
| 29 | Provider quota enforced per plan | Quota | Starter (3), Professional (6), Scale (10) providers max |
| 30 | Frontend integration page loads per provider | E2E | Integration setup page renders without errors |

## Backend Tests

### Pipeline Service Tests

```bash
cd 03-data-pipeline-service
source venv/bin/activate

# All processor and pipeline tests
python -m pytest tests/ -v

# Processor-specific tests
python -m pytest tests/test_processors/ -v

# Config validation tests
python -m pytest tests/test_configs/ -v

# Pipeline execution tests (may require BigQuery access)
python -m pytest tests/test_pipelines/ -v -m "not integration"
```

| Domain | File | Tests |
|--------|------|-------|
| Processors | `tests/test_processors/test_openai.py` | OpenAI usage extraction, cost calculation |
| Processors | `tests/test_processors/test_anthropic.py` | Anthropic usage extraction, cost calculation |
| Processors | `tests/test_processors/test_gcp.py` | GCP billing ETL, data transformation |
| Processors | `tests/test_processors/test_gemini.py` | Gemini usage extraction, cost calculation |
| Processors | `tests/test_processors/test_deepseek.py` | DeepSeek usage extraction, cost calculation |
| Protocol | `tests/test_processors/test_protocol.py` | ProcessorProtocol interface compliance |
| Configs | `tests/test_configs/test_providers.py` | providers.yml schema validation |
| Configs | `tests/test_configs/test_pipelines.py` | Pipeline config schema validation |
| Pipelines | `tests/test_pipelines/test_execution.py` | Pipeline state machine, step execution |
| Pipelines | `tests/test_pipelines/test_lineage.py` | x_* field presence in outputs |

### API Service Tests

```bash
cd 02-api-service
source venv/bin/activate

# Integration setup tests
python -m pytest tests/test_integrations.py -v

# Credential encryption tests
python -m pytest tests/test_encryption.py -v

# All API tests
python -m pytest tests/ -v
```

| Domain | File | Tests |
|--------|------|-------|
| Integrations | `tests/test_integrations.py` | Setup endpoint, validation, credential storage |
| Encryption | `tests/test_encryption.py` | KMS encrypt/decrypt, key rotation |
| Validation | `tests/test_validation.py` | Provider validation, credential format checks |

### Frontend Tests

```bash
cd 01-fronted-system

# Unit tests (integration components)
npm run test

# E2E integration page tests
npx playwright test tests/e2e/settings.spec.ts
```

| Domain | File | Tests |
|--------|------|-------|
| Integration Pages | `tests/e2e/settings.spec.ts` | Integration setup page load, form submission |

## Registry Validation Tests

| Test | Command | Expected |
|------|---------|----------|
| Parse providers.yml | `python -c "import yaml; yaml.safe_load(open('configs/system/providers.yml'))"` | No parse errors |
| Count providers | `python -c "import yaml; d=yaml.safe_load(open('configs/system/providers.yml')); print(len(d))"` | 11 providers (5 genai + 4 cloud + 2 saas) |
| Validate required fields | Custom test script | All providers have type, credential_type, display_name |
| Cross-check with PROCESSOR_REGISTRY | Import and compare | Every active provider has registered processor |

## Credential Security Tests

| Test | Command | Expected |
|------|---------|----------|
| KMS encryption works | `python -m pytest tests/test_encryption.py::test_encrypt_decrypt -v` | Roundtrip succeeds |
| Invalid key rejected | `curl -X POST /integrations/{org}/openai/setup -d '{"api_key":"invalid"}'` | 400 with validation error |
| Credential stored encrypted | Query org_integration_credentials | encrypted_value is not plaintext |
| Old credential deactivated | Setup same provider twice | First credential is_active = false |
| No plaintext in logs | Search logs for API key pattern | Zero matches |

## Pipeline Execution Tests

| Test | Command | Expected |
|------|---------|----------|
| OpenAI pipeline runs | `POST /pipelines/run/{org}/openai/genai/usage` | 200 with pipeline_run_id |
| GCP pipeline runs | `POST /pipelines/run/{org}/gcp/cloud/billing` | 200 with pipeline_run_id |
| x_* fields present | Query output table | All 7 x_* columns populated |
| FOCUS 1.3 output | Query cost_data_standard_1_3 | Rows with FOCUS schema |
| Idempotent re-run | Run same date twice | Same result, no duplicates |
| Missing credential | Run pipeline without setup | 400 "No active credential" |

## Seed Data Tests

| Test | Command | Expected |
|------|---------|----------|
| OpenAI pricing CSV | `ls configs/genai/seed/openai/pricing.csv` | File exists |
| Anthropic pricing CSV | `ls configs/genai/seed/anthropic/pricing.csv` | File exists |
| Gemini pricing CSV | `ls configs/genai/seed/gemini/pricing.csv` | File exists |
| DeepSeek pricing CSV | `ls configs/genai/seed/deepseek/pricing.csv` | File exists |
| CSV has required columns | `head -1 configs/genai/seed/openai/pricing.csv` | model_id, input_price, output_price columns |
| Pricing data loads | Seed pipeline execution | Rows in genai_payg_pricing table |

## Integration Tests (End-to-End)

| Test | Steps | Expected |
|------|-------|----------|
| Full provider setup | 1. POST /integrations/{org}/openai/setup 2. Verify credential stored 3. Run pipeline 4. Check data | Data in cost_data_standard_1_3 |
| Provider quota limit | 1. Setup 3 providers (Starter plan) 2. Attempt 4th provider | 403 "Provider limit reached" |
| Credential rotation | 1. Setup provider 2. Re-setup with new key 3. Run pipeline | Pipeline uses new key |
| Provider removal | 1. DELETE /integrations/{org}/openai 2. Attempt pipeline run | 400 "No active credential" |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Registry completeness | Open providers.yml, count entries | 11 providers (5 genai + 4 cloud + 2 saas) |
| All processors registered | Import PROCESSOR_REGISTRY, print keys | Matches providers.yml active entries |
| Credential encrypts correctly | Setup provider, query BQ for encrypted_value | Not plaintext, starts with encrypted prefix |
| Pipeline creates FOCUS data | Run pipeline, query cost_data_standard_1_3 | Rows with correct provider column |
| Provider quota enforced | Try exceeding plan limit | 403 error returned |
| Frontend integration page loads | Navigate to /integrations/{type}/{provider} | Setup form displayed |
| Pricing seed data loads | Run seed pipeline, query genai_payg_pricing | Pricing rows per model |
| New provider 8-step workflow | Follow all 8 steps for test provider | Provider fully operational |
| KMS key per environment | Check stage vs prod keyring | Different keyrings, no sharing |
| Rate limiting works | Send rapid requests to validation endpoint | 429 after threshold |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Registry validation | 100% -- all providers have required fields |
| Processor registration | 100% -- every active provider has a processor |
| Credential encryption | 100% -- no plaintext credentials stored |
| Pipeline configs exist | 100% -- every provider has pipeline YAML |
| Seed data completeness | 100% -- all genai providers have pricing CSV |
| x_* lineage fields | 100% -- all pipeline outputs have 7 x_* fields |
| FOCUS 1.3 compliance | 100% -- all cost data normalizes to FOCUS schema |
| Provider quota enforcement | 100% -- plan limits enforced per org |
| Integration endpoint coverage | 100% -- POST /integrations/{org}/{provider}/setup for all providers |
| Cross-service consistency | providers.yml, PROCESSOR_REGISTRY, pipeline configs, frontend pages all aligned |

## Known Limitations

1. **Credential validation requires network**: Provider API validation endpoints require external network access. Tests in CI must mock provider APIs or skip validation.
2. **KMS requires GCP credentials**: Encrypt/decrypt operations require GCP service account with `roles/cloudkms.cryptoKeyEncrypterDecrypter`. CI tests mock the KMS client.
3. **BigQuery integration tests**: Pipeline execution tests that write to BigQuery require an active GCP project. Use `-m "not integration"` to skip in local/CI environments.
4. **SaaS provider variation**: SaaS providers (Canva, Slack, ChatGPT Plus) have inconsistent APIs. ChatGPT Plus uses manual entry with no API validation.
5. **Pricing data currency**: All seed pricing data is in USD. Multi-currency conversion happens at the FOCUS 1.3 normalization layer.
6. **Provider API changes**: External provider APIs may change without notice (e.g., endpoint deprecation, new auth requirements). Processor updates may lag behind provider changes.
7. **Cloud provider billing exports**: GCP/AWS/Azure billing data extraction depends on customer-configured billing exports. Pipeline will fail if exports are not set up.
8. **Rate limit testing**: Actual rate limit testing requires sustained request volume. Unit tests mock the rate limiter; true validation requires integration testing.
