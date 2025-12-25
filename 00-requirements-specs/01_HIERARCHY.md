# Organizational Hierarchy

**Status**: IMPLEMENTED (v1.0) | **Updated**: 2025-12-25 | **Single Source of Truth**

> Cost allocation hierarchy for departments, projects, and teams
> Stored per-org in BigQuery (`{org_slug}_prod.org_hierarchy`)
> CSV import/export for bulk operations

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{org_slug}` | Organization identifier | `acme_corp` |
| `{entity_type}` | Hierarchy level | `department`, `project`, `team` |
| `{entity_id}` | Unique entity identifier | `DEPT-001`, `PROJ-001`, `TEAM-001` |
| `{dept_id}` | Department identifier | `DEPT-001` |
| `{project_id}` | Project identifier | `PROJ-001` |
| `{team_id}` | Team identifier | `TEAM-001` |

---

## Terminology

| Term | Definition | Example | Storage |
|------|------------|---------|---------|
| **Department** | Top-level organizational unit | Engineering, Sales | BigQuery `org_hierarchy` |
| **Project** | Work unit under a department | Platform, Mobile App | BigQuery `org_hierarchy` |
| **Team** | Group under a project | Backend, Frontend | BigQuery `org_hierarchy` |
| **Owner** | Person responsible for entity | John Doe | `owner_id`, `owner_name`, `owner_email` |
| **Hierarchy Path** | Full path from dept to team | Engineering > Platform > Backend | Computed |

---

## Hierarchy Structure

```
                    STRICT HIERARCHY

    Organization (implicit - org_slug)
            │
            ├── Department (DEPT-001: Engineering)
            │       │
            │       ├── Project (PROJ-001: Platform)
            │       │       │
            │       │       ├── Team (TEAM-001: Backend)
            │       │       └── Team (TEAM-002: Frontend)
            │       │
            │       └── Project (PROJ-002: Mobile)
            │               │
            │               └── Team (TEAM-003: iOS)
            │
            └── Department (DEPT-002: Sales)
                    │
                    └── Project (PROJ-003: Enterprise)
                            │
                            └── Team (TEAM-004: APAC)
```

**Rules:**
- Every Project MUST belong to a Department
- Every Team MUST belong to a Project
- Departments have no parent (top-level)
- Deletion blocked if entity has children or subscription references

---

## Where Data Lives

| Storage | Table | What |
|---------|-------|------|
| BigQuery | `{org_slug}_prod.org_hierarchy` | All hierarchy entities |
| BigQuery | `{org_slug}_prod.saas_subscription_plans` | References via `hierarchy_dept_id`, `hierarchy_project_id`, `hierarchy_team_id` |

---

## BigQuery Schema

**Table:** `org_hierarchy`

| Field | Type | Mode | Description |
|-------|------|------|-------------|
| `org_slug` | STRING | REQUIRED | Organization identifier |
| `entity_type` | STRING | REQUIRED | `department`, `project`, `team` |
| `entity_id` | STRING | REQUIRED | Unique ID (e.g., DEPT-001) |
| `entity_name` | STRING | REQUIRED | Display name |
| `parent_id` | STRING | NULLABLE | Parent entity ID |
| `parent_type` | STRING | NULLABLE | Parent entity type |
| `dept_id` | STRING | NULLABLE | Department ID (denormalized) |
| `dept_name` | STRING | NULLABLE | Department name (denormalized) |
| `project_id` | STRING | NULLABLE | Project ID (denormalized) |
| `project_name` | STRING | NULLABLE | Project name (denormalized) |
| `team_id` | STRING | NULLABLE | Team ID (denormalized) |
| `team_name` | STRING | NULLABLE | Team name (denormalized) |
| `owner_id` | STRING | NULLABLE | Owner user ID |
| `owner_name` | STRING | NULLABLE | Owner display name |
| `owner_email` | STRING | NULLABLE | Owner email |
| `description` | STRING | NULLABLE | Entity description |
| `metadata` | JSON | NULLABLE | Custom metadata |
| `is_active` | BOOLEAN | REQUIRED | Active status |
| `created_at` | TIMESTAMP | REQUIRED | Creation timestamp |
| `created_by` | STRING | REQUIRED | Creator user ID |
| `updated_at` | TIMESTAMP | NULLABLE | Last update timestamp |
| `updated_by` | STRING | NULLABLE | Last updater user ID |
| `version` | INTEGER | REQUIRED | Version number |
| `end_date` | TIMESTAMP | NULLABLE | Soft delete timestamp |

**Schema Location:** `02-api-service/configs/setup/organizations/onboarding/schemas/org_hierarchy.json`

---

## Lifecycle

| Stage | What Happens | State |
|-------|--------------|-------|
| **Table Created** | Org onboarding creates empty `org_hierarchy` table | Empty table |
| **Dept Created** | User creates department via UI or CSV | 1+ departments |
| **Project Created** | User creates project under a dept | 1+ projects |
| **Team Created** | User creates team under a project | 1+ teams |
| **Entity Updated** | Edit creates new version, old gets `end_date` | Version incremented |
| **Entity Deleted** | Soft delete sets `is_active=false`, `end_date=now` | Inactive |
| **CSV Import** | Bulk create/update entities | Multiple entities |
| **CSV Export** | Download all active hierarchy | CSV file |

---

## API Endpoints

**Base URL:** `http://localhost:8000/api/v1/hierarchy`

**Authentication:** `X-API-Key` header (org API key)

### List & Read

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/{org_slug}` | List all active hierarchy entities |
| GET | `/{org_slug}/tree` | Get hierarchical tree view |
| GET | `/{org_slug}/departments` | List all departments |
| GET | `/{org_slug}/departments/{dept_id}` | Get department details |
| GET | `/{org_slug}/departments/{dept_id}/projects` | List projects in department |
| GET | `/{org_slug}/projects` | List all projects |
| GET | `/{org_slug}/projects/{project_id}` | Get project details |
| GET | `/{org_slug}/projects/{project_id}/teams` | List teams in project |
| GET | `/{org_slug}/teams` | List all teams |
| GET | `/{org_slug}/teams/{team_id}` | Get team details |

### Create

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/{org_slug}/departments` | `{entity_id, entity_name, owner_*?, description?}` | Create department |
| POST | `/{org_slug}/projects` | `{entity_id, entity_name, dept_id, owner_*?, description?}` | Create project |
| POST | `/{org_slug}/teams` | `{entity_id, entity_name, project_id, owner_*?, description?}` | Create team |

### Update & Delete

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| PUT | `/{org_slug}/{entity_type}/{entity_id}` | `{entity_name?, owner_*?, description?}` | Update entity |
| GET | `/{org_slug}/{entity_type}/{entity_id}/can-delete` | - | Check if deletion allowed |
| DELETE | `/{org_slug}/{entity_type}/{entity_id}` | - | Soft delete entity |

### Import/Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/{org_slug}/template` | Download CSV template |
| POST | `/{org_slug}/import` | Import from CSV |
| GET | `/{org_slug}/export` | Export to CSV |

---

## CSV Format

### Template Headers

```csv
entity_type,entity_id,entity_name,parent_id,owner_id,owner_name,owner_email,description
```

### Example Data

```csv
entity_type,entity_id,entity_name,parent_id,owner_id,owner_name,owner_email,description
department,DEPT-001,Engineering,,,John Doe,john@example.com,Engineering department
department,DEPT-002,Sales,,,Jane Smith,jane@example.com,Sales department
project,PROJ-001,Platform,DEPT-001,,Bob Wilson,bob@example.com,Platform team project
project,PROJ-002,Mobile,DEPT-001,,Alice Brown,alice@example.com,Mobile applications
team,TEAM-001,Backend,PROJ-001,,Charlie Green,charlie@example.com,Backend development
team,TEAM-002,Frontend,PROJ-001,,Diana White,diana@example.com,Frontend development
```

### Import Rules

1. Parse CSV, validate headers
2. Sort by entity_type (departments first, then projects, then teams)
3. Validate parent references exist
4. Create/update entities with version history
5. Return import summary (created, updated, errors)

**Template Location:** `01-fronted-system/lib/seed/hierarchy_template.csv`

---

## Deletion Blocking

Before delete, check:

1. **Children exist** - Projects under department, teams under project
2. **Subscription references** - `saas_subscription_plans` with `hierarchy_dept_id`, `hierarchy_project_id`, or `hierarchy_team_id`

**Response on Block:**

```json
{
  "can_delete": false,
  "blocking_children": [
    {"entity_type": "project", "entity_id": "PROJ-001", "entity_name": "Platform"},
    {"entity_type": "project", "entity_id": "PROJ-002", "entity_name": "Mobile"}
  ],
  "blocking_subscriptions": [
    {"subscription_id": "123", "plan_name": "Slack Pro"}
  ]
}
```

---

## Frontend

### Pages

| Route | Purpose |
|-------|---------|
| `/{orgSlug}/settings/hierarchy` | Main hierarchy management page |

### Features

- **Tree View** - Visual hierarchy with expand/collapse
- **Table View** - Tabular list with filtering by type
- **Create Dialogs** - Forms for department, project, team
- **Delete Confirmation** - Shows blocking items if deletion blocked
- **CSV Import** - Upload with preview and validation
- **CSV Export** - Download all active entities
- **Template Download** - Get blank CSV template

### Navigation

- Desktop: Settings > Hierarchy (owner only)
- Mobile: Settings > Hierarchy (owner only)

### Files

| File | Purpose |
|------|---------|
| `app/[orgSlug]/settings/hierarchy/page.tsx` | Main UI component |
| `actions/hierarchy.ts` | Server actions |
| `components/dashboard-sidebar.tsx` | Desktop nav link |
| `components/mobile-nav.tsx` | Mobile nav link |

---

## Version History

When an entity is updated:

1. Query existing active record
2. Set `end_date = now()` on old record
3. Set `is_active = false` on old record
4. Create new record with:
   - Same `entity_id`
   - Incremented `version`
   - Updated fields
   - `created_at = now()`
   - `is_active = true`
   - `end_date = null`

This provides full audit trail of changes.

---

## Integration with Subscriptions

Subscription plans can reference hierarchy entities for cost allocation:

```json
{
  "plan_name": "Slack Pro",
  "hierarchy_dept_id": "DEPT-001",
  "hierarchy_project_id": "PROJ-001",
  "hierarchy_team_id": "TEAM-001"
}
```

**Display Path:** Engineering > Platform > Backend

---

## API Examples

### Create Department

```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_corp/departments" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "DEPT-001",
    "entity_name": "Engineering",
    "owner_name": "John Doe",
    "owner_email": "john@example.com",
    "description": "Engineering department"
  }'
```

### Create Project

```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_corp/projects" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "PROJ-001",
    "entity_name": "Platform",
    "dept_id": "DEPT-001",
    "owner_name": "Bob Wilson",
    "owner_email": "bob@example.com"
  }'
```

### Create Team

```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_corp/teams" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "TEAM-001",
    "entity_name": "Backend",
    "project_id": "PROJ-001",
    "owner_name": "Charlie Green",
    "owner_email": "charlie@example.com"
  }'
```

### Get Tree View

```bash
curl -X GET "http://localhost:8000/api/v1/hierarchy/acme_corp/tree" \
  -H "X-API-Key: $ORG_API_KEY"
```

**Response:**

```json
{
  "success": true,
  "tree": [
    {
      "entity_type": "department",
      "entity_id": "DEPT-001",
      "entity_name": "Engineering",
      "children": [
        {
          "entity_type": "project",
          "entity_id": "PROJ-001",
          "entity_name": "Platform",
          "children": [
            {
              "entity_type": "team",
              "entity_id": "TEAM-001",
              "entity_name": "Backend",
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

### Check Can Delete

```bash
curl -X GET "http://localhost:8000/api/v1/hierarchy/acme_corp/department/DEPT-001/can-delete" \
  -H "X-API-Key: $ORG_API_KEY"
```

### Import CSV

```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/acme_corp/import" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [
      {"entity_type": "department", "entity_id": "DEPT-003", "entity_name": "Marketing"}
    ]
  }'
```

---

## Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | `INVALID_ENTITY_TYPE` | Entity type must be department, project, or team |
| 400 | `MISSING_PARENT` | Project requires dept_id, team requires project_id |
| 400 | `PARENT_NOT_FOUND` | Referenced parent entity does not exist |
| 404 | `ENTITY_NOT_FOUND` | Entity with given ID not found |
| 409 | `DELETION_BLOCKED` | Entity has children or subscription references |
| 409 | `DUPLICATE_ENTITY_ID` | Entity ID already exists |

---

## Files Created/Modified

### Created

| File | Description |
|------|-------------|
| `02-api-service/configs/setup/organizations/onboarding/schemas/org_hierarchy.json` | BigQuery schema |
| `02-api-service/src/app/models/hierarchy_models.py` | Pydantic models |
| `02-api-service/src/core/services/hierarchy_service.py` | Service layer |
| `02-api-service/src/app/routers/hierarchy.py` | API router |
| `01-fronted-system/actions/hierarchy.ts` | Server actions |
| `01-fronted-system/app/[orgSlug]/settings/hierarchy/page.tsx` | UI page |
| `01-fronted-system/lib/seed/hierarchy_template.csv` | CSV template |

### Modified

| File | Change |
|------|--------|
| `02-api-service/configs/setup/organizations/onboarding/schemas/saas_subscription_plans.json` | Added hierarchy reference fields |
| `02-api-service/src/app/main.py` | Registered hierarchy router |
| `01-fronted-system/components/dashboard-sidebar.tsx` | Added nav link |
| `01-fronted-system/components/mobile-nav.tsx` | Added nav link |

---

## Security

- **Authentication:** All endpoints require valid org API key
- **Authorization:** Only org members can access hierarchy data
- **Role Check:** UI only shows hierarchy link to owners
- **Input Validation:** Entity IDs validated, SQL injection prevented
- **Soft Delete:** Data preserved for audit trail

---

**Last Updated:** 2025-12-25
