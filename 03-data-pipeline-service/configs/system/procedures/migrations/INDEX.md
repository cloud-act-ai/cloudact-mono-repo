# Migrations Index

Quick navigation for currency audit fields backfill migration.

---

## Quick Links

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **[QUICKSTART.md](./QUICKSTART.md)** | Copy-paste ready commands | **Start here** for running the migration |
| **[MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md)** | Complete overview | Understanding the full migration |
| **[README.md](./README.md)** | Detailed documentation | Deep dive, troubleshooting |
| **[backfill_currency_audit_fields.sql](./backfill_currency_audit_fields.sql)** | SQL procedure | Review or modify logic |
| **[run_migration.sh](./run_migration.sh)** | Helper script | Interactive CLI usage |

---

## Quick Start

### 1. Sync Procedures

```bash
curl -X POST "http://localhost:8001/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### 2. Dry Run

```bash
curl -X POST "http://localhost:8001/api/v1/migrations/backfill_currency_audit_fields/execute" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_dataset": "your_org_prod", "dry_run": true}'
```

### 3. Execute

```bash
curl -X POST "http://localhost:8001/api/v1/migrations/backfill_currency_audit_fields/execute" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_dataset": "your_org_prod", "dry_run": false}'
```

---

## API Endpoint

**Method:** POST
**Path:** `/api/v1/migrations/backfill_currency_audit_fields/execute`
**Auth:** X-CA-Root-Key

**Request:**
```json
{
  "org_dataset": "acme_corp_prod",
  "dry_run": true
}
```

---

## Migration Purpose

Backfill currency audit fields (`source_currency`, `source_price`, `exchange_rate_used`) for existing SaaS subscription plans that were created before these fields existed.

**Why needed:** These fields track the original currency and exchange rate used when creating pricing plans. Existing plans need these fields populated for historical accuracy.

---

## Safety Features

✅ Dry run mode (preview before executing)
✅ Only updates rows with NULL audit fields
✅ Atomic transaction (all or nothing)
✅ Counts and samples before/after
✅ Full error handling

---

## Files Created

```
configs/system/procedures/migrations/
├── backfill_currency_audit_fields.sql    # SQL stored procedure
├── INDEX.md                              # This file (quick navigation)
├── MIGRATION_SUMMARY.md                  # Complete overview
├── QUICKSTART.md                         # Quick reference
├── README.md                             # Detailed documentation
└── run_migration.sh                      # Helper script (executable)

src/app/routers/
└── procedures.py                         # API endpoint (modified)
```

---

## Support

- **Troubleshooting:** [README.md](./README.md#troubleshooting)
- **Examples:** [QUICKSTART.md](./QUICKSTART.md)
- **Full details:** [MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md)

---

**Created:** 2025-12-14
**Status:** Production Ready
