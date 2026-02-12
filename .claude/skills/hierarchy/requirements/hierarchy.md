# Hierarchy - Requirements

## Overview

N-level configurable organizational hierarchy with custom levels, full CRUD, ancestor/descendant traversal, CSV import/export, and cost allocation via the 5-field `x_hierarchy_*` model. Supports default 3-tier (Department/Project/Team) and custom enterprise structures.

## Source Specification

`01_HIERARCHY.md` (v2.2 | 2026-02-08)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Hierarchy Data Flow                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Frontend (3000)              API Service (8000)           BigQuery          │
│  ──────────────               ──────────────────           ────────          │
│                                                                             │
│  Settings UI ──────────────▶ Levels API ──────────────▶ organizations       │
│  /settings/hierarchy         POST /hierarchy/{org}/       .hierarchy_levels │
│                              levels/seed                                    │
│                                                                             │
│  Entity CRUD ──────────────▶ Entities API ────────────▶ organizations       │
│  Create/Edit/Move/Delete     POST/PUT/DELETE              .org_hierarchy    │
│                              /hierarchy/{org}/entities                      │
│                                                                             │
│  Tree View ◀───────────────── Tree API ◀──────────────── {org}_prod        │
│  /settings/hierarchy         GET /hierarchy/{org}/tree    .x_org_hierarchy  │
│                                                           (materialized     │
│  CSV Import/Export ────────▶ Import API ──────────────▶    view, 15min      │
│                              POST /hierarchy/{org}/        refresh)         │
│                              import                                         │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  N-Level Hierarchy Structure                                                │
│  ───────────────────────────                                                │
│                                                                             │
│  Org (root)                                                                 │
│   ├── DEPT-001 (Department)     ── level_code: department, order: 1         │
│   │    ├── PROJ-001 (Project)   ── level_code: project, order: 2            │
│   │    │    ├── TEAM-001        ── level_code: team, order: 3               │
│   │    │    └── TEAM-002                                                    │
│   │    └── PROJ-002                                                         │
│   └── DEPT-002                                                              │
│        └── PROJ-003                                                         │
│             └── TEAM-003                                                    │
│                                                                             │
│  Materialized Path: /DEPT-001/PROJ-001/TEAM-001                             │
│  Path Names:        /Engineering/Platform/Backend                           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cost Allocation (5 x_hierarchy_* fields in cost tables)                    │
│  ───────────────────────────────────────────────────────                     │
│                                                                             │
│  cost_data_standard_1_3                                                     │
│   ├── x_hierarchy_entity_id    = "TEAM-003"                                 │
│   ├── x_hierarchy_entity_name  = "Backend"                                  │
│   ├── x_hierarchy_level_code   = "team"                                     │
│   ├── x_hierarchy_path         = "/DEPT-001/PROJ-001/TEAM-003"              │
│   └── x_hierarchy_path_names   = "/Engineering/Platform/Backend"            │
│                                                                             │
│  Rollup: WHERE x_hierarchy_path LIKE '/DEPT-001/%'  -- all under Dept      │
│                                                                             │
│  Pipeline Service (8001)                                                    │
│   └── Refresh: x_org_hierarchy materialized view on pipeline runs           │
│       (central org_hierarchy -> per-org x_org_hierarchy copy)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Functional Requirements

### FR-HIER-001: Hierarchy Workflow

1. Org onboarded -> Default hierarchy levels seeded (Department/Project/Team)
2. Admin customizes levels via levels API
3. Admin creates entities via entities API
4. Entities stored in `organizations.org_hierarchy` (central write)
5. Materialized view `{org_slug}_prod.x_org_hierarchy` (read, 15min refresh)
6. Cost allocation via 5-field `x_hierarchy_*` model in cost tables
7. CSV import/export for bulk operations

### FR-HIER-002: Architecture

```
WRITES -> organizations.org_hierarchy (central, API Service)
       -> organizations.hierarchy_levels (level config)
READS  -> {org_slug}_prod.x_org_hierarchy (materialized view, 15min refresh)
```

### FR-HIER-003: N-Level Hierarchy Support

The system MUST support custom levels beyond the default 3-tier structure:

**Default (3-level):**
Org -> Department -> Project -> Team

**Enterprise (5-level):**
Org -> C-Suite -> Business Unit -> Function -> Project -> Team

**Custom:**
Org -> {any number of custom levels}

### FR-HIER-004: Level Seeding

`POST /hierarchy/{org}/levels/seed` creates default levels:

| Default Level | Code | Order |
|---------------|------|-------|
| Department | department | 1 |
| Project | project | 2 |
| Team | team | 3 |

Custom levels can be added via the levels API with custom codes and ordering.

### FR-HIER-005: API Endpoints

**Levels:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/hierarchy/{org}/levels/seed` | Seed default levels |
| GET | `/hierarchy/{org}/levels` | List all levels |

**Entities (Full CRUD):**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/hierarchy/{org}` | List all entities |
| GET | `/hierarchy/{org}/tree` | Full tree structure |
| POST | `/hierarchy/{org}/entities` | Create entity |
| PUT | `/hierarchy/{org}/entities/{id}` | Update entity |
| DELETE | `/hierarchy/{org}/entities/{id}` | Soft delete |
| POST | `/hierarchy/{org}/entities/{id}/move` | Move parent |

**Traversal:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/hierarchy/{org}/entities/{id}/ancestors` | Get all ancestors up to root |
| GET | `/hierarchy/{org}/entities/{id}/descendants` | Get all descendants recursively |
| GET | `/hierarchy/{org}/entities/{id}/children` | Get direct children only |
| GET | `/hierarchy/{org}/entities/{id}/can-delete` | Check if entity can be deleted |

**Import/Export (CSV):**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/hierarchy/{org}/export` | Export full hierarchy as CSV |
| POST | `/hierarchy/{org}/import/preview` | Preview import (validate without applying) |
| POST | `/hierarchy/{org}/import` | Import hierarchy from CSV |

### FR-HIER-006: Key Fields (org_hierarchy)

| Field | Purpose |
|-------|---------|
| `entity_id` | Unique ID (e.g., DEPT-001, PROJ-002) |
| `level_code` | department, project, team (or custom level code) |
| `parent_id` | Parent entity_id (NULL for top-level) |
| `path` | Materialized path (`/DEPT-001/PROJ-001`) |
| `end_date` | NULL = current, set = historical (soft delete) |

### FR-HIER-007: Cost Allocation Standard (x_hierarchy_* Model)

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

## Non-Functional Requirements

### NFR-HIER-001: Data Consistency

- Central writes to `organizations.org_hierarchy` ensure single source of truth
- Materialized view `x_org_hierarchy` refreshes every 15 minutes
- Soft delete via `end_date` preserves historical data

### NFR-HIER-002: Entity ID Format

- Department: `DEPT-*` prefix
- Project: `PROJ-*` prefix
- Team: `TEAM-*` prefix
- Custom levels: user-defined prefix conventions

### NFR-HIER-003: Key Implementation Files

| File | Purpose |
|------|---------|
| `02-api-service/src/core/services/hierarchy_crud/` | CRUD service |
| `02-api-service/src/app/routers/hierarchy.py` | API endpoints |
| `02-api-service/configs/setup/bootstrap/schemas/org_hierarchy.json` | Schema |

---

## SDLC

### Development Workflow

```
1. Configure Levels   ── Admin defines hierarchy levels in UI (or use defaults)
2. Create Entities    ── Add departments, projects, teams via CRUD API or CSV import
3. Assign to Costs    ── Tag cloud resources with entity_id labels
4. Pipeline Runs      ── Billing pipelines extract labels, map to x_hierarchy_* fields
5. Verify Rollup      ── Check cost rollup via tree view and cost dashboards
6. Iterate            ── Move entities, add levels, re-run pipelines
```

### Testing Approach

| Layer | Tool | Tests | Focus |
|-------|------|-------|-------|
| API Unit | pytest | `02-api-service/tests/04_test_hierarchy.py` | CRUD operations, validation, error cases |
| Traversal | pytest | Same file | Ancestor/descendant queries, path materialization |
| N-Level | pytest | Same file | Custom level creation, ordering, deep nesting |
| CSV Import/Export | pytest | Same file | Bulk operations, preview validation, roundtrip |
| View Refresh | pytest | Same file | Materialized view consistency after mutations |
| Frontend E2E | Playwright | `01-fronted-system/tests/e2e/` | Hierarchy settings page, tree rendering |

### Deployment / CI-CD Integration

- **PR Gate:** `pytest tests/04_test_hierarchy.py -v` must pass before merge
- **Stage:** Auto-deployed on push to `main`; hierarchy API smoke-tested
- **Prod:** Deployed via git tag; materialized view refresh verified post-deploy
- **Schema Changes:** Bootstrap sync job updates `org_hierarchy` / `hierarchy_levels` schemas
- **Migration:** `run-job.sh {env} bootstrap-sync` to add new columns to existing tables

---

## Cloud Resource Tagging

### Source Specification

`CLOUD_RESOURCE_TAGGING_GUIDE.md` (v1.1 | 2026-02-05)

### Overview

Guide for tagging cloud resources to enable hierarchy-based cost allocation in CloudAct. Resources are tagged with hierarchy entity IDs so billing pipeline data can be matched to the organizational hierarchy.

### FR-TAG-001: Tagging Workflow

1. Set up hierarchy in CloudAct (Departments, Projects, Teams)
2. Note entity IDs (DEPT-001, PROJ-002, TEAM-INFRA, etc.)
3. Apply labels/tags to cloud resources using entity_id as primary label
4. Run billing pipeline -- labels extracted from billing export
5. Cost allocation -- labels matched to hierarchy entities
6. Dashboard shows costs broken down by department/project/team

### FR-TAG-002: Supported Label Keys (Priority Order)

| Priority | Label Key | Example | Use |
|----------|-----------|---------|-----|
| 1 | `entity_id` | `TEAM-INFRA` | Direct CloudAct hierarchy entity |
| 2 | `cost_center` | `DEPT-CIO` | Department-level allocation |
| 3 | `team` | `TEAM-DATA` | Team-level allocation |
| 4 | `department` | `DEPT-CFO` | Department fallback |

**Recommendation:** Use `entity_id` with your CloudAct hierarchy entity ID for most accurate cost allocation.

### FR-TAG-003: Provider Tagging Standards

| Provider | Label Format | Applies To |
|----------|-------------|------------|
| GCP | `--labels=entity_id=VALUE` | Compute, Storage, BigQuery, GKE |
| AWS | `Key=entity_id,Value=VALUE` | EC2, S3, RDS, Lambda |
| Azure | `--tags entity_id=VALUE` | Resource groups, VMs, Storage |
| OCI | `freeform_tags.entity_id=VALUE` | Compute, Block Storage |

### NFR-TAG-001: Tagging Standards

| Standard | Requirement |
|----------|-------------|
| Consistency | Same entity_id across all resources in a team/project |
| Case | Use uppercase for entity IDs (TEAM-INFRA, DEPT-CFO) |
| Coverage | Tag ALL billable resources for accurate allocation |
| Automation | Use IaC (Terraform, Pulumi) to enforce tagging at creation |
| Validation | CloudAct validates labels against known hierarchy entities |
