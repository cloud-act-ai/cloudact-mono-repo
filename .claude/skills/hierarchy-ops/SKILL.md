---
name: hierarchy-ops
description: |
  Organization hierarchy management for CloudAct. Departments, projects, teams, and cost allocation.
  Use when: setting up org hierarchy, managing cost allocation, understanding hierarchy structure,
  or debugging hierarchy issues.
---

# Hierarchy Operations

## Overview
CloudAct uses a 4-level hierarchy for cost allocation: Organization → Department → Project → Team.

## Key Locations
- **Hierarchy Schema:** `02-api-service/configs/setup/organizations/onboarding/schemas/org_hierarchy.json`
- **Hierarchy Router:** `02-api-service/src/app/routers/hierarchy.py`
- **Hierarchy Docs:** `00-requirements-specs/04_HIERARCHY_ORGINIZATIONS.md`
- **Frontend Page:** `01-fronted-system/app/[orgSlug]/settings/hierarchy/`

## Hierarchy Structure
```
Organization (org_slug)
├── Department 1
│   ├── Project 1.1
│   │   ├── Team A
│   │   └── Team B
│   └── Project 1.2
│       └── Team C
└── Department 2
    └── Project 2.1
        └── Team D
```

## Hierarchy Schema
```json
{
  "table_name": "org_hierarchy",
  "schema": [
    {"name": "entity_id", "type": "STRING", "mode": "REQUIRED"},
    {"name": "entity_type", "type": "STRING", "mode": "REQUIRED"},
    {"name": "entity_name", "type": "STRING", "mode": "REQUIRED"},
    {"name": "parent_id", "type": "STRING", "mode": "NULLABLE"},
    {"name": "path", "type": "STRING", "mode": "REQUIRED"},
    {"name": "level", "type": "INTEGER", "mode": "REQUIRED"},
    {"name": "metadata", "type": "JSON", "mode": "NULLABLE"},
    {"name": "is_active", "type": "BOOLEAN", "mode": "REQUIRED"},
    {"name": "created_at", "type": "TIMESTAMP", "mode": "REQUIRED"},
    {"name": "updated_at", "type": "TIMESTAMP", "mode": "REQUIRED"},
    {"name": "version", "type": "INTEGER", "mode": "REQUIRED"}
  ]
}
```

## Entity Types
| Type | Level | Parent Type | Purpose |
|------|-------|-------------|---------|
| organization | 0 | none | Root entity |
| department | 1 | organization | Business units |
| project | 2 | department | Cost centers |
| team | 3 | project | Work groups |

## Instructions

### 1. Get Full Hierarchy
```bash
curl -s "http://localhost:8000/api/v1/hierarchy/{org_slug}" \
  -H "X-API-Key: {org_api_key}" | python3 -m json.tool
```

Response:
```json
{
  "org_slug": "acme_corp",
  "hierarchy": [
    {
      "entity_id": "dept-001",
      "entity_type": "department",
      "entity_name": "Engineering",
      "children": [
        {
          "entity_id": "proj-001",
          "entity_type": "project",
          "entity_name": "Platform",
          "children": [
            {
              "entity_id": "team-001",
              "entity_type": "team",
              "entity_name": "Backend Team"
            }
          ]
        }
      ]
    }
  ]
}
```

### 2. Create Department
```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/{org_slug}/departments" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering",
    "metadata": {
      "cost_center": "ENG-001",
      "manager": "jane@acme.com"
    }
  }'
```

### 3. Create Project Under Department
```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/{org_slug}/projects" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Platform",
    "department_id": "dept-001",
    "metadata": {
      "budget": 100000,
      "currency": "USD"
    }
  }'
```

### 4. Create Team Under Project
```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/{org_slug}/teams" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Backend Team",
    "project_id": "proj-001",
    "metadata": {
      "lead": "john@acme.com",
      "size": 5
    }
  }'
```

### 5. Query Hierarchy in BigQuery
```sql
-- Get full hierarchy tree
WITH RECURSIVE hierarchy_tree AS (
  SELECT
    entity_id,
    entity_type,
    entity_name,
    parent_id,
    path,
    level,
    0 as depth
  FROM `{org_slug}_prod.org_hierarchy`
  WHERE parent_id IS NULL
    AND is_active = TRUE

  UNION ALL

  SELECT
    h.entity_id,
    h.entity_type,
    h.entity_name,
    h.parent_id,
    h.path,
    h.level,
    ht.depth + 1
  FROM `{org_slug}_prod.org_hierarchy` h
  JOIN hierarchy_tree ht ON h.parent_id = ht.entity_id
  WHERE h.is_active = TRUE
)
SELECT * FROM hierarchy_tree
ORDER BY path;
```

### 6. Assign Subscription to N-Level Hierarchy
```bash
# Update subscription with N-level hierarchy mapping
curl -X PUT "http://localhost:8000/api/v1/subscriptions/{org_slug}/plans/{plan_id}" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "hierarchy_entity_id": "team-001",
    "hierarchy_entity_name": "Backend Team",
    "hierarchy_level_code": "team",
    "hierarchy_path": "/dept-001/proj-001/team-001",
    "hierarchy_path_names": "Engineering > Platform > Backend Team"
  }'
```

### 7. Get Costs by Hierarchy
```sql
-- Costs by hierarchy entity (N-level)
SELECT
    x_hierarchy_entity_name as entity,
    x_hierarchy_level_code as level,
    x_hierarchy_path_names as path,
    SUM(EffectiveCost) as total_cost,
    currency
FROM `{org_slug}_prod.cost_data_standard_1_3`
WHERE x_hierarchy_entity_id IS NOT NULL
GROUP BY x_hierarchy_entity_name, x_hierarchy_level_code, x_hierarchy_path_names, currency
ORDER BY total_cost DESC;

-- Costs by hierarchy path prefix (all under a department)
SELECT
    x_hierarchy_path_names as path,
    SUM(EffectiveCost) as total_cost
FROM `{org_slug}_prod.cost_data_standard_1_3`
WHERE x_hierarchy_path LIKE '/dept-001/%'
GROUP BY x_hierarchy_path_names
ORDER BY total_cost DESC;
```

## Path Format (N-Level Hierarchy)
```
/dept-001/proj-001/team-001
 └──────┘ └──────┘ └──────┘
   L1       L2       L3
   (any configurable level names)
```

## Version History
Every hierarchy change creates a new version:
```sql
-- Get version history for entity
SELECT
    entity_id,
    entity_name,
    version,
    created_at,
    updated_at
FROM `{org_slug}_prod.org_hierarchy`
WHERE entity_id = 'dept-001'
ORDER BY version DESC;
```

## Frontend Hierarchy Page
```tsx
// app/[orgSlug]/settings/hierarchy/page.tsx
export default function HierarchyPage({ params }: PageProps) {
  return (
    <div className="space-y-6">
      <h1>Organization Hierarchy</h1>
      <HierarchyTree orgSlug={params.orgSlug} />
      <AddEntityForm />
    </div>
  )
}
```

## Validation Rules
| Rule | Description |
|------|-------------|
| H001 | Department must have unique name |
| H002 | Project must belong to department |
| H003 | Team must belong to project |
| H004 | Cannot delete entity with children |
| H005 | Path must match parent chain |

## Validation Checklist
- [ ] Hierarchy created for org
- [ ] All levels populated
- [ ] Subscriptions mapped to hierarchy
- [ ] Costs allocated correctly
- [ ] Version history working
- [ ] Frontend displays tree

## Common Issues
| Issue | Solution |
|-------|----------|
| Orphaned entity | Check parent_id exists |
| Path mismatch | Regenerate paths |
| Missing costs | Map subscription to hierarchy |
| Duplicate names | Use unique names per level |

## Example Prompts

```
# Creating Structure
"Create Engineering department"
"Add Platform project under Engineering"
"Create Backend team"

# Viewing Hierarchy
"Show full org hierarchy"
"List all departments"
"Get teams under Platform project"

# Cost Allocation
"Assign subscription to Engineering dept"
"Allocate costs to Backend team"
"Show costs by department"

# Management
"Move team to different project"
"Rename department"
"Deactivate old team"

# Troubleshooting
"Costs not showing for department"
"Hierarchy path mismatch error"
```

## Related Skills
- `cost-analysis` - Hierarchy-based cost analysis
- `bootstrap-onboard` - Initial hierarchy setup
- `frontend-dev` - Hierarchy UI patterns
