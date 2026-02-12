---
name: hierarchy
description: |
  Organization hierarchy management (Dept/Project/Team). Cost allocation and structure.
  Use when: setting up hierarchy, mapping costs, viewing org structure, debugging hierarchy.
---

# Hierarchy Operations

## Overview

CloudAct uses a **5-field hierarchy model** for cost allocation across all cost types (Cloud, GenAI, SaaS).

## 5-Field Hierarchy Model (CRITICAL)

All cost tables use these 5 fields for hierarchy tracking:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `x_hierarchy_entity_id` | STRING | Unique entity identifier | `TEAM-PLAT` |
| `x_hierarchy_entity_name` | STRING | Human-readable name | `Platform Team` |
| `x_hierarchy_level_code` | STRING | Level in hierarchy | `team` |
| `x_hierarchy_path` | STRING | Full path from root | `/DEPT-CTO/PROJ-ENG/TEAM-PLAT` |
| `x_hierarchy_path_names` | STRING | Path with names (display) | `CTO > Engineering > Platform` |

**Additional tracking field:**
- `x_hierarchy_validated_at` - TIMESTAMP when hierarchy was resolved (NULL if no match)

## Structure

**N-Level Configurable Hierarchy** (default: Organization → Department → Project → Team)

- Levels are **configurable** via `hierarchy_levels` table (level_code, level_name, id_prefix)
- Default template: Dept/Project/Team (seeded via `/levels/seed`)
- Organizations can customize level names/codes to match their structure

## Data Architecture

```
WRITES → organizations.org_hierarchy (central table)
         organizations.hierarchy_levels (level definitions)
READS  → {org_slug}_prod.x_org_hierarchy (materialized view, 15min refresh)
```

## Files

| Type | Path |
|------|------|
| Schema | `02-api-service/configs/setup/organizations/onboarding/schemas/org_hierarchy.json` |
| Router | `02-api-service/src/app/routers/hierarchy.py` |
| Service | `02-api-service/src/core/services/hierarchy_crud/` |
| Frontend | `01-fronted-system/app/[orgSlug]/settings/hierarchy/` |

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

## Default Level Configuration

| Level | level_code | level_name | id_prefix | Description |
|-------|-----------|------------|-----------|-------------|
| L1 | `department` | Department | `DEPT-` | C-Suite / Executive level |
| L2 | `project` | Project | `PROJ-` | Business Units / Cost Centers |
| L3 | `team` | Team | `TEAM-` | Functions / Teams |

**Note:** Organizations can customize these via API or directly in `hierarchy_levels` table.

## Entity ID Format

```
{PREFIX}{CODE}
Examples: DEPT-CFO, PROJ-ENGINEERING, TEAM-PLATFORM
```

## Hierarchy Resolution in Pipelines

All FOCUS 1.3 stored procedures resolve hierarchy via tag lookups:

```sql
-- Hierarchy CTE used in sp_cloud_1_convert_to_focus, sp_genai_3_convert_to_focus, etc.
WITH hierarchy_lookup AS (
  SELECT
    entity_id,
    entity_name,
    level_code,
    path,
    path_names  -- ARRAY<STRING> type
  FROM `{project_id}.organizations.org_hierarchy`
  WHERE org_slug = @v_org_slug
    AND end_date IS NULL  -- Only active entities
)
SELECT ...
  h.entity_id as x_hierarchy_entity_id,
  h.entity_name as x_hierarchy_entity_name,
  h.level_code as x_hierarchy_level_code,
  h.path as x_hierarchy_path,
  ARRAY_TO_STRING(h.path_names, ' > ') as x_hierarchy_path_names,  -- Convert array to string
  CASE WHEN h.entity_id IS NOT NULL THEN CURRENT_TIMESTAMP() ELSE NULL END as x_hierarchy_validated_at
FROM raw_data r
LEFT JOIN hierarchy_lookup h ON h.entity_id = COALESCE(
  -- Tag lookup order (case-insensitive)
  JSON_EXTRACT_SCALAR(r.tags_json, '$.cost_center'),
  JSON_EXTRACT_SCALAR(r.tags_json, '$.CostCenter'),
  JSON_EXTRACT_SCALAR(r.tags_json, '$.team'),
  JSON_EXTRACT_SCALAR(r.tags_json, '$.Team'),
  JSON_EXTRACT_SCALAR(r.tags_json, '$.department'),
  JSON_EXTRACT_SCALAR(r.tags_json, '$.Department'),
  JSON_EXTRACT_SCALAR(r.tags_json, '$.entity_id')
)
```

## Cost Allocation Flow

```
1. User tags resources in cloud provider (cost_center=TEAM-PLAT)
2. Pipeline extracts raw billing data with tags
3. FOCUS conversion procedure resolves hierarchy via tag lookup
4. cost_data_standard_1_3 contains hierarchy fields for filtering/grouping
5. Frontend displays costs by hierarchy level
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

| Issue | Cause | Solution |
|-------|-------|----------|
| Missing hierarchy view | Org dataset not synced | Run `/api/v1/admin/sync-org-datasets` |
| Orphaned entity | Parent deleted | Verify parent_id exists, fix parent chain |
| Costs not showing hierarchy | Tags don't match entity_id | Ensure cloud tags match entity IDs exactly |
| Path mismatch | Parent chain inconsistent | Rebuild path via hierarchy service |
| NULL x_hierarchy fields | No tag match found | Add proper tags to resources |
| path_names error | ARRAY vs STRING mismatch | Use `ARRAY_TO_STRING(h.path_names, ' > ')` |

## Schema Reference

**org_hierarchy table:**
```json
{
  "entity_id": "STRING, REQUIRED",      // TEAM-PLAT
  "entity_name": "STRING, REQUIRED",    // Platform Team
  "entity_code": "STRING, REQUIRED",    // PLAT
  "level_code": "STRING, REQUIRED",     // team
  "parent_entity_id": "STRING",         // PROJ-ENG
  "org_slug": "STRING, REQUIRED",       // acme_corp
  "path": "STRING",                     // /DEPT-CTO/PROJ-ENG/TEAM-PLAT
  "path_names": "ARRAY<STRING>",        // ["CTO", "Engineering", "Platform"]
  "start_date": "DATE, REQUIRED",       // When entity became active
  "end_date": "DATE"                    // NULL = active, date = soft-deleted
}
```

## Source Specifications

Requirements consolidated from:
- `01_HIERARCHY.md` - Organization hierarchy model and cost allocation
- `CLOUD_RESOURCE_TAGGING_GUIDE.md` - Cloud resource tagging for hierarchy resolution

## Related Skills

- `pipeline-ops` - Pipeline execution that uses hierarchy
- `cost-analysis` - Cost queries by hierarchy
- `subscription-costs` - Subscription cost allocation
