# CloudAct CI/CD Scripts

Simple build, push, and deploy scripts for CloudAct services.

## Prerequisites

Before using these scripts, run the GCP setup scripts in order:

```bash
cd ../gcp-setup

# 1. Enable required APIs
./00-gcp-enable-apis.sh <project-id>

# 2. Setup Cloud Build
./01-setup-cloud-build.sh <project-id>

# 3. Setup Artifact Registry
./02-artifactory-setup.sh <project-id>

# 4. Setup secrets
./03-secrets-setup.sh <project-id> <env>

# 5. Setup IAM
./04-iam-setup.sh <project-id> <env>

# 6. Create Cloud Run services
./05-cloud-run-setup.sh <project-id> <env>
```

## Quick Start

### All-in-one (Build → Push → Deploy)

```bash
./cicd.sh <service> <environment> <project-id> [tag]

# Examples:
./cicd.sh api-service test cloudact-testing-1
./cicd.sh pipeline-service stage cloudact-prod
./cicd.sh frontend prod cloudact-prod v1.2.3
```

### Individual Steps

```bash
# 1. Build
./build/build.sh api-service test

# 2. Push
./push/push.sh api-service test cloudact-testing-1

# 3. Deploy
./deploy/deploy.sh api-service test cloudact-testing-1
```

## Services

| Service | Port | Source Directory |
|---------|------|-----------------|
| `api-service` | 8000 | `02-api-service` |
| `pipeline-service` | 8001 | `03-data-pipeline-service` |
| `frontend` | 3000 | `01-fronted-system` |

## Environments

| Environment | Use Case | Auth |
|-------------|----------|------|
| `test` | Development testing | Unauthenticated |
| `stage` | Staging/QA | Unauthenticated |
| `prod` | Production | Authenticated |

## Workflow

```
                    ┌─────────────────┐
                    │   Source Code   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   build/build.sh │
                    │  (Docker build)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   push/push.sh   │
                    │ (Artifact Reg.)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ deploy/deploy.sh │
                    │   (Cloud Run)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Live Service   │
                    └─────────────────┘
```

## Image Naming

```
GCR: gcr.io/{project}/cloudact-{service}-{env}:{tag}

Examples:
- gcr.io/cloudact-prod/cloudact-api-service-prod:v1.2.3
- gcr.io/cloudact-testing-1/cloudact-frontend-test:latest
```

## Monitoring

```bash
# Watch logs for errors (30 minutes default)
./monitor/watch-logs.sh test cloudact-testing-1

# Custom duration (60 minutes)
./monitor/watch-logs.sh prod cloudact-prod 60
```

Monitors all 3 services continuously and reports:
- Real-time error detection
- Error counts per service
- Log file for detailed analysis
