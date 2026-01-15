# Organizational Hierarchy

**v2.0** | 2026-01-15

> N-level configurable: Org → Department → Project → Team (extensible)

---

## Architecture

```
WRITES → organizations.org_hierarchy (central)
       → organizations.hierarchy_levels (level config)
READS  → {org_slug}_prod.x_org_hierarchy (materialized view, 15min refresh)
```

---

## Default Structure

```
Org (implicit)
├── L1: Department (DEPT-001)
│   └── L2: Project (PROJ-001)
│       └── L3: Team (TEAM-001)
```

---

## API Endpoints (Port 8000)

```bash
# Levels
POST /api/v1/hierarchy/{org}/levels/seed    # Seed defaults
GET  /api/v1/hierarchy/{org}/levels         # List levels

# Entities
GET  /api/v1/hierarchy/{org}                # List all
GET  /api/v1/hierarchy/{org}/tree           # Tree structure
POST /api/v1/hierarchy/{org}/entities       # Create
PUT  /api/v1/hierarchy/{org}/entities/{id}  # Update
DELETE /api/v1/hierarchy/{org}/entities/{id} # Soft delete
POST /api/v1/hierarchy/{org}/entities/{id}/move # Move parent
```

---

## Key Fields (org_hierarchy)

| Field | Purpose |
|-------|---------|
| `entity_id` | Unique ID (DEPT-001) |
| `level_code` | department, project, team |
| `parent_id` | Parent entity_id |
| `path` | Materialized path (/DEPT-001/PROJ-001) |
| `end_date` | NULL = current, set = historical |

---

## Cost Allocation

Subscriptions link via `hierarchy_entity_id`, `hierarchy_path` → flows to `cost_data_standard_1_3`

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/core/services/hierarchy_crud/` | CRUD service |
| `02-api-service/src/app/routers/hierarchy.py` | API endpoints |
| `02-api-service/configs/setup/bootstrap/schemas/org_hierarchy.json` | Schema |
