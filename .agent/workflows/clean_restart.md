---
description: Clean up ports and restart development services
---

# Clean and Restart Services

This workflow kills any processes potentially hanging on the development ports and restarts the application services.

## 1. Clean Ports

// turbo
Kill processes on 3000 (frontend), 8000 (API), and 8001 (Pipeline).

```bash
lsof -ti:3000 | xargs kill -9 || true
lsof -ti:8000 | xargs kill -9 || true
lsof -ti:8001 | xargs kill -9 || true
```

## 2. Restart API Service

Start the API service in the background.

```bash
cd api-service && python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload > ../logs/api.log 2>&1 &
```

## 3. Restart Pipeline Service

Start the Pipeline service in the background.

```bash
cd data-pipeline-service && python3 -m uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload > ../logs/pipeline.log 2>&1 &
```

## 4. Restart Frontend

Start the frontend development server.

```bash
cd fronted-system && npm run dev > ../logs/frontend.log 2>&1 &
```

## 5. Verify Health

Check that services are up.

```bash
sleep 5
curl -s http://localhost:8000/health
curl -s http://localhost:8001/health
```
