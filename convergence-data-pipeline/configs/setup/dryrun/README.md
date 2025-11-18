# Dry Run Configuration Directory

This directory contains dry-run configurations for testing operations without actual execution.

## ⚠️ CRITICAL: Pipeline-Only Execution

**ALL dry-run operations MUST be executed via pipelines ONLY.**

❌ **FORBIDDEN**: Manual execution of dry-run scripts
✅ **REQUIRED**: Pipeline-based execution

## Directory Structure

```
configs/setup/dryrun/
├── tenants/              # Dry-run tenant configurations
├── pipelines/            # Dry-run pipeline configurations
├── validation/           # Dry-run validation rules
└── README.md            # This file
```

## Usage

### Via Pipeline (CORRECT):
```bash
# Trigger via GitHub Actions or CI/CD pipeline
.github/workflows/dryrun-test.yml
```

### Manual Execution (FORBIDDEN):
```bash
# ❌ DO NOT DO THIS
python scripts/manual_dryrun.py

# ❌ DO NOT DO THIS
./scripts/run_dryrun.sh
```

## Integration

Dry-run configs are used by:
- CI/CD pipelines for pre-deployment validation
- Automated testing via `tests/configs/tenants/tenant_dryrun_config.json`
- Schema validation before production deployment

## Compliance

All dry-run operations must comply with mandates in `CLAUDE.md`:
- Pipeline-only execution
- No manual intervention
- Full audit trail
- Automated validation

---

Refer to `CLAUDE.md` for complete project mandates.
