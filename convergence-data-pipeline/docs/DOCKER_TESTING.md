# Docker Testing Guide - Convergence Data Pipeline

Complete guide for testing the Convergence Data Pipeline using Docker.

---

## Prerequisites

1. **Docker & Docker Compose** installed:
   ```bash
   docker --version
   docker-compose --version
   ```

2. **GCP Service Account Credentials**:
   - Ensure you have a valid service account JSON file
   - Update `.env` with the correct path:
     ```
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/gcp-credentials.json
     ```

3. **Environment Configuration**:
   ```bash
   # Copy example environment file
   cp .env.example .env

   # Edit .env with your GCP project details
   # Required variables:
   # - GCP_PROJECT_ID
   # - GOOGLE_APPLICATION_CREDENTIALS
   # - ADMIN_API_KEY (for bootstrap)
   ```

---

## Quick Start

### 1. Build and Start the Container

```bash
# Build the Docker image
docker-compose build

# Start the service in detached mode
docker-compose up -d

# Check logs
docker-compose logs -f convergence-api
```

### 2. Run Automated Tests

```bash
# Run the test script
./docker-test.sh
```

The test script will:
- ✅ Wait for API to be ready
- ✅ Test bootstrap endpoint
- ✅ Test tenant onboarding
- ✅ Display results

---

## Manual Testing

### Step 1: Health Check

```bash
curl http://localhost:8080/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "environment": "development"
}
```

### Step 2: Bootstrap System

**Endpoint**: `POST /admin/bootstrap`

```bash
curl -X POST http://localhost:8080/admin/bootstrap \
  -H "X-Admin-Key: admin-test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "force_recreate_dataset": false,
    "force_recreate_tables": false
  }'
```

**Expected Response**:
```json
{
  "status": "SUCCESS",
  "dataset_created": true,
  "tables_created": [
    "tenant_profiles",
    "tenant_api_keys",
    "tenant_subscriptions",
    "tenant_usage_quotas",
    "tenant_cloud_credentials",
    "tenant_pipeline_configs",
    "tenant_scheduled_pipeline_runs",
    "tenant_pipeline_execution_queue",
    "tenant_pipeline_runs",
    "tenant_step_logs",
    "tenant_dq_results"
  ],
  "total_tables": 11
}
```

### Step 3: Onboard Tenant

**Endpoint**: `POST /api/v1/tenants/onboard`

```bash
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "rama_2x333",
    "company_name": "Rama Corporation",
    "admin_email": "admin@rama.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Expected Response**:
```json
{
  "tenant_id": "rama_2x333",
  "api_key": "sk_rama_2x333_xxxxxxxxxxxx",
  "subscription_plan": "PROFESSIONAL",
  "dataset_created": true,
  "tables_created": [
    "tenant_comprehensive_view",
    "onboarding_validation_test"
  ],
  "dryrun_status": "SUCCESS",
  "message": "Tenant onboarded successfully"
}
```

**⚠️ IMPORTANT**: Save the API key - it's shown only once!

### Step 4: Verify Setup

Check if tenant comprehensive view was created:

```bash
# Execute inside container
docker-compose exec convergence-api bash

# Inside container, check BigQuery (requires bq CLI)
bq ls gac-prod-471220:tenants
bq ls gac-prod-471220:rama_2x333

# Query comprehensive view
bq query --use_legacy_sql=false \
  "SELECT * FROM \`gac-prod-471220.rama_2x333.tenant_comprehensive_view\` LIMIT 10"
```

---

## Docker Commands Reference

### Container Management

```bash
# Build image
docker-compose build

# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs -f convergence-api

# Execute shell in container
docker-compose exec convergence-api bash

# Check container status
docker-compose ps
```

### Debugging

```bash
# View real-time logs
docker-compose logs -f --tail=100 convergence-api

# Check container health
docker inspect convergence-data-pipeline | grep -A 10 Health

# View environment variables
docker-compose exec convergence-api env | grep -E 'GCP|API|TENANT'

# Check if API is accessible
docker-compose exec convergence-api curl http://localhost:8080/health
```

### Clean Up

```bash
# Stop and remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Complete cleanup
docker-compose down -v --rmi all
docker system prune -a
```

---

## Troubleshooting

### Issue 1: Container Won't Start

**Symptoms**:
```
Error response from daemon: driver failed programming external connectivity
```

**Solution**:
```bash
# Check if port 8080 is already in use
lsof -i :8080

# Kill process using port 8080
kill -9 <PID>

# Or change port in docker-compose.yml
ports:
  - "8090:8080"
```

### Issue 2: GCP Credentials Not Found

**Symptoms**:
```
Could not automatically determine credentials
```

**Solution**:
```bash
# Check if credentials file exists
ls -la $(grep GOOGLE_APPLICATION_CREDENTIALS .env | cut -d'=' -f2)

# Update docker-compose.yml volume mount
volumes:
  - /full/path/to/gcp-credentials.json:/app/gcp-credentials.json:ro

# Set environment variable in container
environment:
  - GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-credentials.json
```

### Issue 3: Permission Denied Errors

**Symptoms**:
```
PermissionError: [Errno 13] Permission denied: '/app/logs'
```

**Solution**:
```bash
# Rebuild with correct permissions
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Issue 4: BigQuery Permission Denied

**Symptoms**:
```
403 User does not have bigquery.datasets.create permission
```

**Solution**:
```bash
# Grant required permissions to service account:
# - bigquery.dataEditor
# - bigquery.jobUser
# - bigquery.user

# Or use a different service account with proper permissions
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GCP_PROJECT_ID` | GCP Project ID | `gac-prod-471220` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON | `/app/gcp-credentials.json` |
| `ADMIN_API_KEY` | Admin key for bootstrap | `admin-test-key-123` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BIGQUERY_LOCATION` | `US` | BigQuery dataset location |
| `API_PORT` | `8080` | API server port |
| `LOG_LEVEL` | `INFO` | Logging level |
| `DISABLE_AUTH` | `true` | Disable API key auth (dev only) |

---

## Testing Different Scenarios

### Test 1: Force Recreate (Clean Start)

```bash
curl -X POST http://localhost:8080/admin/bootstrap \
  -H "X-Admin-Key: admin-test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "force_recreate_dataset": true,
    "force_recreate_tables": true
  }'
```

### Test 2: Multiple Tenants

```bash
# Onboard tenant 1
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "ACME Corporation",
    "admin_email": "admin@acme.com",
    "subscription_plan": "STARTER"
  }'

# Onboard tenant 2
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "globex_inc",
    "company_name": "Globex Inc",
    "admin_email": "admin@globex.com",
    "subscription_plan": "SCALE"
  }'
```

### Test 3: Different Subscription Plans

```bash
# STARTER plan
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "starter_test", "company_name": "Starter Co", "admin_email": "admin@starter.com", "subscription_plan": "STARTER"}'

# PROFESSIONAL plan
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "pro_test", "company_name": "Pro Co", "admin_email": "admin@pro.com", "subscription_plan": "PROFESSIONAL"}'

# SCALE plan
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "scale_test", "company_name": "Scale Co", "admin_email": "admin@scale.com", "subscription_plan": "SCALE"}'
```

---

## Performance Testing

### Load Test with Apache Bench

```bash
# Test health endpoint
ab -n 1000 -c 10 http://localhost:8080/health

# Test bootstrap endpoint (requires auth header)
ab -n 10 -c 1 \
  -H "X-Admin-Key: admin-test-key-123" \
  -H "Content-Type: application/json" \
  -p bootstrap-payload.json \
  http://localhost:8080/admin/bootstrap
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Docker Test

on: [push, pull_request]

jobs:
  docker-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Build Docker image
        run: docker-compose build

      - name: Start services
        run: docker-compose up -d

      - name: Wait for API
        run: |
          timeout 60 bash -c 'until curl -f http://localhost:8080/health; do sleep 2; done'

      - name: Run tests
        run: ./docker-test.sh

      - name: Stop services
        run: docker-compose down
```

---

## Best Practices

1. **Always use `.env` file**: Never hardcode credentials in docker-compose.yml
2. **Use volumes for logs**: Mount `/app/logs` to persist logs
3. **Health checks**: Always wait for health check before testing
4. **Clean up**: Use `docker-compose down -v` to remove volumes
5. **Monitor logs**: Use `docker-compose logs -f` during development
6. **Security**: Never commit `.env` or credentials to version control

---

## Next Steps

After successful Docker testing:

1. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy convergence-api \
     --source . \
     --region us-central1 \
     --allow-unauthenticated
   ```

2. **Set up Cloud Scheduler**:
   - Create scheduler jobs pointing to Cloud Run URL
   - Configure authentication

3. **Monitor Production**:
   - Set up Cloud Monitoring dashboards
   - Configure alerting policies

---

**Version**: 1.0.0
**Last Updated**: 2025-11-18
**Status**: Ready for Docker Testing
