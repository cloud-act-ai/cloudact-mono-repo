# /health-check - Service Health & Status

Check health status of all services across environments.

## Usage

```
/health-check [environment]              # Check specific environment
/health-check all                        # Check all environments
/health-check local                      # Check local services
```

## Actions

### Environment Health
```
/health-check test                       # Check test environment
/health-check stage                      # Check stage environment
/health-check prod                       # Check production
/health-check all                        # Check all environments
```

### Local Development
```
/health-check local                      # Check localhost services
```

### Detailed Checks
```
/health-check prod --ready               # Check readiness probes
/health-check prod --detailed            # Show all health check details
```

---

## Instructions

### Check Environment Health

**Step 1: Define service URLs**
```bash
ENV={env}
case $ENV in
  local)
    API_URL="http://localhost:8000"
    PIPELINE_URL="http://localhost:8001"
    FRONTEND_URL="http://localhost:3000"
    ;;
  test)
    API_URL="https://cloudact-api-service-test-zfq7lndpda-uc.a.run.app"
    PIPELINE_URL="https://cloudact-pipeline-service-test-zfq7lndpda-uc.a.run.app"
    FRONTEND_URL="https://cloudact-frontend-test-zfq7lndpda-uc.a.run.app"
    ;;
  stage)
    API_URL="https://cloudact-api-service-stage-zfq7lndpda-uc.a.run.app"
    PIPELINE_URL="https://cloudact-pipeline-service-stage-zfq7lndpda-uc.a.run.app"
    FRONTEND_URL="https://cloudact-stage.vercel.app"
    ;;
  prod)
    API_URL="https://api.cloudact.ai"
    PIPELINE_URL="https://pipeline.cloudact.ai"
    FRONTEND_URL="https://cloudact.ai"
    ;;
esac
```

**Step 2: Check basic health**
```bash
echo "=== $ENV Environment Health ==="
echo ""

# API Service
echo "API Service ($API_URL):"
curl -s --max-time 10 "$API_URL/health" | python3 -m json.tool 2>/dev/null || echo "  UNREACHABLE"
echo ""

# Pipeline Service
echo "Pipeline Service ($PIPELINE_URL):"
curl -s --max-time 10 "$PIPELINE_URL/health" | python3 -m json.tool 2>/dev/null || echo "  UNREACHABLE"
echo ""

# Frontend
echo "Frontend ($FRONTEND_URL):"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  Status: OK (HTTP $HTTP_CODE)"
else
  echo "  Status: ERROR (HTTP $HTTP_CODE)"
fi
```

**Step 3: Check readiness probes (detailed)**
```bash
echo ""
echo "=== Readiness Probes ==="
echo ""

echo "API Service Ready:"
curl -s --max-time 10 "$API_URL/health/ready" | python3 -m json.tool 2>/dev/null || echo "  UNREACHABLE"
echo ""

echo "Pipeline Service Ready:"
curl -s --max-time 10 "$PIPELINE_URL/health/ready" | python3 -m json.tool 2>/dev/null || echo "  UNREACHABLE"
```

---

### Check All Environments

```bash
for ENV in local test stage prod; do
  echo ""
  echo "=========================================="
  echo "  $ENV Environment"
  echo "=========================================="

  case $ENV in
    local)
      API_URL="http://localhost:8000"
      PIPELINE_URL="http://localhost:8001"
      ;;
    test)
      API_URL="https://cloudact-api-service-test-zfq7lndpda-uc.a.run.app"
      PIPELINE_URL="https://cloudact-pipeline-service-test-zfq7lndpda-uc.a.run.app"
      ;;
    stage)
      API_URL="https://cloudact-api-service-stage-zfq7lndpda-uc.a.run.app"
      PIPELINE_URL="https://cloudact-pipeline-service-stage-zfq7lndpda-uc.a.run.app"
      ;;
    prod)
      API_URL="https://api.cloudact.ai"
      PIPELINE_URL="https://pipeline.cloudact.ai"
      ;;
  esac

  # Quick health check
  API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_URL/health" 2>/dev/null || echo "000")
  PIPELINE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$PIPELINE_URL/health" 2>/dev/null || echo "000")

  if [ "$API_STATUS" = "200" ]; then
    echo "  API Service:      ✓ OK"
  else
    echo "  API Service:      ✗ ERROR ($API_STATUS)"
  fi

  if [ "$PIPELINE_STATUS" = "200" ]; then
    echo "  Pipeline Service: ✓ OK"
  else
    echo "  Pipeline Service: ✗ ERROR ($PIPELINE_STATUS)"
  fi
done
```

---

## Health Check Response Format

### Basic Health (`/health`)
```json
{
  "status": "healthy",
  "service": "api-service",
  "version": "1.0.0",
  "release": "v1.0.4",
  "release_timestamp": "2025-12-30T20:45:00Z",
  "environment": "production"
}
```

### Readiness Probe (`/health/ready`)

**API Service:**
```json
{
  "status": "ready",
  "checks": {
    "shutdown": true,
    "bigquery": true,
    "bootstrap": true,      // Meta tables exist
    "kms": true,
    "pipeline_service": true
  }
}
```

**Pipeline Service:**
```json
{
  "status": "ready",
  "checks": {
    "shutdown": true,
    "bigquery": true,
    "procedures_synced": true,  // Stored procedures exist
    "kms": true,
    "api_service": true
  }
}
```

---

## Service URLs Reference

| Environment | API Service | Pipeline Service | Frontend |
|-------------|-------------|------------------|----------|
| Local | http://localhost:8000 | http://localhost:8001 | http://localhost:3000 |
| Test | cloudact-api-service-test-*.run.app | cloudact-pipeline-service-test-*.run.app | cloudact-frontend-test-*.run.app |
| Stage | cloudact-api-service-stage-*.run.app | cloudact-pipeline-service-stage-*.run.app | cloudact-stage.vercel.app |
| Prod | api.cloudact.ai | pipeline.cloudact.ai | cloudact.ai |

---

## Health Check Meanings

| Check | Service | Meaning |
|-------|---------|---------|
| `bigquery` | Both | Can connect to BigQuery |
| `bootstrap` | API | organizations dataset and meta tables exist |
| `procedures_synced` | Pipeline | Required stored procedures exist |
| `kms` | Both | KMS encryption is available |
| `pipeline_service` | API | Can reach Pipeline service |
| `api_service` | Pipeline | Can reach API service |

---

## Troubleshooting

### Service returns 503
- Check if service is shutting down
- Verify BigQuery connectivity
- Check KMS configuration

### bootstrap: false
- Run bootstrap: `POST /api/v1/admin/bootstrap`
- Check organizations dataset exists

### procedures_synced: false
- Sync procedures: `/bigquery-ops sync-procedures {env}`
- Check procedure SQL files are valid

### Cross-service check failing
- Verify service URL configuration
- Check network connectivity between services
- Verify IAM permissions for Cloud Run

## Quick Commands

```bash
# Check prod health
/health-check prod

# Check all environments
/health-check all

# Check local development
/health-check local

# Detailed readiness check
/health-check prod --ready
```

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`

## Debug Account (for testing)

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| Org Slug | **Query from DB** (see `.claude/debug-config.md`) |

See `.claude/debug-config.md` for full debug configuration.
