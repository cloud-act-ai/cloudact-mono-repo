# Organizational Hierarchy

**v2.1** | 2026-02-05

> N-level configurable: Org → Department → Project → Team (extensible)

---

## Workflow

```
1. Org onboarded → Default hierarchy levels seeded (Dept/Project/Team)
2. Admin creates entities → POST /hierarchy/{org}/entities
3. Entities stored → organizations.org_hierarchy (central write)
4. Materialized view → {org_slug}_prod.x_org_hierarchy (read, 15min refresh)
5. Subscriptions linked → hierarchy_entity_id, hierarchy_path
6. Cost allocation → Flows through to cost_data_standard_1_3
```

---

## Architecture

```
WRITES → organizations.org_hierarchy (central, API Service)
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

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/hierarchy/{org}/levels/seed` | Seed default levels |
| GET | `/hierarchy/{org}/levels` | List levels |
| GET | `/hierarchy/{org}` | List all entities |
| GET | `/hierarchy/{org}/tree` | Full tree structure |
| POST | `/hierarchy/{org}/entities` | Create entity |
| PUT | `/hierarchy/{org}/entities/{id}` | Update entity |
| DELETE | `/hierarchy/{org}/entities/{id}` | Soft delete |
| POST | `/hierarchy/{org}/entities/{id}/move` | Move parent |

---

## Key Fields (org_hierarchy)

| Field | Purpose |
|-------|---------|
| `entity_id` | Unique ID (e.g., DEPT-001, PROJ-002) |
| `level_code` | department, project, team |
| `parent_id` | Parent entity_id (NULL for top-level) |
| `path` | Materialized path (`/DEPT-001/PROJ-001`) |
| `end_date` | NULL = current, set = historical (soft delete) |

---

## Cost Allocation Standard

Subscriptions and resources link to hierarchy via:
- `hierarchy_entity_id` — direct entity reference
- `hierarchy_path` — materialized path for rollup queries
- Flows through to `cost_data_standard_1_3` for unified analytics

---

## Key Files

| File | Purpose |
|------|---------|
| `02-api-service/src/core/services/hierarchy_crud/` | CRUD service |
| `02-api-service/src/app/routers/hierarchy.py` | API endpoints |
| `02-api-service/configs/setup/bootstrap/schemas/org_hierarchy.json` | Schema |
