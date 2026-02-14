# Deploy Checklist

Production deployment sequence. Run AFTER [pre-deploy.md](pre-deploy.md) passes.

## Deployment Flow

```
Developer: git tag vX.Y.Z → git push origin vX.Y.Z
    ↓
Cloud Build: cloudbuild-prod.yaml (auto-triggered by v* tag)
    ↓
Builds: 5 Docker images (4 services + jobs) → pushes to GCR → deploys to Cloud Run
    ↓
Services: frontend (3000) + api (8000) + pipeline (8001) + chat (8002)
```

## Step 1: Tag and Push

```bash
# Update version.json FIRST (must match the tag you'll create)
# Then commit and push to main

# Create version tag (use version from version.json)
git tag vX.Y.Z

# Push tag (triggers Cloud Build)
git push origin vX.Y.Z
```

## Step 2: Monitor Cloud Build

```bash
# Watch build progress (takes ~5-8 minutes)
gcloud builds list --project=cloudact-prod --region=global --limit=5

# Or watch specific build
gcloud builds log <BUILD_ID> --project=cloudact-prod --stream
```

**Expected:** 5 Docker images build (4 services + jobs image) and deploy successfully.

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
  "version": "vX.Y.Z",
  "bigquery": "connected"
}
```

**Note:** Frontend health is at `/api/health` (Next.js API route), not `/health`.

## Step 4: Verify Version

Check that all services report the new version:

```bash
curl -s https://api.cloudact.ai/health | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
curl -s https://pipeline.cloudact.ai/health | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
curl -s https://chat.cloudact.ai/health | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"
```

**Expected:** All services show the tagged version (e.g., `v4.4.3`).

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
