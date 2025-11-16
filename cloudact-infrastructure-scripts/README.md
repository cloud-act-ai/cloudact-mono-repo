# CloudAct Infrastructure Scripts

Simple shell scripts for GCP infrastructure setup and deployment automation.

## Overview

This folder contains numbered scripts to set up and manage GCP infrastructure for the Convergence Data Pipeline.

## Directory Structure

```
cloudact-infrastructure-scripts/
├── 01-setup-gcp-project.sh          # Initial GCP project setup
├── 02-setup-kms.sh                  # KMS key ring and keys setup
├── 03-setup-cloud-build.sh          # Cloud Build configuration
├── 04-setup-cloud-run.sh            # Cloud Run service setup
├── 05-deploy.sh                     # Main deployment script
├── 06-update-github-secrets.sh      # GitHub secrets management
├── config/
│   ├── stage.env                    # Stage environment config
│   └── prod.env                     # Production environment config
└── .github/
    └── workflows/
        └── deploy.yml               # GitHub Actions workflow
```

## Quick Start

### 1. Initial Setup (One-time)

```bash
# Run scripts in order
./01-setup-gcp-project.sh stage    # Setup staging project
./02-setup-kms.sh stage             # Setup KMS for staging
./03-setup-cloud-build.sh stage     # Setup Cloud Build
./04-setup-cloud-run.sh stage       # Setup Cloud Run service

# Repeat for production
./01-setup-gcp-project.sh prod
./02-setup-kms.sh prod
./03-setup-cloud-build.sh prod
./04-setup-cloud-run.sh prod

# Update GitHub secrets
./06-update-github-secrets.sh
```

### 2. Deploy

```bash
# Deploy to staging
./05-deploy.sh stage

# Deploy to production
./05-deploy.sh prod
```

## GitHub Actions

Push to main branch triggers automatic deployment:

```bash
git push origin main
```

The workflow:
1. Triggers Cloud Build
2. Builds Docker image
3. Deploys to Cloud Run
4. Runs health checks

## Environment Variables

### Stage (`config/stage.env`)
- Project: gac-stage-471220
- Region: us-central1
- Service: convergence-pipeline-stage

### Production (`config/prod.env`)
- Project: gac-prod-471220
- Region: us-central1
- Service: convergence-pipeline-prod

## Prerequisites

- GCP account with billing enabled
- Service accounts created (already exist)
- gcloud CLI installed and authenticated
- GitHub repository access

## Service Accounts

Using existing service accounts:
- **Stage**: Service account in gac-stage-471220
- **Prod**: Service account in gac-prod-471220

## Security

- All secrets stored in GitHub Secrets
- Service account keys encrypted with KMS
- No hardcoded credentials in code

## Support

For issues or questions, check the main convergence-data-pipeline documentation.

---

**Version**: 1.0
**Last Updated**: November 2025
