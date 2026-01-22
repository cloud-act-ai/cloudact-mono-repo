# /restart - Clean Service Restart

Kill services, clear caches, and restart locally or trigger Cloud Run restarts.

## Usage

```
/restart                                 # Restart all local services
/restart local                           # Restart all local services
/restart local api                       # Restart only API service locally
/restart test                            # Restart all Cloud Run services in test
/restart stage api                       # Restart API service in stage
/restart prod                            # Restart all Cloud Run services in prod (confirmation)
```

## Actions

### Local Restart
```
/restart local                           # All services
/restart local api                       # API service only
/restart local pipeline                  # Pipeline service only
/restart local frontend                  # Frontend only
```

### Cloud Run Restart
```
/restart test                            # Restart all in test
/restart stage                           # Restart all in stage
/restart prod                            # Restart all in prod (requires confirmation)
/restart test api                        # Restart specific service
```

---

## Instructions

### Local Restart (Default)

**Step 1: Stop Docker Containers (if running)**
```bash
# Stop Docker containers from compose file
docker-compose -f $REPO_ROOT/docker-compose.local.yml down 2>/dev/null || true

# Stop any containers on our ports
for port in 3000 8000 8001; do
    CONTAINER_ID=$(docker ps -q --filter "publish=$port" 2>/dev/null)
    if [ -n "$CONTAINER_ID" ]; then
        docker stop "$CONTAINER_ID" 2>/dev/null || true
        docker rm "$CONTAINER_ID" 2>/dev/null || true
    fi
done

# Stop cloudact-* named containers
docker ps -q --filter "name=cloudact-" 2>/dev/null | xargs -r docker stop 2>/dev/null || true
docker ps -aq --filter "name=cloudact-" 2>/dev/null | xargs -r docker rm 2>/dev/null || true
```

**Step 2: Kill Local Processes (Thorough)**
```bash
# Kill by process name
pkill -9 -f "uvicorn.*8000" 2>/dev/null || true
pkill -9 -f "uvicorn.*8001" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true

# Kill by port (fallback)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:8001 | xargs kill -9 2>/dev/null || true
```

**Step 3: Clear Caches**
```bash
# Next.js cache
rm -rf $REPO_ROOT/01-fronted-system/.next

# Python caches
find $REPO_ROOT -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find $REPO_ROOT -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

# Clear old logs
rm -f $REPO_ROOT/logs/*.log 2>/dev/null || true
mkdir -p $REPO_ROOT/logs
```

**Step 4: Start Services (Background with Logging)**

**API Service (8000):**
```bash
cd $REPO_ROOT/02-api-service && PYTHONUNBUFFERED=1 python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload > ../logs/api.log 2>&1 &
```

**Pipeline Service (8001):**
```bash
cd $REPO_ROOT/03-data-pipeline-service && PYTHONUNBUFFERED=1 python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload > ../logs/pipeline.log 2>&1 &
```

**Frontend (3000):**
```bash
# Use wrapper script to add timestamps and strip ANSI codes
$REPO_ROOT/logs/run-frontend.sh > $REPO_ROOT/logs/frontend.log 2>&1 &
```

**Step 5: Wait and Verify Health**
```bash
sleep 8
echo "=== Health Check ==="
curl -s http://localhost:8000/health | python3 -m json.tool || echo "API: Not ready"
curl -s http://localhost:8001/health | python3 -m json.tool || echo "Pipeline: Not ready"
curl -s http://localhost:3000 -o /dev/null -w "Frontend: HTTP %{http_code}\n" || echo "Frontend: Not ready"
```

**Step 6: Check Logs for Errors**
```bash
grep -i "error\|exception\|failed\|traceback" $REPO_ROOT/logs/*.log | grep -v "INFO" | head -30 || echo "No errors found"
```

---

### Cloud Run Restart

Triggers a new revision of Cloud Run services (restarts without redeploying).

**Step 1: Activate environment**
```bash
ENV={env}
case $ENV in
  test)  PROJECT=cloudact-testing-1; KEY_FILE=~/.gcp/cloudact-testing-1-e44da390bf82.json ;;
  stage) PROJECT=cloudact-stage; KEY_FILE=~/.gcp/cloudact-stage.json ;;
  prod)  PROJECT=cloudact-prod; KEY_FILE=~/.gcp/cloudact-prod.json ;;
esac

gcloud auth activate-service-account --key-file=$KEY_FILE
gcloud config set project $PROJECT
```

**Step 2: Restart services**
```bash
REGION=us-central1

# All services
for SERVICE in cloudact-api-service-${ENV} cloudact-pipeline-service-${ENV}; do
  echo "Restarting $SERVICE..."
  gcloud run services update $SERVICE \
    --project=$PROJECT \
    --region=$REGION \
    --update-env-vars="RESTART_TRIGGER=$(date +%s)"
done

# OR restart specific service
SERVICE={service}  # api-service, pipeline-service, frontend
gcloud run services update cloudact-${SERVICE}-${ENV} \
  --project=$PROJECT \
  --region=$REGION \
  --update-env-vars="RESTART_TRIGGER=$(date +%s)"
```

**Step 3: Wait for new revision**
```bash
sleep 10

# Verify services are healthy
case $ENV in
  test)  API_URL="https://cloudact-api-service-test-zfq7lndpda-uc.a.run.app" ;;
  stage) API_URL="https://cloudact-api-service-stage-zfq7lndpda-uc.a.run.app" ;;
  prod)  API_URL="https://api.cloudact.ai" ;;
esac

curl -s "$API_URL/health" | python3 -m json.tool
```

---

## Service-Specific Restart

### Local API Only
```bash
pkill -9 -f "uvicorn.*8000" 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 1
cd $REPO_ROOT/02-api-service && PYTHONUNBUFFERED=1 python3 -m uvicorn src.app.main:app --port 8000 --reload > ../logs/api.log 2>&1 &
```

### Local Pipeline Only
```bash
pkill -9 -f "uvicorn.*8001" 2>/dev/null || true
lsof -ti:8001 | xargs kill -9 2>/dev/null || true
sleep 1
cd $REPO_ROOT/03-data-pipeline-service && PYTHONUNBUFFERED=1 python3 -m uvicorn src.app.main:app --port 8001 --reload > ../logs/pipeline.log 2>&1 &
```

### Local Frontend Only
```bash
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
pkill -9 -f "run-frontend.sh" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
rm -rf $REPO_ROOT/01-fronted-system/.next
sleep 1
$REPO_ROOT/logs/run-frontend.sh > $REPO_ROOT/logs/frontend.log 2>&1 &
```

---

## Output Format

Report:
- Docker containers stopped (if any were running)
- Local processes killed (by name and port)
- Caches cleared (.next, __pycache__, .pytest_cache, old logs)
- Services started locally (PIDs) OR Cloud Run revisions updated
- Health check results
- Any errors found in logs

---

## Quick Commands

```bash
# Full local restart
/restart local

# Just API service locally
/restart local api

# Restart Cloud Run in test
/restart test

# Restart prod (will ask for confirmation)
/restart prod
```

## Service URLs After Restart

| Service | Local | Production |
|---------|-------|------------|
| API | http://localhost:8000 | https://api.cloudact.ai |
| Pipeline | http://localhost:8001 | https://pipeline.cloudact.ai |
| Frontend | http://localhost:3000 | https://cloudact.ai |
| API Docs | http://localhost:8000/docs | https://api.cloudact.ai/docs |
| Pipeline Docs | http://localhost:8001/docs | https://pipeline.cloudact.ai/docs |

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`

## Debug Account (for testing after restart)

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| Org Slug | **Query from DB** (see command below) |

```bash
# Get actual org slug from Supabase
cd 01-fronted-system && source .env.local && curl -s "https://kwroaccbrxppfiysqlzs.supabase.co/rest/v1/organizations?select=org_slug&order=created_at.desc&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "import sys,json; print('Org Slug:', json.load(sys.stdin)[0]['org_slug'])"
```

See `.claude/debug-config.md` for full debug configuration.
