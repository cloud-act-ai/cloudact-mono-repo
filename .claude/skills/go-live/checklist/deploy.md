# Deploy Checklist

Production deployment sequence. Run AFTER [pre-deploy.md](pre-deploy.md) passes.

## Deployment Flow

```
Developer: git tag v4.4.2 → git push origin v4.4.2
    ↓
Cloud Build: cloudbuild-prod.yaml (auto-triggered by v* tag)
    ↓
Builds: 4 Docker images → pushes to GCR → deploys to Cloud Run
    ↓
Services: frontend (3000) + api (8000) + pipeline (8001) + chat (8002)
```

## Step 1: Tag and Push

```bash
# Create version tag
git tag v4.4.2

# Push tag (triggers Cloud Build)
git push origin v4.4.2
```

## Step 2: Monitor Cloud Build

```bash
# Watch build progress (takes ~5-8 minutes)
gcloud builds list --project=cloudact-prod --region=global --limit=5

# Or watch specific build
gcloud builds log <BUILD_ID> --project=cloudact-prod --stream
```

**Expected:** 4 services build and deploy successfully.

## Step 3: Health Checks

```bash
# Quick script
cd 04-inra-cicd-automation/CICD
./quick/status.sh prod

# Or manual curl (use -w to detect HTTP errors)
curl -s -w '\n%{http_code}' https://cloudact.ai/health
curl -s -w '\n%{http_code}' https://api.cloudact.ai/health
curl -s -w '\n%{http_code}' https://pipeline.cloudact.ai/health
curl -s -w '\n%{http_code}' https://chat.cloudact.ai/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "service": "api-service",
  "version": "v4.4.2",
  "bigquery": "connected"
}
```

## Step 4: Verify Version

Check that all services report the new version:

```bash
curl -s https://api.cloudact.ai/health | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
curl -s https://pipeline.cloudact.ai/health | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
```

**Expected:** All services show `v4.4.2` (or your tagged version).

## Step 5: Quick Smoke Test

| Test | How | Expected |
|------|-----|----------|
| Homepage loads | Visit cloudact.ai | Renders |
| Login page | Visit cloudact.ai/login | Form shows |
| API docs | Visit api.cloudact.ai/docs | OpenAPI renders |
| Signup page | Visit cloudact.ai/signup | Form shows |

## If Build Fails

1. Check Cloud Build logs: `gcloud builds log <BUILD_ID> --project=cloudact-prod`
2. Common causes: missing secrets, Dockerfile errors, dependency issues
3. Fix on main, re-tag with same or next patch version
4. If services are down, follow [rollback.md](rollback.md)

## Next

Proceed to [post-deploy.md](post-deploy.md) for full verification.
