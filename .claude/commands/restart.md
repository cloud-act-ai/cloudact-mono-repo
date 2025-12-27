# /restart - Clean Service Restart

Kill all service instances and restart with log monitoring.

## Instructions

Execute a clean restart of all 3 development services with error monitoring:

### Step 1: Kill All Processes
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:8001 | xargs kill -9 2>/dev/null || true
```

### Step 2: Create Logs Directory
```bash
mkdir -p $REPO_ROOT/logs
```

### Step 3: Start Services (Background with Logging)

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

### Step 4: Wait and Verify Health
```bash
sleep 5
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s http://localhost:8001/health | python3 -m json.tool
curl -s http://localhost:3000 -o /dev/null -w "Frontend: HTTP %{http_code}\n"
```

### Step 5: Check Logs for Errors
```bash
grep -i "error\|exception\|failed\|traceback" $REPO_ROOT/logs/*.log | grep -v "INFO" | head -30 || echo "No errors found"
```

## Output Format

Report:
- Services killed (ports freed)
- Services started (PIDs)
- Health check results
- Any errors found in logs

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`
