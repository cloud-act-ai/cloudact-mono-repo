# Automatic Supabase Migrations

The frontend automatically checks for and applies pending Supabase migrations on startup.

## How It Works

When you run `npm run dev` or `npm start`, the following happens:

1. **Pre-script runs**: `predev` or `prestart` hook executes `node scripts/run-migrations.js`
2. **Environment check**: Loads `.env.local` and verifies required variables
3. **psql check**: Verifies `psql` is installed (required for migrations)
4. **Migration execution**: Calls `scripts/supabase_db/migrate.sh` to apply pending migrations
5. **Next.js starts**: Only starts after migrations complete successfully

## Migration Tracking

- Migrations are tracked in the `schema_migrations` table in Supabase
- Each migration file (e.g., `01_create_tables.sql`) is applied once
- Re-running is safe - already applied migrations are skipped

## Scripts Available

```bash
# Run migrations manually
npm run migrate

# Development (auto-runs migrations before starting)
npm run dev

# Production (auto-runs migrations before starting)
npm start

# Check migration status (bash script)
cd scripts/supabase_db && ./migrate.sh --status

# Dry run (see what would be applied)
cd scripts/supabase_db && ./migrate.sh --dry-run
```

## Requirements

### Environment Variables (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_DB_PASSWORD=your-database-password
SUPABASE_REGION=us-west-2  # Optional, defaults to us-west-2
```

### psql Installation

```bash
# macOS
brew install libpq
brew link --force libpq

# Linux (Ubuntu/Debian)
sudo apt-get install postgresql-client

# Verify installation
which psql
```

## Behavior

### When Requirements Are Met
- ✅ Migrations run automatically
- ✅ Logs show migration status
- ✅ Next.js starts after migrations complete

### When Requirements Are Missing
- ⚠️ Gracefully skips migrations
- ⚠️ Logs warning message
- ✅ Next.js starts normally (allows development without Supabase)

## Output Examples

### All Migrations Up-to-Date
```
=== Supabase Migration Auto-Runner ===

🔄 Checking for pending Supabase migrations...
=== Running Migrations ===

All migrations are up to date.

✓ Migrations check complete
```

### Applying Pending Migrations
```
=== Supabase Migration Auto-Runner ===

🔄 Checking for pending Supabase migrations...
=== Running Migrations ===

[APPLYING] 01_create_tables.sql...
[SUCCESS] 01_create_tables.sql (234ms)
[APPLYING] 02_add_indexes.sql...
[SUCCESS] 02_add_indexes.sql (156ms)

Applied 2 migration(s).

✓ Migrations check complete
```

### Migration Skipped (No Environment)
```
=== Supabase Migration Auto-Runner ===

⚠ Missing SUPABASE environment variables, skipping migrations
Skipping migrations (environment not configured)
```

### Migration Skipped (No psql)
```
=== Supabase Migration Auto-Runner ===

⚠ psql not installed, skipping migrations
  Install with: brew install libpq && brew link --force libpq
Skipping migrations (psql not available)
```

## Production Deployment

### Cloud Run / Docker

The auto-migration runs during container startup:

```dockerfile
# In Dockerfile (already included in Next.js build)
RUN npm run build  # Runs prestart → migrations
CMD ["npm", "start"]  # Also runs prestart → migrations
```

### Vercel / Serverless

Auto-migrations work in serverless environments if:
- psql is available in the build environment
- Environment variables are configured
- Otherwise, migrations are skipped gracefully

### CI/CD

You can run migrations explicitly in CI/CD:

```yaml
# In GitHub Actions, Cloud Build, etc.
- name: Run Supabase Migrations
  run: |
    cd 01-fronted-system
    npm run migrate
```

## Troubleshooting

### Migrations Not Running

1. Check environment variables:
   ```bash
   cd 01-fronted-system
   grep SUPABASE .env.local
   ```

2. Check psql installation:
   ```bash
   which psql
   psql --version
   ```

3. Test migration script directly:
   ```bash
   cd scripts/supabase_db
   ./migrate.sh --status
   ```

### Migration Fails

If a migration fails:
- Fix the SQL in the migration file
- Delete the failed migration from `schema_migrations` table:
  ```sql
  DELETE FROM schema_migrations WHERE filename = '05_failed_migration.sql';
  ```
- Re-run migrations:
  ```bash
  npm run migrate
  ```

### Force Re-run a Migration

```bash
cd scripts/supabase_db
./migrate.sh --force 05  # Re-runs migration starting with 05
```

## Adding New Migrations

1. Create a new SQL file with incrementing number:
   ```bash
   cd scripts/supabase_db
   touch 99_add_new_feature.sql
   ```

2. Write your SQL:
   ```sql
   -- 99_add_new_feature.sql
   CREATE TABLE IF NOT EXISTS my_new_table (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL
   );
   ```

3. Migrations will auto-apply next time you run:
   ```bash
   npm run dev  # or npm start
   ```

## Migration Files Location

```
01-fronted-system/
└── scripts/
    └── supabase_db/
        ├── migrate.sh              # Main migration runner (bash)
        ├── 01_create_tables.sql    # Migration file
        ├── 02_add_indexes.sql      # Migration file
        ├── ...
        └── 99_latest.sql           # Migration file
```

## Architecture

```
npm run dev
    ↓
package.json "predev" hook
    ↓
scripts/run-migrations.js (Node.js wrapper)
    ↓
scripts/supabase_db/migrate.sh (Bash script)
    ↓
Connects to Supabase via psql
    ↓
Applies pending migrations
    ↓
Returns to npm (Next.js starts)
```

---

**Last Updated:** 2026-01-08
