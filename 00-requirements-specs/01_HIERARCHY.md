# N-Level Configurable Organizational Hierarchy

**Status**: IMPLEMENTED (v2.0) | **Updated**: 2026-01-06 | **Single Source of Truth**

> Configurable cost allocation hierarchy with N-level support
> Default: Department -> Project -> Team (extensible to any structure)
> Stored centrally in BigQuery (`organizations.org_hierarchy`)

---

## Overview

The hierarchy system supports **configurable levels** - organizations can define their own structure beyond the default 3 levels. Each level is configured in `hierarchy_levels` and entities are stored in `org_hierarchy`.

**Key Features:**
- Configurable hierarchy depth (1-10 levels)
- Materialized path for fast subtree queries
- Level configuration per organization
- Move entities between parents
- Version history for audit trail

---

## Hierarchy Structure

### Default Configuration (3 Levels)

```
Organization (implicit via org_slug)
    │
    ├── Level 1: Department (DEPT-001: Engineering)
    │       │
    │       ├── Level 2: Project (PROJ-001: Platform)
    │       │       │
    │       │       ├── Level 3: Team (TEAM-001: Backend)
    │       │       └── Level 3: Team (TEAM-002: Frontend)
    │       │
    │       └── Level 2: Project (PROJ-002: Mobile)
    │               │
    │               └── Level 3: Team (TEAM-003: iOS)
    │
    └── Level 1: Department (DEPT-002: Sales)
            │
            └── Level 2: Project (PROJ-003: Enterprise)
                    │
                    └── Level 3: Team (TEAM-004: APAC)
```

### Custom Configuration Example (4 Levels)

```
Organization
    │
    ├── Level 1: Division (DIV-001: Technology)
    │       │
    │       ├── Level 2: Department (DEPT-001: Engineering)
    │       │       │
    │       │       ├── Level 3: Project (PROJ-001: Platform)
    │       │       │       │
    │       │       │       └── Level 4: Team (TEAM-001: Backend)
```

---

## Data Architecture

```
CONFIGURATION → organizations.hierarchy_levels (level definitions)
ENTITIES      → organizations.org_hierarchy (all entities)
PER-ORG VIEW  → {org_slug}_prod.x_org_hierarchy (filtered MV)
```

| Storage | Table | Purpose |
|---------|-------|---------|
| Central | `organizations.hierarchy_levels` | Level configuration per org |
| Central | `organizations.org_hierarchy` | All hierarchy entities (all orgs) |
| Per-Org | `{org_slug}_prod.x_org_hierarchy` | Materialized view (filtered, 15min refresh) |

---

## BigQuery Schemas

### `hierarchy_levels` (Level Configuration)

| Field | Type | Mode | Description |
|-------|------|------|-------------|
| `id` | STRING | REQUIRED | UUID primary key |
| `org_slug` | STRING | REQUIRED | Organization identifier |
| `level` | INTEGER | REQUIRED | Level number (1=root, 2, 3, etc.) |
| `level_code` | STRING | REQUIRED | Machine name (e.g., 'department') |
| `level_name` | STRING | REQUIRED | Display name singular ('Department') |
| `level_name_plural` | STRING | REQUIRED | Display name plural ('Departments') |
| `parent_level` | INTEGER | NULLABLE | Parent level number (NULL for root) |
| `is_required` | BOOLEAN | REQUIRED | Must have parent? |
| `is_leaf` | BOOLEAN | REQUIRED | Can have children? |
| `max_children` | INTEGER | NULLABLE | Max children per entity |
| `id_prefix` | STRING | NULLABLE | Auto-prefix for IDs ('DEPT-') |
| `id_auto_generate` | BOOLEAN | REQUIRED | Auto-generate entity IDs? |
| `metadata_schema` | JSON | NULLABLE | JSON Schema for entity metadata |
| `display_order` | INTEGER | REQUIRED | UI ordering |
| `icon` | STRING | NULLABLE | Icon identifier |
| `color` | STRING | NULLABLE | Color code |
| `is_active` | BOOLEAN | REQUIRED | Active flag |
| `created_at` | TIMESTAMP | REQUIRED | Creation time |
| `created_by` | STRING | REQUIRED | Creator |
| `updated_at` | TIMESTAMP | NULLABLE | Update time |
| `updated_by` | STRING | NULLABLE | Updater |

### `org_hierarchy` (Entities)

| Field | Type | Mode | Description |
|-------|------|------|-------------|
| `id` | STRING | REQUIRED | UUID primary key |
| `org_slug` | STRING | REQUIRED | Organization identifier |
| `entity_id` | STRING | REQUIRED | Unique entity ID (e.g., DEPT-001) |
| `entity_name` | STRING | REQUIRED | Display name |
| `level` | INTEGER | REQUIRED | Level number |
| `level_code` | STRING | REQUIRED | Level code from config |
| `parent_id` | STRING | NULLABLE | Parent entity ID |
| `path` | STRING | REQUIRED | Materialized path ('/DEPT-001/PROJ-001') |
| `path_ids` | STRING[] | REPEATED | Ancestor IDs from root |
| `path_names` | STRING[] | REPEATED | Ancestor names from root |
| `depth` | INTEGER | REQUIRED | Tree depth (0=root) |
| `owner_id` | STRING | NULLABLE | Owner/leader user ID |
| `owner_name` | STRING | NULLABLE | Owner display name |
| `owner_email` | STRING | NULLABLE | Owner email |
| `description` | STRING | NULLABLE | Entity description |
| `metadata` | JSON | NULLABLE | Custom attributes |
| `sort_order` | INTEGER | NULLABLE | Custom sort order |
| `is_active` | BOOLEAN | REQUIRED | Active flag |
| `created_at` | TIMESTAMP | REQUIRED | Creation time |
| `created_by` | STRING | REQUIRED | Creator |
| `updated_at` | TIMESTAMP | NULLABLE | Update time |
| `updated_by` | STRING | NULLABLE | Updater |
| `version` | INTEGER | REQUIRED | Version number |
| `end_date` | TIMESTAMP | NULLABLE | End time (NULL=current) |

---

## API Endpoints

### Level Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/hierarchy/{org}/levels` | List configured levels |
| GET | `/api/v1/hierarchy/{org}/levels/{level}` | Get level by number |
| POST | `/api/v1/hierarchy/{org}/levels` | Create new level |
| PUT | `/api/v1/hierarchy/{org}/levels/{level}` | Update level |
| DELETE | `/api/v1/hierarchy/{org}/levels/{level}` | Delete level (soft) |
| POST | `/api/v1/hierarchy/{org}/levels/seed` | Seed default levels |

### Entity CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/hierarchy/{org}` | List all entities |
| GET | `/api/v1/hierarchy/{org}/tree` | Get tree structure |
| GET | `/api/v1/hierarchy/{org}/entities/{id}` | Get entity by ID |
| POST | `/api/v1/hierarchy/{org}/entities` | Create entity |
| PUT | `/api/v1/hierarchy/{org}/entities/{id}` | Update entity |
| DELETE | `/api/v1/hierarchy/{org}/entities/{id}` | Delete entity (soft) |

### Navigation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/hierarchy/{org}/entities/{id}/children` | Get direct children |
| GET | `/api/v1/hierarchy/{org}/entities/{id}/ancestors` | Get ancestor chain |
| GET | `/api/v1/hierarchy/{org}/entities/{id}/descendants` | Get all descendants |
| POST | `/api/v1/hierarchy/{org}/entities/{id}/move` | Move to new parent |
| GET | `/api/v1/hierarchy/{org}/entities/{id}/can-delete` | Check if deletable |

---

## Usage Examples

### Seed Default Levels (New Org)

```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_inc/levels/seed" \
  -H "X-API-Key: $ORG_API_KEY"
```

### Create Entity

```bash
# Create department (level 1 - no parent)
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_inc/entities" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "DEPT-001",
    "entity_name": "Engineering",
    "level_code": "department",
    "owner_name": "John Doe",
    "owner_email": "john@example.com"
  }'

# Create project (level 2 - requires department parent)
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_inc/entities" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "PROJ-001",
    "entity_name": "Platform",
    "level_code": "project",
    "parent_id": "DEPT-001",
    "owner_name": "Jane Smith"
  }'

# Create team (level 3 - requires project parent)
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_inc/entities" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "TEAM-001",
    "entity_name": "Backend",
    "level_code": "team",
    "parent_id": "PROJ-001"
  }'
```

### Get Hierarchy Tree

```bash
curl "http://localhost:8000/api/v1/hierarchy/acme_inc/tree" \
  -H "X-API-Key: $ORG_API_KEY"
```

Response:
```json
{
  "org_slug": "acme_inc",
  "levels": [...],
  "roots": [
    {
      "entity_id": "DEPT-001",
      "entity_name": "Engineering",
      "level": 1,
      "level_code": "department",
      "level_name": "Department",
      "path": "/DEPT-001",
      "children": [
        {
          "entity_id": "PROJ-001",
          "entity_name": "Platform",
          "path": "/DEPT-001/PROJ-001",
          "children": [
            {
              "entity_id": "TEAM-001",
              "entity_name": "Backend",
              "path": "/DEPT-001/PROJ-001/TEAM-001",
              "children": []
            }
          ]
        }
      ]
    }
  ],
  "stats": {
    "department": 1,
    "project": 1,
    "team": 1,
    "total": 3
  }
}
```

### Move Entity

```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_inc/entities/PROJ-001/move" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"new_parent_id": "DEPT-002"}'
```

### Add Custom Level (4th Level)

```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_inc/levels" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "level": 4,
    "level_code": "squad",
    "level_name": "Squad",
    "level_name_plural": "Squads",
    "parent_level": 3,
    "is_required": true,
    "is_leaf": true,
    "id_prefix": "SQUAD-"
  }'
```

---

## Constraints & Rules

| Rule | Description |
|------|-------------|
| **Parent Required** | Non-root levels must have a parent at `parent_level` |
| **Leaf Enforcement** | Leaf levels cannot have children |
| **Max Children** | If `max_children` set, enforced on create |
| **Delete Blocking** | Cannot delete with children or subscription references |
| **Unique Entity ID** | Entity IDs must be unique within org |
| **Path Integrity** | Paths auto-update when entities move |
| **Version History** | All changes create new version row |

---

## Integration with Cost Allocation

Subscription plans reference hierarchy entities:

```sql
-- subscription_plans table
hierarchy_dept_id     -- References department entity_id
hierarchy_dept_name   -- Denormalized name
hierarchy_project_id  -- References project entity_id
hierarchy_project_name
hierarchy_team_id     -- References team entity_id
hierarchy_team_name
```

**Note:** These fields reference `entity_id` values from `org_hierarchy`, not the generic `level_code`. For N-level support beyond 3 levels, additional integration may be needed.

---

## Files

| File | Purpose |
|------|---------|
| `02-api-service/configs/setup/bootstrap/schemas/hierarchy_levels.json` | Level config schema |
| `02-api-service/configs/setup/bootstrap/schemas/org_hierarchy.json` | Entity schema |
| `02-api-service/src/app/models/hierarchy_models.py` | Pydantic models |
| `02-api-service/src/core/services/hierarchy_crud/service.py` | Entity CRUD service |
| `02-api-service/src/core/services/hierarchy_crud/level_service.py` | Level config service |
| `02-api-service/src/core/services/hierarchy_crud/path_utils.py` | Path utilities |
| `02-api-service/src/app/routers/hierarchy.py` | API endpoints |
| `02-api-service/configs/setup/organizations/onboarding/views/x_org_hierarchy_mv.sql` | MV definition |

---

**Version History:**
- v2.0 (2026-01-06): N-level configurable hierarchy, removed CSV import/export
- v1.0 (2025-12-25): Fixed 3-level hierarchy (Dept -> Project -> Team)
