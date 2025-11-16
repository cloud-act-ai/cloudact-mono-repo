# CloudAct Backend Systems

Multi-tenant data pipeline infrastructure with automated CI/CD deployment to Google Cloud Run.

## Live Deployment URLs

| Environment | URL | Purpose |
|-------------|-----|---------|
| **Staging** | https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app | Testing and validation |
| **Production** | https://convergence-pipeline-prod-7c6pogsrka-uc.a.run.app | Live customer service |

## Quick Start

### Test the APIs

```bash
# Health check - Staging
curl https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/health

# Onboard a customer - Staging
curl -X POST https://convergence-pipeline-stage-7c6pogsrka-uc.a.run.app/api/v1/customers/onboard \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "test_company_001", "company_name": "Test Company", "subscription_tier": "FREE"}'
```

### Deploy to Environments

```bash
# Deploy to staging (automatic on push to main)
git push origin main

# Deploy to production (manual)
gh workflow run deploy.yml -f environment=production
```

## Project Structure

```
cloudact-backend-systems/
├── convergence-data-pipeline/     # Main application
│   ├── src/                       # Application source code
│   ├── configs/                   # Pipeline and metadata configurations
│   ├── deployment/                # Docker and deployment files
│   ├── docs/                      # Comprehensive documentation
│   └── tests/                     # Test suites
│
├── cloudact-infrastructure-scripts/  # Infrastructure automation
│   ├── 00-auto-deploy-and-test.sh   # Automated deployment script
│   ├── 01-04-setup-*.sh             # GCP setup scripts
│   └── 06-update-github-secrets.sh  # GitHub secrets configuration
│
├── .github/workflows/
│   └── deploy.yml                 # CI/CD workflow
│
└── docs/
    ├── API_REFERENCE.md           # Complete API documentation
    └── CICD_GUIDE.md              # CI/CD and deployment guide
```

## Key Features

- Multi-tenant BigQuery architecture
- Automated customer onboarding
- Environment-specific deployments (staging/production)
- GitHub Actions CI/CD pipeline
- Docker containerization
- Health monitoring and logging
- Metadata-driven pipeline configuration

## Environments

### Staging
- **Project**: gac-stage-471220
- **Deployment**: Automatic on push to `main`
- **Purpose**: Testing and validation

### Production
- **Project**: gac-prod-471220
- **Deployment**: Manual workflow dispatch
- **Purpose**: Live customer service

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](./docs/API_REFERENCE.md) | Complete API endpoint documentation |
| [CI/CD Guide](./docs/CICD_GUIDE.md) | Deployment and infrastructure guide |
| [Application README](./convergence-data-pipeline/README.md) | Application details |
| [Infrastructure Scripts](./cloudact-infrastructure-scripts/README.md) | Setup and deployment scripts |

## CI/CD Pipeline

### Automatic Staging Deployment
```
Push to main → GitHub Actions → Build Docker → Deploy to Staging
```

### Manual Production Deployment
```
Workflow Dispatch → GitHub Actions → Build Docker → Deploy to Production
```

### Monitoring Deployments
```bash
# List workflow runs
gh run list --workflow=deploy.yml

# Watch specific run
gh run watch <RUN_ID>

# View logs
gh run view <RUN_ID> --log
```

## Development Workflow

1. **Make changes** in `convergence-data-pipeline/`
2. **Test locally** with docker compose or uvicorn
3. **Commit and push** to `main` branch
4. **Automatic deployment** to staging
5. **Verify** staging deployment
6. **Manual trigger** production deployment
7. **Monitor** and verify production

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `docs/` directory
- Infrastructure: See `cloudact-infrastructure-scripts/`

## Latest Updates

- ✅ Deployed to Staging and Production
- ✅ Onboarding API tested and working
- ✅ CI/CD pipeline fully automated
- ✅ Comprehensive documentation added
- ✅ Multi-environment support configured
