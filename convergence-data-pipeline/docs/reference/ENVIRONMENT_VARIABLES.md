# Environment Variables Reference

Complete reference for all environment variables supported by the Convergence Data Pipeline.

## Table of Contents

- [GCP Configuration](#gcp-configuration)
- [Application Configuration](#application-configuration)
- [API Configuration](#api-configuration)
- [Security Configuration](#security-configuration)
- [Rate Limiting](#rate-limiting)
- [Observability](#observability)
- [BigQuery Configuration](#bigquery-configuration)
- [Polars Configuration](#polars-configuration)
- [Data Quality](#data-quality)
- [Metadata Logging](#metadata-logging)
- [Pipeline Parallel Processing](#pipeline-parallel-processing)
- [File Paths](#file-paths)
- [Usage Examples](#usage-examples)

---

## GCP Configuration

Configuration for Google Cloud Platform integration.

### GOOGLE_APPLICATION_CREDENTIALS

**Type:** `string` (file path)
**Required:** Yes
**Default:** None
**Description:** Path to Google Cloud service account JSON key file.

**Example:**
```bash
GOOGLE_APPLICATION_CREDENTIALS=/Users/username/.gcp/service-account.json
```

**Notes:**
- This is required for BigQuery authentication
- Must point to a valid service account JSON file
- The service account needs BigQuery permissions

---

### GCP_PROJECT_ID

**Type:** `string`
**Required:** Yes
**Default:** None
**Description:** Google Cloud Project ID where BigQuery datasets are located.

**Example:**
```bash
GCP_PROJECT_ID=my-project-123456
```

---

### BIGQUERY_LOCATION

**Type:** `string`
**Required:** No
**Default:** `US`
**Description:** BigQuery dataset location/region.

**Example:**
```bash
BIGQUERY_LOCATION=US
# or
BIGQUERY_LOCATION=EU
# or
BIGQUERY_LOCATION=us-central1
```

**Notes:**
- Common values: `US`, `EU`, or specific regions like `us-central1`
- Must match the location of your BigQuery datasets

---

## Application Configuration

General application settings.

### APP_NAME

**Type:** `string`
**Required:** No
**Default:** `convergence-data-pipeline`
**Description:** Application name used in logs and metrics.

**Example:**
```bash
APP_NAME=convergence-data-pipeline
```

---

### APP_VERSION

**Type:** `string`
**Required:** No
**Default:** `1.0.0`
**Description:** Application version string.

**Example:**
```bash
APP_VERSION=1.0.0
```

---

### ENVIRONMENT

**Type:** `string`
**Required:** No
**Default:** `development`
**Allowed Values:** `development`, `staging`, `production`
**Description:** Environment the application is running in.

**Example:**
```bash
ENVIRONMENT=development
# or
ENVIRONMENT=staging
# or
ENVIRONMENT=production
```

**Notes:**
- Affects logging behavior and default settings
- Production environment enables stricter security defaults

---

### DEBUG

**Type:** `boolean`
**Required:** No
**Default:** `false`
**Description:** Enable debug mode with verbose logging.

**Example:**
```bash
DEBUG=true
```

**Notes:**
- Set to `true` only in development
- Increases log verbosity

---

### LOG_LEVEL

**Type:** `string`
**Required:** No
**Default:** `INFO`
**Allowed Values:** `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
**Description:** Logging level for the application.

**Example:**
```bash
LOG_LEVEL=INFO
# or for more verbose logging
LOG_LEVEL=DEBUG
```

---

## API Configuration

Settings for the FastAPI application server.

### API_HOST

**Type:** `string`
**Required:** No
**Default:** `0.0.0.0`
**Description:** Host address to bind the API server.

**Example:**
```bash
API_HOST=0.0.0.0
# or for local only
API_HOST=127.0.0.1
```

---

### API_PORT

**Type:** `integer`
**Required:** No
**Default:** `8080`
**Range:** `1024-65535`
**Description:** Port number for the API server.

**Example:**
```bash
API_PORT=8080
```

---

### API_WORKERS

**Type:** `integer`
**Required:** No
**Default:** `4`
**Range:** `1-16`
**Description:** Number of Uvicorn worker processes.

**Example:**
```bash
API_WORKERS=4
```

**Notes:**
- For production, set to `(2 * CPU_CORES) + 1`
- More workers = better concurrency but higher memory usage

---

### API_RELOAD

**Type:** `boolean`
**Required:** No
**Default:** `false`
**Description:** Enable auto-reload on code changes (development only).

**Example:**
```bash
API_RELOAD=true
```

**Notes:**
- Only use in development
- Should always be `false` in production

---

### CORS_ORIGINS

**Type:** `string` (comma-separated list)
**Required:** No
**Default:** `http://localhost:3000,http://localhost:8080`
**Description:** Allowed CORS origins for API requests.

**Example:**
```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:8080,https://app.example.com
```

---

### CORS_ALLOW_CREDENTIALS

**Type:** `boolean`
**Required:** No
**Default:** `true`
**Description:** Allow credentials in CORS requests.

**Example:**
```bash
CORS_ALLOW_CREDENTIALS=true
```

---

### CORS_ALLOW_METHODS

**Type:** `string`
**Required:** No
**Default:** `*`
**Description:** Allowed HTTP methods for CORS requests.

**Example:**
```bash
CORS_ALLOW_METHODS=*
# or specific methods
CORS_ALLOW_METHODS=GET,POST,PUT,DELETE
```

---

### CORS_ALLOW_HEADERS

**Type:** `string`
**Required:** No
**Default:** `*`
**Description:** Allowed headers for CORS requests.

**Example:**
```bash
CORS_ALLOW_HEADERS=*
# or specific headers
CORS_ALLOW_HEADERS=Content-Type,Authorization,X-API-Key
```

---

## Security Configuration

Authentication and security settings.

### DISABLE_AUTH

**Type:** `boolean`
**Required:** No
**Default:** `true`
**Description:** Disable API key authentication (for development only).

**Example:**
```bash
DISABLE_AUTH=true
```

**Notes:**
- Should be `false` in production
- When enabled, all requests use the default tenant

---

### DEFAULT_TENANT_ID

**Type:** `string`
**Required:** No
**Default:** `acme1281`
**Description:** Default tenant ID when authentication is disabled.

**Example:**
```bash
DEFAULT_TENANT_ID=acme1281
```

**Notes:**
- Only used when `DISABLE_AUTH=true`
- Useful for local development and testing

---

### SECRETS_BASE_PATH

**Type:** `string` (directory path)
**Required:** No
**Default:** `~/.cloudact-secrets`
**Description:** Base directory for tenant secrets and API key metadata.

**Example:**
```bash
SECRETS_BASE_PATH=~/.cloudact-secrets
# or absolute path
SECRETS_BASE_PATH=/opt/cloudact/secrets
```

**Notes:**
- Supports `~` expansion for home directory
- Used for local file-based API key lookup (development fallback)

---

### API_KEY_HASH_ALGORITHM

**Type:** `string`
**Required:** No
**Default:** `HS256`
**Description:** Hashing algorithm for API keys.

**Example:**
```bash
API_KEY_HASH_ALGORITHM=HS256
```

---

### API_KEY_SECRET_KEY

**Type:** `string`
**Required:** No
**Default:** `change-this-in-production-to-a-secure-random-key`
**Description:** Secret key for API key hashing.

**Example:**
```bash
API_KEY_SECRET_KEY=your-super-secret-random-key-here-change-in-production
```

**Notes:**
- **MUST** be changed in production
- Use a long, random string
- Keep this value secret

---

## Rate Limiting

Request rate limiting configuration.

### RATE_LIMIT_REQUESTS_PER_MINUTE

**Type:** `integer`
**Required:** No
**Default:** `100`
**Range:** `≥1`
**Description:** Maximum number of requests allowed per minute per client.

**Example:**
```bash
RATE_LIMIT_REQUESTS_PER_MINUTE=100
```

---

### RATE_LIMIT_REQUESTS_PER_HOUR

**Type:** `integer`
**Required:** No
**Default:** `1000`
**Range:** `≥1`
**Description:** Maximum number of requests allowed per hour per client.

**Example:**
```bash
RATE_LIMIT_REQUESTS_PER_HOUR=1000
```

---

### RATE_LIMIT_PIPELINE_CONCURRENCY

**Type:** `integer`
**Required:** No
**Default:** `5`
**Range:** `1-50`
**Description:** Maximum number of concurrent pipeline executions.

**Example:**
```bash
RATE_LIMIT_PIPELINE_CONCURRENCY=5
```

**Notes:**
- Higher values allow more concurrent pipelines
- Consider BigQuery quota limits

---

## Observability

Tracing and metrics configuration.

### ENABLE_TRACING

**Type:** `boolean`
**Required:** No
**Default:** `true`
**Description:** Enable distributed tracing with OpenTelemetry.

**Example:**
```bash
ENABLE_TRACING=true
```

---

### ENABLE_METRICS

**Type:** `boolean`
**Required:** No
**Default:** `true`
**Description:** Enable metrics collection.

**Example:**
```bash
ENABLE_METRICS=true
```

---

### OTEL_SERVICE_NAME

**Type:** `string`
**Required:** No
**Default:** `convergence-api`
**Description:** Service name for OpenTelemetry tracing.

**Example:**
```bash
OTEL_SERVICE_NAME=convergence-api
```

---

### OTEL_EXPORTER_OTLP_ENDPOINT

**Type:** `string` (URL)
**Required:** No
**Default:** `None`
**Description:** OpenTelemetry collector endpoint URL.

**Example:**
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
# or for Jaeger
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
```

**Notes:**
- Only set if using an OTLP collector
- Leave unset to disable exporting

---

## BigQuery Configuration

BigQuery client configuration.

### BQ_MAX_RESULTS_PER_PAGE

**Type:** `integer`
**Required:** No
**Default:** `10000`
**Range:** `100-100000`
**Description:** Maximum number of rows to fetch per page.

**Example:**
```bash
BQ_MAX_RESULTS_PER_PAGE=10000
```

---

### BQ_QUERY_TIMEOUT_SECONDS

**Type:** `integer`
**Required:** No
**Default:** `300`
**Range:** `≥10`
**Description:** Query timeout in seconds.

**Example:**
```bash
BQ_QUERY_TIMEOUT_SECONDS=300
```

**Notes:**
- Longer timeout for complex queries
- Consider BigQuery slot limits

---

### BQ_MAX_RETRY_ATTEMPTS

**Type:** `integer`
**Required:** No
**Default:** `3`
**Range:** `1-10`
**Description:** Maximum number of retry attempts for failed queries.

**Example:**
```bash
BQ_MAX_RETRY_ATTEMPTS=3
```

---

## Polars Configuration

Polars DataFrame processing settings.

### POLARS_MAX_THREADS

**Type:** `integer`
**Required:** No
**Default:** `8`
**Range:** `1-64`
**Description:** Maximum number of threads for Polars operations.

**Example:**
```bash
POLARS_MAX_THREADS=8
```

**Notes:**
- Set based on available CPU cores
- More threads = faster processing but higher CPU usage

---

### POLARS_STREAMING_CHUNK_SIZE

**Type:** `integer`
**Required:** No
**Default:** `100000`
**Range:** `≥1000`
**Description:** Chunk size for streaming operations.

**Example:**
```bash
POLARS_STREAMING_CHUNK_SIZE=100000
```

**Notes:**
- Larger chunks = better performance but higher memory usage
- Smaller chunks = lower memory but more overhead

---

## Data Quality

Data quality validation settings.

### DQ_FAIL_ON_ERROR

**Type:** `boolean`
**Required:** No
**Default:** `false`
**Description:** Fail pipeline execution if data quality checks fail.

**Example:**
```bash
DQ_FAIL_ON_ERROR=false
```

**Notes:**
- `true` = pipeline fails on DQ errors
- `false` = pipeline continues with warnings

---

### DQ_STORE_RESULTS_IN_BQ

**Type:** `boolean`
**Required:** No
**Default:** `true`
**Description:** Store data quality results in BigQuery.

**Example:**
```bash
DQ_STORE_RESULTS_IN_BQ=true
```

**Notes:**
- Enables historical DQ tracking
- Results stored in `{tenant_id}_metadata.dq_results`

---

## Metadata Logging

Metadata logging and tracking configuration.

### METADATA_LOG_BATCH_SIZE

**Type:** `integer`
**Required:** No
**Default:** `100`
**Range:** `1-10000`
**Description:** Number of log entries to batch before flushing to BigQuery.

**Example:**
```bash
METADATA_LOG_BATCH_SIZE=100
```

---

### METADATA_LOG_FLUSH_INTERVAL_SECONDS

**Type:** `integer`
**Required:** No
**Default:** `5`
**Range:** `1-60`
**Description:** Maximum time to wait before flushing logs (seconds).

**Example:**
```bash
METADATA_LOG_FLUSH_INTERVAL_SECONDS=5
```

**Notes:**
- Logs are flushed when batch size OR interval is reached
- Lower values = more real-time but higher write frequency

---

### METADATA_LOG_MAX_RETRIES

**Type:** `integer`
**Required:** No
**Default:** `3`
**Range:** `1-10`
**Description:** Maximum retry attempts for failed log writes.

**Example:**
```bash
METADATA_LOG_MAX_RETRIES=3
```

---

### METADATA_LOG_WORKERS

**Type:** `integer`
**Required:** No
**Default:** `5`
**Range:** `1-20`
**Description:** Number of background workers for concurrent log flushing.

**Example:**
```bash
METADATA_LOG_WORKERS=5
```

**Notes:**
- More workers = better concurrency for high-throughput logging
- Each worker handles one flush operation at a time

---

### METADATA_LOG_QUEUE_SIZE

**Type:** `integer`
**Required:** No
**Default:** `1000`
**Range:** `100-10000`
**Description:** Maximum queue size for buffered logs (backpressure when full).

**Example:**
```bash
METADATA_LOG_QUEUE_SIZE=1000
```

**Notes:**
- When queue is full, logging operations will block
- Larger queue = more memory but less backpressure

---

## Pipeline Parallel Processing

Pipeline execution parallelism settings.

### PIPELINE_MAX_PARALLEL_STEPS

**Type:** `integer`
**Required:** No
**Default:** `10`
**Range:** `1-100`
**Description:** Maximum number of steps to execute in parallel per level.

**Example:**
```bash
PIPELINE_MAX_PARALLEL_STEPS=10
```

**Notes:**
- Steps at the same dependency level can run in parallel
- Limited by this setting to prevent resource exhaustion

---

### PIPELINE_PARTITION_BATCH_SIZE

**Type:** `integer`
**Required:** No
**Default:** `10`
**Range:** `1-100`
**Description:** Number of partitions to process in parallel.

**Example:**
```bash
PIPELINE_PARTITION_BATCH_SIZE=10
```

**Notes:**
- For partition-aware pipelines
- Higher values = faster but more concurrent BigQuery jobs

---

## File Paths

Configuration file and directory paths.

### CONFIGS_BASE_PATH

**Type:** `string` (directory path)
**Required:** No
**Default:** `./configs`
**Description:** Base directory for all configuration files.

**Example:**
```bash
CONFIGS_BASE_PATH=./configs
# or absolute path
CONFIGS_BASE_PATH=/opt/cloudact/configs
```

**Notes:**
- Contains tenant-specific configs and system configs
- Structure: `{base_path}/{tenant_id}/{provider}/{domain}/`

---

### ADMIN_METADATA_DATASET

**Type:** `string`
**Required:** No
**Default:** `metadata`
**Description:** Admin/global metadata dataset name (shared across tenants).

**Example:**
```bash
ADMIN_METADATA_DATASET=metadata
```

**Notes:**
- Used for cross-tenant metadata like API keys
- Fully qualified name: `{project_id}.{admin_metadata_dataset}`

---

### METADATA_SCHEMAS_PATH

**Type:** `string` (directory path)
**Required:** No
**Default:** `templates/customer/onboarding/schemas`
**Description:** Directory containing metadata table schema JSON definitions.

**Example:**
```bash
METADATA_SCHEMAS_PATH=templates/customer/onboarding/schemas
```

**Notes:**
- Contains schema files: `x_meta_api_keys.json`, `x_meta_pipeline_runs.json`, etc.
- Used by metadata initializer to create tables

---

### DATASET_TYPES_CONFIG

**Type:** `string` (file path)
**Required:** No
**Default:** `configs/system/dataset_types.yml`
**Description:** Path to dataset types configuration YAML file.

**Example:**
```bash
DATASET_TYPES_CONFIG=configs/system/dataset_types.yml
```

**Notes:**
- Defines available dataset types (raw, silver, gold, etc.)
- Each type has name, description, layer, and retention settings

---

## Usage Examples

### Development Environment

Minimal configuration for local development:

```bash
# .env file for development
GOOGLE_APPLICATION_CREDENTIALS=/Users/myuser/.gcp/dev-service-account.json
GCP_PROJECT_ID=my-dev-project-123456
PYTHONPATH=.

# Disable auth for local testing
DISABLE_AUTH=true
DEFAULT_TENANT_ID=acme1281

# Enable debug logging
DEBUG=true
LOG_LEVEL=DEBUG

# Enable auto-reload
API_RELOAD=true
```

---

### Staging Environment

Configuration for staging deployment:

```bash
# .env file for staging
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/staging-service-account.json
GCP_PROJECT_ID=my-staging-project
ENVIRONMENT=staging

# Enable authentication
DISABLE_AUTH=false
SECRETS_BASE_PATH=/opt/cloudact/secrets

# Production-like settings
API_WORKERS=4
LOG_LEVEL=INFO
DEBUG=false

# Observability
ENABLE_TRACING=true
ENABLE_METRICS=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
```

---

### Production Environment

Full production configuration:

```bash
# .env file for production
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/prod-service-account.json
GCP_PROJECT_ID=my-production-project
ENVIRONMENT=production
BIGQUERY_LOCATION=US

# Application
APP_NAME=convergence-data-pipeline
APP_VERSION=1.0.0
LOG_LEVEL=INFO
DEBUG=false

# API
API_HOST=0.0.0.0
API_PORT=8080
API_WORKERS=8
API_RELOAD=false

# CORS
CORS_ORIGINS=https://app.example.com,https://dashboard.example.com
CORS_ALLOW_CREDENTIALS=true

# Security - IMPORTANT!
DISABLE_AUTH=false
API_KEY_SECRET_KEY=your-super-secret-production-key-here
SECRETS_BASE_PATH=/opt/cloudact/secrets

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=1000
RATE_LIMIT_REQUESTS_PER_HOUR=50000
RATE_LIMIT_PIPELINE_CONCURRENCY=20

# Observability
ENABLE_TRACING=true
ENABLE_METRICS=true
OTEL_SERVICE_NAME=convergence-api-prod
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317

# BigQuery
BQ_MAX_RESULTS_PER_PAGE=10000
BQ_QUERY_TIMEOUT_SECONDS=600
BQ_MAX_RETRY_ATTEMPTS=5

# Polars
POLARS_MAX_THREADS=16
POLARS_STREAMING_CHUNK_SIZE=100000

# Data Quality
DQ_FAIL_ON_ERROR=true
DQ_STORE_RESULTS_IN_BQ=true

# Metadata Logging
METADATA_LOG_BATCH_SIZE=500
METADATA_LOG_FLUSH_INTERVAL_SECONDS=10
METADATA_LOG_MAX_RETRIES=5
METADATA_LOG_WORKERS=10
METADATA_LOG_QUEUE_SIZE=5000

# Pipeline Processing
PIPELINE_MAX_PARALLEL_STEPS=20
PIPELINE_PARTITION_BATCH_SIZE=20

# Paths
CONFIGS_BASE_PATH=/opt/cloudact/configs
ADMIN_METADATA_DATASET=metadata
METADATA_SCHEMAS_PATH=/opt/cloudact/templates/customer/onboarding/schemas
DATASET_TYPES_CONFIG=/opt/cloudact/configs/system/dataset_types.yml
```

---

## Environment-Specific Defaults

The application uses smart defaults based on the `ENVIRONMENT` setting:

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| `DEBUG` | `true` | `false` | `false` |
| `LOG_LEVEL` | `DEBUG` | `INFO` | `INFO` |
| `DISABLE_AUTH` | `true` | `false` | `false` |
| `API_RELOAD` | `true` | `false` | `false` |
| `DQ_FAIL_ON_ERROR` | `false` | `false` | `true` |

---

## Security Best Practices

1. **Never commit .env files** to version control
2. **Always change** `API_KEY_SECRET_KEY` in production
3. **Set** `DISABLE_AUTH=false` in production
4. **Use** service accounts with minimal required permissions
5. **Rotate** service account keys regularly
6. **Store** secrets in secure secret management systems
7. **Enable** audit logging in production

---

## Validation

The application validates all environment variables on startup:

- Type checking (string, integer, boolean)
- Range validation (min/max values)
- Pattern matching (allowed values)
- Required field checking

If validation fails, the application will:
1. Log detailed error messages
2. Indicate which variables are invalid
3. Exit with error code

---

## Troubleshooting

### Common Issues

**Issue:** `GOOGLE_APPLICATION_CREDENTIALS` not found
**Solution:** Ensure the file path exists and is readable

**Issue:** BigQuery permission errors
**Solution:** Verify service account has required roles:
- `roles/bigquery.admin` or
- `roles/bigquery.dataEditor` + `roles/bigquery.jobUser`

**Issue:** Rate limit errors
**Solution:** Increase rate limit settings or reduce concurrent requests

**Issue:** Metadata logging backpressure
**Solution:** Increase `METADATA_LOG_QUEUE_SIZE` or `METADATA_LOG_WORKERS`

---

## Related Documentation

- [Quick Start Guide](../guides/QUICK_START.md)
- [Deployment Guide](../guides/DEPLOYMENT_GUIDE.md)
- [Secrets Management](../security/README_SECRETS.md)
- [Pipeline Configuration](pipeline-configuration.md)

---

**Last Updated:** 2025-01-15
**Version:** 1.0.0
