# Test Suite

Multi-environment test suite for the Convergence Data Pipeline.

## Environment Support

Tests can run against three environments:
- **local**: localhost:8080 (default)
- **staging**: Cloud Run staging deployment
- **production**: Cloud Run production deployment

## Running Tests

### Local Environment (Default)

```bash
cd convergence-data-pipeline
python tests/test_e2e_pipeline.py
python tests/test_onboarding_force_recreate.py
```

### Staging Environment

```bash
cd convergence-data-pipeline
TEST_ENV=staging python tests/test_e2e_pipeline.py
TEST_ENV=staging python tests/test_onboarding_force_recreate.py
```

### Production Environment

```bash
cd convergence-data-pipeline
TEST_ENV=production python tests/test_e2e_pipeline.py
TEST_ENV=production python tests/test_onboarding_force_recreate.py
```

## Test Files

### test_e2e_pipeline.py
End-to-end pipeline execution test. Validates:
- Health check
- Pipeline triggering
- Pipeline execution monitoring
- Metadata logging

Usage:
```bash
# Single pipeline test (default)
python tests/test_e2e_pipeline.py 1

# Parallel pipeline test
python tests/test_e2e_pipeline.py 2

# Against staging
TEST_ENV=staging python tests/test_e2e_pipeline.py 1
```

### test_onboarding_force_recreate.py
Customer onboarding test with force recreation options. Tests:
- Customer onboarding
- BigQuery dataset creation
- Metadata table creation
- Sample pipeline execution

Usage:
```bash
# Against local
python tests/test_onboarding_force_recreate.py

# Against staging
TEST_ENV=staging python tests/test_onboarding_force_recreate.py
```

### Other Test Files

- `test_multiple_pipelines.py`: Tests multiple pipeline execution
- `test_concurrency.py`: Tests concurrent pipeline execution
- `test_config_validation.py`: Tests pipeline configuration validation
- `test_sql_params.py`: Tests SQL parameterization
- `test_bq_duplicate_detection.py`: Tests BigQuery duplicate detection

## Test Configuration

The `test_config.py` module provides environment-aware configuration:

```python
from test_config import get_api_base_url, get_current_environment

# Get API URL for current environment
api_url = get_api_base_url()  # Reads from TEST_ENV

# Get current environment name
env = get_current_environment()  # Returns: "local", "staging", or "production"

# Get specific environment URL
staging_url = get_api_base_url("staging")
```

## Environment URLs

| Environment | URL |
|-------------|-----|
| Local | http://localhost:8080 |
| Staging | https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app |
| Production | https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app |

## Test Logs

Some tests generate logs in `tests/logs/` directory with timestamps:
```
tests/logs/onboarding_20251115_100000/
├── acmeinc_23xv2_onboarding.json
├── acmeinc_23xv2_pipeline.json
└── ...
```

## Best Practices

1. **Always test on local/staging first** before running against production
2. **Use descriptive tenant IDs** following the pattern: `{company}_{env}_{id}`
3. **Monitor logs** in Cloud Run console when testing against deployed environments
4. **Clean up test data** after running tests in production

## Troubleshooting

### Connection Refused (Local)
```
Error: API health check failed: [Errno 61] Connection refused
```
**Solution**: Start the local server first:
```bash
python -m uvicorn src.app.main:app --reload
```

### Invalid Environment
```
ValueError: Invalid environment 'prod'. Must be one of: local, staging, production
```
**Solution**: Use correct environment name (production, not prod):
```bash
TEST_ENV=production python tests/test_e2e_pipeline.py
```

### 404 Not Found (Cloud Run)
If tests fail with 404 against staging/production, verify:
1. Service is deployed and running in Cloud Run console
2. URL matches the environment URL in `test_config.py`
3. Endpoint path is correct in test file
