# Organizational Hierarchy

**v2.2** | 2026-02-08

> N-level configurable hierarchy with custom levels, import/export, and ancestor/descendant traversal

---

## Workflow

```
1. Org onboarded → Default hierarchy levels seeded (Dept/Project/Team)
2. Admin customizes levels → POST /hierarchy/{org}/levels/seed (or custom levels)
3. Admin creates entities → POST /hierarchy/{org}/entities
4. Entities stored → organizations.org_hierarchy (central write)
5. Materialized view → {org_slug}_prod.x_org_hierarchy (read, 15min refresh)
6. Cost allocation → 5-field x_hierarchy_* model in cost tables
7. Import/Export → CSV bulk operations for hierarchy data
```

---

## Architecture

```
WRITES → organizations.org_hierarchy (central, API Service)
       → organizations.hierarchy_levels (level config)
READS  → {org_slug}_prod.x_org_hierarchy (materialized view, 15min refresh)
```

---

## N-Level Hierarchy

Supports custom levels beyond the default 3-tier structure. Common configurations:

```
Default (3-level):
  Org → Department → Project → Team

Enterprise (5-level):
  Org → C-Suite → Business Unit → Function → Project → Team

Custom:
  Org → {any number of custom levels}
```

### Level Seeding

`POST /hierarchy/{org}/levels/seed` creates default levels. Custom levels can be added via the levels API.

| Default Level | Code | Order |
|---------------|------|-------|
| Department | department | 1 |
| Project | project | 2 |
| Team | team | 3 |

| Example Custom Level | Code | Order |
|-----------------------|------|-------|
| C-Suite | c_suite | 1 |
| Business Unit | business_unit | 2 |
| Function | function | 3 |
| Project | project | 4 |
| Team | team | 5 |

---

## API Endpoints (Port 8000)

### Levels

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/hierarchy/{org}/levels/seed` | Seed default levels |
| GET | `/hierarchy/{org}/levels` | List all levels |

### Entities (Full CRUD)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/hierarchy/{org}` | List all entities |
| GET | `/hierarchy/{org}/tree` | Full tree structure |
| POST | `/hierarchy/{org}/entities` | Create entity |
| PUT | `/hierarchy/{org}/entities/{id}` | Update entity |
| DELETE | `/hierarchy/{org}/entities/{id}` | Soft delete |
| POST | `/hierarchy/{org}/entities/{id}/move` | Move parent |

### Traversal

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/hierarchy/{org}/entities/{id}/ancestors` | Get all ancestors up to root |
| GET | `/hierarchy/{org}/entities/{id}/descendants` | Get all descendants recursively |
| GET | `/hierarchy/{org}/entities/{id}/children` | Get direct children only |
| GET | `/hierarchy/{org}/entities/{id}/can-delete` | Check if entity can be deleted |

### Import/Export (CSV)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/hierarchy/{org}/export` | Export full hierarchy as CSV |
| POST | `/hierarchy/{org}/import/preview` | Preview import (validate without applying) |
| POST | `/hierarchy/{org}/import` | Import hierarchy from CSV |

---

## Key Fields (org_hierarchy)

| Field | Purpose |
|-------|---------|
| `entity_id` | Unique ID (e.g., DEPT-001, PROJ-002) |
| `level_code` | department, project, team (or custom level code) |
| `parent_id` | Parent entity_id (NULL for top-level) |
| `path` | Materialized path (`/DEPT-001/PROJ-001`) |
| `end_date` | NULL = current, set = historical (soft delete) |

---

## Cost Allocation Standard (x_hierarchy_* Model)

Cost tables use a 5-field hierarchy model for allocation and rollup queries:

| Field | Purpose |
|-------|---------|
| `x_hierarchy_entity_id` | Direct entity reference (e.g., `TEAM-003`) |
| `x_hierarchy_entity_name` | Human-readable entity name |
| `x_hierarchy_level_code` | Level of the entity (e.g., `team`, `project`) |
| `x_hierarchy_path` | Materialized path for rollup (`/DEPT-001/PROJ-001/TEAM-003`) |
| `x_hierarchy_path_names` | Human-readable path (`/Engineering/Platform/Backend`) |

These fields appear in `cost_data_standard_1_3` and subscription cost tables, enabling:
- Direct cost lookup by entity
- Rollup aggregation via path prefix matching
- Human-readable reporting via path_names

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/core/services/hierarchy_crud/` | CRUD service |
| `02-api-service/src/app/routers/hierarchy.py` | API endpoints |
| `02-api-service/configs/setup/bootstrap/schemas/org_hierarchy.json` | Schema |
