# /restart - Clean Service Restart

Kill services, clear caches, and restart locally or trigger Cloud Run restarts.

## ⚠️ CRITICAL: Directory Rules

**ALWAYS use absolute paths with `$REPO_ROOT`.** Running commands from the wrong directory creates artifacts in wrong places (e.g., `.next` folder in Python service).

| Service | Correct Directory | Command |
|---------|------------------|---------|
| Frontend | `$REPO_ROOT/01-fronted-system` | `npx next dev --port 3000` |
| API | `$REPO_ROOT/02-api-service` | `uvicorn src.app.main:app --port 8000` |
| Pipeline | `$REPO_ROOT/03-data-pipeline-service` | `uvicorn src.app.main:app --port 8001` |

**NEVER run `npm run dev`, `npx next dev`, or `uvicorn` without first changing to the correct directory using `$REPO_ROOT`.**

## ⚠️ CRITICAL: Port Enforcement

**NEVER use fallback ports.** Services MUST run on their designated ports:

| Service | Required Port | NEVER Use |
|---------|--------------|-----------|
| Frontend | **3000** | 3001, 3002, etc. |
| API | **8000** | 8080, 8888, etc. |
| Pipeline | **8001** | 8002, 8080, etc. |

**Rules:**
1. If port is in use → KILL the process and retry on same port
2. NEVER pass `--port 3001` or any alternate port
3. ALWAYS verify services started on correct ports after startup
4. If a service fails to start on its port, debug and fix - don't use fallback

**Why:** Frontend and other services hardcode these ports. Using fallback ports breaks inter-service communication.

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
pkill -9 -f "turbopack" 2>/dev/null || true
pkill -9 -f "run-frontend.sh" 2>/dev/null || true

# Kill by CORRECT ports
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:8001 | xargs kill -9 2>/dev/null || true

# Also kill any WRONG port usage (cleanup from past mistakes)
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3002 | xargs kill -9 2>/dev/null || true

# Wait for ports to fully release
sleep 2
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

> ⚠️ **CRITICAL:** ALWAYS use absolute paths. NEVER run `npm`, `npx next`, or `uvicorn` without first `cd` to the correct service directory with `$REPO_ROOT`.

**API Service (8000):**
```bash
cd $REPO_ROOT/02-api-service && PYTHONUNBUFFERED=1 python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload > $REPO_ROOT/logs/api.log 2>&1 &
```

**Pipeline Service (8001):**
```bash
cd $REPO_ROOT/03-data-pipeline-service && PYTHONUNBUFFERED=1 python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload > $REPO_ROOT/logs/pipeline.log 2>&1 &
```

**Frontend (3000):** ⚠️ MUST be port 3000 - NEVER 3001
```bash
# ALWAYS use absolute path - prevents .next being created in wrong folder
cd $REPO_ROOT/01-fronted-system && npx next dev --webpack --port 3000 > $REPO_ROOT/logs/frontend.log 2>&1 &

# Or use wrapper script:
# $REPO_ROOT/logs/run-frontend.sh > $REPO_ROOT/logs/frontend.log 2>&1 &
```

**NEVER DO THIS:**
```bash
# WRONG - runs from current directory, creates .next in wrong place
npm run dev
npx next dev
```

**Step 5: Wait and Verify Health + Port Enforcement**
```bash
sleep 8
echo "=== Health Check ==="
curl -s http://localhost:8000/health | python3 -m json.tool || echo "API: Not ready"
curl -s http://localhost:8001/health | python3 -m json.tool || echo "Pipeline: Not ready"
curl -s http://localhost:3000 -o /dev/null -w "Frontend: HTTP %{http_code}\n" || echo "Frontend: Not ready"
```

**Step 5b: Verify Correct Ports (CRITICAL)**
```bash
echo "=== Port Verification ==="
# Check services are on CORRECT ports only
lsof -i:3000 -sTCP:LISTEN | grep -q LISTEN && echo "✓ Frontend on 3000" || echo "✗ Frontend NOT on 3000"
lsof -i:8000 -sTCP:LISTEN | grep -q LISTEN && echo "✓ API on 8000" || echo "✗ API NOT on 8000"
lsof -i:8001 -sTCP:LISTEN | grep -q LISTEN && echo "✓ Pipeline on 8001" || echo "✗ Pipeline NOT on 8001"

# FAIL if services are on wrong ports
if lsof -i:3001 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo "❌ CRITICAL: Something on port 3001 - this is WRONG!"
    echo "Kill it and restart frontend on port 3000"
fi
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
cd $REPO_ROOT/02-api-service && PYTHONUNBUFFERED=1 python3 -m uvicorn src.app.main:app --port 8000 --reload > $REPO_ROOT/logs/api.log 2>&1 &
```

### Local Pipeline Only
```bash
pkill -9 -f "uvicorn.*8001" 2>/dev/null || true
lsof -ti:8001 | xargs kill -9 2>/dev/null || true
sleep 1
cd $REPO_ROOT/03-data-pipeline-service && PYTHONUNBUFFERED=1 python3 -m uvicorn src.app.main:app --port 8001 --reload > $REPO_ROOT/logs/pipeline.log 2>&1 &
```

### Local Frontend Only
```bash
# Kill ALL Node/Next processes aggressively
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
pkill -9 -f "run-frontend.sh" 2>/dev/null || true
pkill -9 -f "turbopack" 2>/dev/null || true

# Kill ANYTHING on port 3000 (required port)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Also kill anything on 3001 (wrong port - cleanup from past mistakes)
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Clear cache (ONLY from frontend directory)
rm -rf $REPO_ROOT/01-fronted-system/.next

# Also clean up any .next in wrong places (safety)
rm -rf $REPO_ROOT/.next 2>/dev/null || true
rm -rf $REPO_ROOT/02-api-service/.next 2>/dev/null || true
rm -rf $REPO_ROOT/03-data-pipeline-service/.next 2>/dev/null || true

# Wait for ports to free up
sleep 2

# Verify port 3000 is free
if lsof -i:3000 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo "❌ Port 3000 still in use after cleanup!"
    lsof -i:3000
    exit 1
fi

# Start on port 3000 ONLY - MUST use absolute path
cd $REPO_ROOT/01-fronted-system && npx next dev --webpack --port 3000 > $REPO_ROOT/logs/frontend.log 2>&1 &

# Verify started on correct port
sleep 5
if ! lsof -i:3000 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo "❌ Frontend failed to start on port 3000!"
    tail -20 $REPO_ROOT/logs/frontend.log
    exit 1
fi
echo "✓ Frontend started on port 3000"
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

## Troubleshooting: Port Issues

### "Port XXXX is already in use"
```bash
# Find what's using the port
lsof -i:3000   # or 8000, 8001

# Kill it
lsof -ti:3000 | xargs kill -9

# Then retry startup
```

### Service started on wrong port (e.g., 3001 instead of 3000)
```bash
# This is WRONG - kill it immediately
lsof -ti:3001 | xargs kill -9

# Kill any leftover processes
pkill -9 -f "next-server"
pkill -9 -f "node.*next"
pkill -9 -f "turbopack"

# Wait for cleanup
sleep 2

# Restart on correct port - ALWAYS use absolute path
cd $REPO_ROOT/01-fronted-system && npx next dev --webpack --port 3000
```

### .next created in wrong folder
```bash
# Clean up misplaced .next directories
rm -rf $REPO_ROOT/.next
rm -rf $REPO_ROOT/02-api-service/.next
rm -rf $REPO_ROOT/03-data-pipeline-service/.next

# The ONLY valid .next location:
# $REPO_ROOT/01-fronted-system/.next
```

### Multiple stale processes
```bash
# Nuclear option - kill everything
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
pkill -9 -f "turbopack" 2>/dev/null || true
pkill -9 -f "uvicorn" 2>/dev/null || true
lsof -ti:3000,3001,3002,8000,8001 | xargs kill -9 2>/dev/null || true

# Wait and verify
sleep 3
lsof -i:3000,3001,8000,8001  # Should show nothing
```

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`

## Debug Account (for testing after restart)

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `demo1234` |
| Org Slug | **Query from DB** (see command below) |

```bash
# Get actual org slug from Supabase
cd 01-fronted-system && source .env.local && curl -s "https://kwroaccbrxppfiysqlzs.supabase.co/rest/v1/organizations?select=org_slug&order=created_at.desc&limit=1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "import sys,json; print('Org Slug:', json.load(sys.stdin)[0]['org_slug'])"
```

See `.claude/debug-config.md` for full debug configuration.
