# OPERATIONS.md - CloudAct System Operations

## Bootstrap Sequence (Run in Order)

```bash
# Step 1: Migrations (Supabase)
cd /Users/openclaw/.openclaw/workspace/cloudact-mono-repo/01-fronted-system
./scripts/supabase_db/migrate.sh --status --prod
./scripts/supabase_db/migrate.sh --yes --prod

# Step 2: Bootstrap (BigQuery 21 tables)
cd /Users/openclaw/.openclaw/workspace/cloudact-mono-repo/05-scheduler-jobs
./scripts/run-job.sh prod bootstrap

# Step 3: Org Sync (All organizations)
./scripts/run-job.sh prod org-sync-all

# Step 4: Health Check
cd /Users/openclaw/.openclaw/workspace/cloudact-mono-repo/04-inra-cicd-automation/CICD
./quick/status.sh prod
```

## Deploy

```bash
# Stage (auto on push to main)
git push origin main

# Production (via git tag — ASK RAMA FIRST)
git tag v4.X.X && git push origin v4.X.X
```

## Demo Account

- Email: demo@cloudact.ai
- Password: Demo1234
- Login: https://cloudact.ai/login

## Success Criteria

- [ ] `migrate.sh --status --prod` — all applied
- [ ] `run-job.sh prod bootstrap` — no errors
- [ ] `run-job.sh prod org-sync-all` — no errors
- [ ] `./quick/status.sh prod` — all healthy
- [ ] Login at cloudact.ai with demo account works
- [ ] Dashboard loads with cost data

## Troubleshooting

### Migration failed
```bash
./scripts/supabase_db/migrate.sh --status --prod
./scripts/supabase_db/migrate.sh --force N --prod
```

### Bootstrap failed
```bash
curl https://api.cloudact.ai/health
./monitor/watch-all.sh prod 50
```

---

*Reference: CLAUDE.md for full technical details*
