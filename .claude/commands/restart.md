# /restart - Clean Service Restart

Kill all service instances, clear caches, and restart with log monitoring.

## Instructions

Execute a clean restart of all 3 development services with cache clearing and error monitoring:

### Step 1: Kill All Processes (Thorough)
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

### Step 2: Clear Caches
```bash
# Next.js cache
rm -rf $REPO_ROOT/01-fronted-system/.next

# Python caches
find $REPO_ROOT -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find $REPO_ROOT -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

# Clear old logs
rm -f $REPO_ROOT/logs/*.log 2>/dev/null || true
```

### Step 3: Create Logs Directory
```bash
mkdir -p $REPO_ROOT/logs
```

### Step 4: Start Services (Background with Logging)

**API Service (8000):**
```bash
cd $REPO_ROOT/02-api-service && python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload > ../logs/api.log 2>&1 &
```

**Pipeline Service (8001):**
```bash
cd $REPO_ROOT/03-data-pipeline-service && python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload > ../logs/pipeline.log 2>&1 &
```

**Frontend (3000):**
```bash
cd $REPO_ROOT/01-fronted-system && npm run dev > ../logs/frontend.log 2>&1 &
```

### Step 5: Wait and Verify Health
```bash
sleep 5
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s http://localhost:8001/health | python3 -m json.tool
curl -s http://localhost:3000 -o /dev/null -w "Frontend: HTTP %{http_code}\n"
```

### Step 6: Check Logs for Errors
```bash
grep -i "error\|exception\|failed\|traceback" $REPO_ROOT/logs/*.log | grep -v "INFO" | head -30 || echo "No errors found"
```

## Output Format

Report:
- Processes killed (by name and port)
- Caches cleared (.next, __pycache__, .pytest_cache, old logs)
- Services started (PIDs)
- Health check results
- Any errors found in logs

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`
