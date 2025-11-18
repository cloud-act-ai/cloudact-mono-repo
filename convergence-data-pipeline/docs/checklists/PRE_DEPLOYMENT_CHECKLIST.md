# Pre-Deployment Checklist

**Version:** 1.0.0
**Last Updated:** 2024-01-17
**Owner:** DevOps Team

## Purpose
This checklist ensures all necessary steps are completed before deploying to production. All items must be checked off before proceeding with deployment.

---

## Code Quality & Testing

### Code Review
- [ ] All code changes peer-reviewed and approved
- [ ] No unresolved review comments
- [ ] Code follows project style guide (black, ruff)
- [ ] No sensitive data (API keys, passwords) in code

### Static Analysis
- [ ] Linting passed (`ruff check src/`)
- [ ] Type checking passed (`mypy src/`)
- [ ] Security scanning passed (`bandit -r src/`)
- [ ] Dependency vulnerability scan passed (`safety check`)
- [ ] No high/critical severity findings

### Testing
- [ ] All unit tests passed (100% pass rate)
- [ ] All integration tests passed
- [ ] E2E tests passed in staging environment
- [ ] Performance tests passed (latency, throughput)
- [ ] Load tests passed (expected traffic + 20%)
- [ ] Chaos testing completed (if applicable)

### Test Coverage
- [ ] Code coverage ≥ 80%
- [ ] Critical paths have 100% coverage
- [ ] New features have corresponding tests

---

## Build & Artifacts

### Docker Image
- [ ] Docker image built successfully
- [ ] Image tagged with correct version
- [ ] Image scanned for vulnerabilities (no critical/high)
- [ ] Image size optimized (< 1GB)
- [ ] Image pushed to container registry

### Versioning
- [ ] Version number incremented (semver)
- [ ] Git tag created (`git tag v1.0.0`)
- [ ] Release notes drafted
- [ ] CHANGELOG.md updated

---

## Database & Data

### Database Migrations
- [ ] Migrations reviewed and tested in staging
- [ ] Migration rollback plan documented
- [ ] Database backup completed before migration
- [ ] Migration SQL reviewed (no data loss)
- [ ] Migration tested on copy of production data

### Data Validation
- [ ] Data integrity checks passed
- [ ] Schema changes backward compatible
- [ ] No breaking changes to existing data

---

## Configuration

### Environment Variables
- [ ] All required env vars documented in .env.example
- [ ] Production env vars configured in Secret Manager
- [ ] No default/insecure values in production
- [ ] Secrets rotated within policy (< 90 days)

### Application Config
- [ ] Production config validated (config/production/config.yaml)
- [ ] Logging config validated (config/production/logging.yaml)
- [ ] Monitoring config validated (config/production/monitoring.yaml)
- [ ] Security config validated (config/production/security.yaml)
- [ ] Rate limits appropriate for production traffic
- [ ] Feature flags configured correctly

### Infrastructure
- [ ] Cloud resources provisioned (Cloud Run, BigQuery, etc.)
- [ ] IAM roles and permissions configured
- [ ] Service accounts created with least privilege
- [ ] Network policies configured
- [ ] Load balancer configured
- [ ] Auto-scaling parameters set

---

## Security

### Authentication & Authorization
- [ ] API keys generated for production
- [ ] Admin API key secured (not in code/env)
- [ ] RBAC policies configured
- [ ] Tenant isolation verified

### Encryption
- [ ] TLS/HTTPS enabled (min TLS 1.2)
- [ ] KMS encryption configured for secrets
- [ ] Database encryption at rest enabled
- [ ] Sensitive fields encrypted

### Security Policies
- [ ] CORS configured with correct origins
- [ ] CSP headers configured
- [ ] Rate limiting enabled
- [ ] Input validation enabled
- [ ] SQL injection protection enabled
- [ ] Path traversal protection enabled

### Compliance
- [ ] Security checklist completed (SECURITY_CHECKLIST.md)
- [ ] Audit logging enabled
- [ ] PII handling verified
- [ ] Data retention policies configured

---

## Monitoring & Alerting

### Metrics
- [ ] Prometheus metrics endpoint accessible
- [ ] Key metrics being exported (requests, errors, latency)
- [ ] Custom application metrics configured
- [ ] Metrics retention policy set (30 days)

### Logging
- [ ] Structured JSON logging enabled
- [ ] Log level set to INFO
- [ ] Log retention configured (30 days)
- [ ] Error logs routing to error.log
- [ ] Audit logs routing to audit.log (90 days)

### Dashboards
- [ ] Grafana dashboards configured
- [ ] System overview dashboard accessible
- [ ] Pipeline metrics dashboard configured
- [ ] BigQuery performance dashboard configured
- [ ] Security dashboard configured

### Alerts
- [ ] AlertManager configured
- [ ] Critical alerts routing to PagerDuty
- [ ] High alerts routing to Slack + Email
- [ ] Alert rules tested (send test alert)
- [ ] On-call schedule configured
- [ ] Runbooks linked in alert annotations

### Health Checks
- [ ] Liveness probe configured (/health/live)
- [ ] Readiness probe configured (/health/ready)
- [ ] Health checks tested and passing
- [ ] Dependencies (BigQuery, Firestore) verified

---

## Performance

### Resource Allocation
- [ ] CPU limits appropriate (4 CPUs recommended)
- [ ] Memory limits appropriate (8GB recommended)
- [ ] Min/max instances configured (2-10 recommended)
- [ ] Concurrency limits set (100 per instance)
- [ ] Timeout configured (300s)

### Optimization
- [ ] Database queries optimized
- [ ] Indexes created where needed
- [ ] Caching enabled (if applicable)
- [ ] Connection pooling configured
- [ ] Async operations implemented

---

## Backup & Recovery

### Backups
- [ ] Database backup policy configured (daily)
- [ ] Configuration backup enabled
- [ ] Backup retention period set (30 days)
- [ ] Backup restoration tested

### Disaster Recovery
- [ ] Rollback plan documented
- [ ] Recovery Time Objective (RTO) defined (< 1 hour)
- [ ] Recovery Point Objective (RPO) defined (< 1 hour)
- [ ] DR runbook updated

---

## Documentation

### Code Documentation
- [ ] README.md updated
- [ ] API documentation generated
- [ ] Code comments added for complex logic
- [ ] Architecture diagrams updated

### Operational Documentation
- [ ] DEPLOYMENT.md reviewed and accurate
- [ ] TROUBLESHOOTING.md updated
- [ ] RUNBOOK.md updated with new scenarios
- [ ] MONITORING.md reflects current setup
- [ ] Environment variables documented

### User Documentation
- [ ] User guide updated (if applicable)
- [ ] API changelog published
- [ ] Migration guide created (for breaking changes)

---

## Communication & Planning

### Stakeholder Communication
- [ ] Deployment notification sent to team
- [ ] Status page updated (if applicable)
- [ ] Customer communication prepared (if needed)
- [ ] Support team briefed on changes

### Deployment Planning
- [ ] Deployment window scheduled (Tue-Thu, 10am-2pm PST)
- [ ] No conflicting deployments scheduled
- [ ] Rollback plan reviewed
- [ ] Incident response team on standby
- [ ] Post-deployment monitoring plan defined

### Dependencies
- [ ] Dependent services notified
- [ ] Breaking changes communicated
- [ ] API version compatibility verified

---

## Staging Verification

### Staging Environment
- [ ] Deployed to staging successfully
- [ ] Staging smoke tests passed
- [ ] Staging E2E tests passed
- [ ] Staging performance tests passed
- [ ] Staging running for 24+ hours without issues

### Production Parity
- [ ] Staging config matches production
- [ ] Staging data volume representative
- [ ] Staging load testing completed

---

## Sign-Off

### Approvals Required

**Developer:**
- Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**Tech Lead:**
- Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**DevOps Engineer:**
- Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**QA Lead (if applicable):**
- Name: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Date: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
- Signature: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## Final Check

**All items above have been completed and verified.**

**Ready for deployment:** [ ] YES / [ ] NO

**If NO, blockers:**
1. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
2. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
3. \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

## Notes

Use this section for any special notes, caveats, or considerations for this deployment:

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

---

**Once all items are checked, proceed to deployment following [DEPLOYMENT.md](../operations/DEPLOYMENT.md)**
