---
name: env-setup
description: |
  Development environment setup for CloudAct. Docker, local services, GCP credentials, test data.
  Use when: setting up development environment, configuring local services, initializing test data,
  or troubleshooting environment issues.
---

# Environment Setup

## Overview
CloudAct development requires Docker, Python 3.11+, Node.js 20+, and GCP credentials.

## Key Locations
- **Docker Compose:** `docker-compose.yml`
- **Frontend Config:** `01-fronted-system/package.json`
- **API Requirements:** `02-api-service/requirements.txt`
- **Pipeline Requirements:** `03-data-pipeline-service/requirements.txt`

## Prerequisites
```bash
# Required tools
docker --version          # Docker 24+
docker-compose --version  # Docker Compose 2+
python3 --version         # Python 3.11+
node --version            # Node.js 20+
npm --version             # npm 10+
gcloud --version          # Google Cloud SDK
```

## Project Structure
```
cloudact-mono-repo/
├── 00-requirements-specs/    # Documentation
├── 01-fronted-system/        # Next.js (Port 3000)
├── 02-api-service/           # FastAPI (Port 8000)
├── 03-data-pipeline-service/ # FastAPI (Port 8001)
├── 04-inra-cicd-automation/  # Infrastructure
├── docker-compose.yml        # Local development
└── .env.example              # Environment template
```

## Instructions

### 1. Initial Setup
```bash
# Clone repository
git clone https://github.com/your-org/cloudact-mono-repo.git
cd cloudact-mono-repo

# Create environment file
cp .env.example .env

# Edit .env with your values
```

### 2. Configure GCP Credentials
```bash
# Login to GCP
gcloud auth login
gcloud auth application-default login

# Set project
gcloud config set project your-project-id

# Verify
gcloud config list
```

### 3. Setup Python Environments
```bash
# API Service
cd 02-api-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Pipeline Service
cd ../03-data-pipeline-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Setup Frontend
```bash
cd 01-fronted-system
npm install

# Copy environment
cp .env.example .env.local

# Configure Supabase and Stripe keys in .env.local
```

### 5. Start with Docker Compose
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 6. Start Services Manually
```bash
# Terminal 1: API Service
cd 02-api-service
source venv/bin/activate
python3 -m uvicorn src.app.main:app --port 8000 --reload

# Terminal 2: Pipeline Service
cd 03-data-pipeline-service
source venv/bin/activate
python3 -m uvicorn src.app.main:app --port 8001 --reload

# Terminal 3: Frontend
cd 01-fronted-system
npm run dev
```

### 7. Verify Setup
```bash
# Health checks
curl -s http://localhost:8000/health | python3 -m json.tool
curl -s http://localhost:8001/health | python3 -m json.tool
curl -s http://localhost:3000 | head -20

# API docs
open http://localhost:8000/docs
open http://localhost:8001/docs
```

### 8. Initialize Test Data
```bash
# Bootstrap (creates 14 meta tables)
curl -X POST "http://localhost:8000/api/v1/admin/bootstrap" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}"

# Create test org
curl -X POST "http://localhost:8000/api/v1/organizations/onboard" \
  -H "X-CA-Root-Key: ${CA_ROOT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"org_slug": "test_org", "org_name": "Test Organization", "currency": "USD"}'
```

## Environment Variables

### Required
```bash
# GCP
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Security
CA_ROOT_API_KEY=your-secure-key-min-32-chars
ENVIRONMENT=development

# BigQuery
BQ_LOCATION=US
```

### Frontend (.env.local)
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx

# API
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_PIPELINE_URL=http://localhost:8001
```

### Development Overrides
```bash
# For local testing only
DISABLE_AUTH=false  # Keep false, use test keys
LOG_LEVEL=DEBUG
RATE_LIMIT_ENABLED=false
```

## Docker Compose Configuration
```yaml
# docker-compose.yml
services:
  api-service:
    build: ./02-api-service
    ports:
      - "8000:8000"
    environment:
      - GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}
      - CA_ROOT_API_KEY=${CA_ROOT_API_KEY}
    volumes:
      - ~/.config/gcloud:/root/.config/gcloud:ro

  pipeline-service:
    build: ./03-data-pipeline-service
    ports:
      - "8001:8001"
    environment:
      - GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}
    volumes:
      - ~/.config/gcloud:/root/.config/gcloud:ro

  frontend:
    build: ./01-fronted-system
    ports:
      - "3000:3000"
    depends_on:
      - api-service
      - pipeline-service
```

## Troubleshooting

### Port Already in Use
```bash
# Find process
lsof -i :8000
lsof -i :8001
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use make targets
pkill -f "uvicorn.*8000"
pkill -f "uvicorn.*8001"
```

### GCP Auth Issues
```bash
# Refresh credentials
gcloud auth application-default login

# Check service account
gcloud auth list

# Verify BigQuery access
bq ls
```

### Python Dependency Issues
```bash
# Clear cache and reinstall
pip cache purge
pip install -r requirements.txt --force-reinstall
```

### Node.js Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Validation Checklist
- [ ] Docker running
- [ ] GCP credentials configured
- [ ] Python venvs created
- [ ] npm packages installed
- [ ] Environment variables set
- [ ] Services start without errors
- [ ] Health checks pass

## Example Prompts

```
# Initial Setup
"Setup local development environment"
"How do I get started with CloudAct?"
"Initialize the project for first time"

# Docker
"Start services with Docker Compose"
"Build Docker images locally"
"Why is container not starting?"

# Dependencies
"Install Python dependencies"
"Setup Node.js for frontend"
"Configure GCP credentials locally"

# Configuration
"What environment variables do I need?"
"Setup .env.local for frontend"
"Configure Supabase for local dev"

# Troubleshooting
"Port 8000 already in use"
"GCP auth not working locally"
```

## Related Skills
- `bootstrap-onboard` - Initialize system
- `test-orchestration` - Run tests
- `deploy-check` - Deployment preparation
