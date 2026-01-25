# /docker-local - Docker Local Development

Kill all service instances (Docker + local), clear caches, and restart in Docker with log monitoring.

## ⚠️ CRITICAL: Always Use Absolute Paths

**ALWAYS use `$REPO_ROOT` for all commands.** This prevents creating artifacts in wrong directories.

```bash
$REPO_ROOT = /Users/gurukallam/prod-ready-apps/cloudact-mono-repo
```

## Prerequisites

1. **Docker Desktop running** - Start Docker Desktop before using this command
2. **GCP credentials** - `~/.gcp/cloudact-testing-1-e44da390bf82.json` must exist
3. **Service .env.local files** - Each service must have its `.env.local` file:
   - `02-api-service/.env.local`
   - `03-data-pipeline-service/.env.local`
   - `01-fronted-system/.env.local`

## Instructions

Execute a clean Docker restart of all 3 services with cache clearing and error monitoring:

### Step 1: Stop Docker Containers (if running)
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

### Step 2: Kill Local Processes (Thorough)
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

### Step 3: Clear Caches
```bash
# Next.js cache (ONLY valid in frontend)
rm -rf $REPO_ROOT/01-fronted-system/.next

# Clean up misplaced .next directories (safety)
rm -rf $REPO_ROOT/.next 2>/dev/null || true
rm -rf $REPO_ROOT/02-api-service/.next 2>/dev/null || true
rm -rf $REPO_ROOT/03-data-pipeline-service/.next 2>/dev/null || true

# Python caches
find $REPO_ROOT -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find $REPO_ROOT -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

# Clear old logs
rm -f $REPO_ROOT/logs/*.log 2>/dev/null || true
mkdir -p $REPO_ROOT/logs
```

### Step 4: Build and Start Docker Containers
```bash
cd $REPO_ROOT && docker-compose -f docker-compose.local.yml up -d --build
```

### Step 5: Wait for Services to Start
```bash
echo "Waiting for services to start..."
sleep 15
```

### Step 6: Check Container Status
```bash
docker-compose -f $REPO_ROOT/docker-compose.local.yml ps
```

### Step 7: Verify Health Endpoints
```bash
# Check API Service
curl -s http://localhost:8000/health | python3 -m json.tool || echo "API Service not ready yet"

# Check Pipeline Service
curl -s http://localhost:8001/health | python3 -m json.tool || echo "Pipeline Service not ready yet"

# Check Frontend
curl -s http://localhost:3000 -o /dev/null -w "Frontend: HTTP %{http_code}\n" || echo "Frontend not ready yet"
```

### Step 8: Check Logs for Errors
```bash
docker-compose -f $REPO_ROOT/docker-compose.local.yml logs --tail=30 2>&1 | grep -i "error\|exception\|failed\|traceback" | head -20 || echo "No errors found in logs"
```

## Output Format

Report:
- Docker containers stopped (if any were running)
- Local processes killed (by name and port)
- Caches cleared (.next, __pycache__, .pytest_cache, old logs)
- Docker containers built and started
- Container status (running/healthy/unhealthy)
- Health check results for all 3 services
- Any errors from container logs

## Quick Commands Reference

| Command | Description |
|---------|-------------|
| `docker-compose -f docker-compose.local.yml up -d` | Start all services |
| `docker-compose -f docker-compose.local.yml up -d --build` | Rebuild and start |
| `docker-compose -f docker-compose.local.yml down` | Stop all services |
| `docker-compose -f docker-compose.local.yml logs -f` | Follow all logs |
| `docker-compose -f docker-compose.local.yml logs -f api-service` | Follow API logs |
| `docker-compose -f docker-compose.local.yml restart api-service` | Restart one service |
| `docker-compose -f docker-compose.local.yml ps` | Show container status |

## Service Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API Service Docs | http://localhost:8000/docs |
| Pipeline Service Docs | http://localhost:8001/docs |
| API Health | http://localhost:8000/health |
| Pipeline Health | http://localhost:8001/health |

## Troubleshooting

### Docker daemon not running
```bash
# Error: Cannot connect to the Docker daemon
# Solution: Start Docker Desktop application
```

### Port already in use
```bash
# Find and kill process on port
lsof -ti:8000 | xargs kill -9
lsof -ti:8001 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### View container logs for errors
```bash
docker-compose -f docker-compose.local.yml logs api-service
docker-compose -f docker-compose.local.yml logs pipeline-service
docker-compose -f docker-compose.local.yml logs frontend
```

### Rebuild a specific service
```bash
docker-compose -f docker-compose.local.yml build --no-cache api-service
docker-compose -f docker-compose.local.yml up -d api-service
```

### Reset everything
```bash
docker-compose -f docker-compose.local.yml down -v --rmi all
docker-compose -f docker-compose.local.yml up -d --build
```

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`
