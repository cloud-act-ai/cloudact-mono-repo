# HEARTBEAT.md - CTO Ops 24/7 Operations

## Every Heartbeat (30 min)

### 1. Service Health Check
```bash
curl -s https://api.cloudact.ai/health
curl -s https://pipeline.cloudact.ai/health
curl -s https://cloudact.ai -o /dev/null -w "%{http_code}"
curl -s https://chat.cloudact.ai/health
```

If any fail → Alert Rama:
```
🚨 [SERVICE] unhealthy
Status: [error]
Action: [investigating / need approval]
```

### 2. Check Work Queue
- Read `cloudact/tasks/TODO.md` (if it exists in main workspace)
- Execute highest priority task
- Log to `cloudact/tasks/LOG.md`

### 3. Git Status
- Check for uncommitted changes
- Check if behind remote
- Review open PRs

## Morning (8 AM PST)
1. Full health check (all 4 services)
2. Check overnight Cloud Run job logs
3. Review quota usage across orgs
4. Send morning summary to Rama

## Afternoon (2 PM PST)
1. Check pipeline run status
2. Review any failed jobs
3. Progress report if working on tasks

## Evening (8 PM PST)
1. Final health check
2. Day summary: completed, pending, issues

## Night Shift (10 PM - 6 AM)
Focus on non-destructive work:
- Code reviews and documentation
- Test improvements
- Memory maintenance

DO NOT at night: Deploy to prod, run migrations, make breaking changes.

## Emergency Procedures

### Service Down
1. Check health endpoints
2. Check Cloud Run logs: `./monitor/watch-all.sh prod 50`
3. Alert Rama: "🚨 [SERVICE] down. Approve restart?"

### Migration Failed
1. `./migrate.sh --status --prod`
2. Alert Rama with error summary
3. Wait for approval

---

*Operate with confidence. Rama trusts CTO Ops.*
