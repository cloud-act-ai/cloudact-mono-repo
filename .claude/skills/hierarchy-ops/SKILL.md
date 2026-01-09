---
name: hierarchy-ops
description: |
  Organization hierarchy management (Dept/Project/Team). Cost allocation and structure.
  Use when: setting up hierarchy, mapping costs, viewing org structure, debugging hierarchy.
---

# Hierarchy Operations

## Structure
Organization → Department → Project → Team (4-level hierarchy for cost allocation)

## Data Architecture
```
WRITES → organizations.org_hierarchy (central table)
READS  → {org_slug}_prod.x_org_hierarchy (materialized view, 15min refresh)
```

## Files
- Schema: `02-api-service/configs/setup/organizations/onboarding/schemas/org_hierarchy.json`
- Router: `02-api-service/src/app/routers/hierarchy.py`
- Service: `02-api-service/src/core/services/hierarchy_crud/`
- Frontend: `01-fronted-system/app/[orgSlug]/settings/hierarchy/`

## Key Endpoints

```bash
# List/Tree View
GET /api/v1/hierarchy/{org}       # Flat list
GET /api/v1/hierarchy/{org}/tree  # Tree structure

# CRUD
POST   /api/v1/hierarchy/{org}/entities
PUT    /api/v1/hierarchy/{org}/entities/{id}
DELETE /api/v1/hierarchy/{org}/entities/{id}

# Seed default levels (DEPT/PROJ/TEAM)
POST /api/v1/hierarchy/{org}/levels/seed
```

## Entity ID Format
```
{PREFIX}{CODE}
Examples: DEPT-CFO, PROJ-ENGINEERING, TEAM-PLATFORM
```

## Cost Allocation Fields (in cost_data_standard_1_3)
```
x_hierarchy_entity_id       # TEAM-001
x_hierarchy_entity_name     # Backend Team
x_hierarchy_level_code      # team
x_hierarchy_path            # /DEPT-CFO/PROJ-CTO/TEAM-PLAT
x_hierarchy_path_names      # CFO > Engineering > Platform
```

## Default Template (20 entities)
```
lib/seed/hierarchy_template.csv
├── 4 Departments: DEPT-CFO, DEPT-CIO, DEPT-COO, DEPT-BIZ
├── 7 Projects:    PROJ-BU1, PROJ-CTO, PROJ-ITCOO, ...
└── 9 Teams:       TEAM-PLAT, TEAM-ARCH, TEAM-INFRA, ...
```

## Common Operations

**View hierarchy:**
```bash
curl "http://localhost:8000/api/v1/hierarchy/{org}/tree" -H "X-API-Key: $KEY"
```

**Create entity:**
```bash
curl -X POST "http://localhost:8000/api/v1/hierarchy/{org}/entities" \
  -H "X-API-Key: $KEY" -d '{
    "entity_code": "ENGINEERING",
    "entity_name": "Engineering",
    "level_code": "department",
    "parent_entity_id": null
  }'
```

**Map subscription to hierarchy:**
```bash
curl -X PUT "http://localhost:8000/api/v1/subscriptions/{org}/plans/{id}" \
  -H "X-API-Key: $KEY" -d '{
    "hierarchy_entity_id": "TEAM-PLAT",
    "hierarchy_path": "/DEPT-CTO/PROJ-ENG/TEAM-PLAT"
  }'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Missing hierarchy view | Run org dataset sync |
| Orphaned entity | Verify parent_id exists |
| Costs not showing | Map subscriptions to hierarchy entities |
| Path mismatch | Check parent chain consistency |
