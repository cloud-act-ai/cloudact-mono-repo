# Hierarchy - Test Plan

## Overview

Validates hierarchy CRUD operations, tree structure, N-level configuration, cost allocation via the 5-field `x_hierarchy_*` model, CSV import/export, and tag-based resolution in pipelines.

## Test Matrix

### Level Management (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Seed default levels | API | POST `/hierarchy/{org}/levels/seed` returns 3 levels (department, project, team) |
| 2 | List levels | API | GET `/hierarchy/{org}/levels` returns all configured levels with order |
| 3 | Default level prefixes correct | Validation | department=`DEPT-`, project=`PROJ-`, team=`TEAM-` |
| 4 | Levels are org-scoped | Isolation | Org A levels not visible to Org B |

### Entity CRUD (8 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 5 | Create department entity | API | POST returns entity with `entity_id=DEPT-{CODE}` |
| 6 | Create project under department | API | POST returns entity with `parent_entity_id=DEPT-{CODE}` |
| 7 | Create team under project | API | POST returns entity with correct parent chain |
| 8 | Update entity name | API | PUT updates `entity_name`, path_names recalculated |
| 9 | Soft delete entity | API | DELETE sets `end_date`, entity excluded from active queries |
| 10 | Move entity to new parent | API | POST `/entities/{id}/move` updates parent and path |
| 11 | List all active entities | API | GET `/hierarchy/{org}` returns only entities with `end_date IS NULL` |
| 12 | Duplicate entity_id rejected | API | POST with existing entity_id returns 409 Conflict |
| 12a | API response includes end_date | API | GET entity returns `end_date: null` for active, date string for soft-deleted |

### Tree Structure (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 13 | Get full tree structure | API | GET `/hierarchy/{org}/tree` returns nested tree |
| 14 | Tree root nodes are departments | Validation | Top-level nodes have `level_code=department` |
| 15 | Path calculation correct | Validation | Entity path is `/DEPT-{X}/PROJ-{Y}/TEAM-{Z}` |
| 16 | Path names calculated correctly | Validation | `path_names` is array of human-readable names |
| 17 | Tree excludes soft-deleted entities | Validation | Entities with `end_date` not in tree response |

### Traversal (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 18 | Get ancestors of team | API | GET `/entities/{id}/ancestors` returns project and department |
| 19 | Get descendants of department | API | GET `/entities/{id}/descendants` returns all projects and teams |
| 20 | Get direct children only | API | GET `/entities/{id}/children` returns immediate children |
| 21 | Can-delete check (no children) | API | GET `/entities/{id}/can-delete` returns `true` for leaf node |
| 22 | Can-delete check (has children) | API | GET `/entities/{id}/can-delete` returns `false` for parent |

### CSV Import/Export (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 23 | Export hierarchy as CSV | API | GET `/hierarchy/{org}/export` returns valid CSV file |
| 24 | Preview import validates CSV | API | POST `/hierarchy/{org}/import/preview` returns validation results |
| 25 | Import CSV creates entities | API | POST `/hierarchy/{org}/import` creates entities from CSV |
| 26 | Import rejects invalid CSV | API | POST with malformed CSV returns 400 with error details |

### Cost Allocation (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 27 | Hierarchy fields populated in FOCUS 1.3 | Query | `x_hierarchy_entity_id` populated in `cost_data_standard_1_3` |
| 28 | Tag-based resolution works | Query | Cloud resource with `entity_id=TEAM-PLAT` tag resolves to correct hierarchy |
| 29 | Fallback tag resolution order | Query | `cost_center` > `team` > `department` > `entity_id` priority |
| 30 | Untagged resources have NULL hierarchy | Query | Resources without matching tags have `NULL` hierarchy fields |
| 31 | `x_hierarchy_validated_at` set on match | Query | Timestamp populated when hierarchy match found |
| 32 | Path prefix rollup works | Query | `WHERE x_hierarchy_path LIKE '/DEPT-CFO/%'` aggregates all children |

### Materialized View (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 33 | `x_org_hierarchy` view exists | Query | Materialized view present in `{org_slug}_prod` dataset |
| 34 | View data matches central table | Query | View rows match `organizations.org_hierarchy` for org |
| 35 | View refreshes within 15 minutes | Validation | Data changes propagate to view within refresh window |

### Multi-Tenant Isolation (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 36 | Org A cannot read Org B hierarchy | Isolation | API returns only requesting org's entities |
| 37 | Org A cannot modify Org B entities | Isolation | PUT/DELETE on Org B entity returns 403/404 |
| 38 | Cross-org hierarchy data leakage | Query | BigQuery query with org_slug filter returns 0 cross-org rows |

**Total: 38 tests**

## Verification Commands

```bash
# Seed default levels
curl -X POST "http://localhost:8000/api/v1/hierarchy/{org}/levels/seed" \
  -H "X-API-Key: $ORG_API_KEY"

# List levels
curl -s "http://localhost:8000/api/v1/hierarchy/{org}/levels" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Get full tree
curl -s "http://localhost:8000/api/v1/hierarchy/{org}/tree" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Create entity
curl -X POST "http://localhost:8000/api/v1/hierarchy/{org}/entities" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"entity_code": "ENGINEERING", "entity_name": "Engineering", "level_code": "department", "parent_entity_id": null}'

# Get ancestors
curl -s "http://localhost:8000/api/v1/hierarchy/{org}/entities/TEAM-PLAT/ancestors" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Get descendants
curl -s "http://localhost:8000/api/v1/hierarchy/{org}/entities/DEPT-CTO/descendants" \
  -H "X-API-Key: $ORG_API_KEY" | jq

# Export CSV
curl -s "http://localhost:8000/api/v1/hierarchy/{org}/export" \
  -H "X-API-Key: $ORG_API_KEY" -o hierarchy.csv

# Verify hierarchy in cost data (BigQuery)
bq query --nouse_legacy_sql \
  "SELECT x_hierarchy_entity_id, x_hierarchy_path, COUNT(*) as rows
   FROM \`{project}.{org}_prod.cost_data_standard_1_3\`
   WHERE x_hierarchy_entity_id IS NOT NULL
   GROUP BY 1, 2 LIMIT 10"

# Verify materialized view
bq query --nouse_legacy_sql \
  "SELECT entity_id, entity_name, level_code, path
   FROM \`{project}.{org}_prod.x_org_hierarchy\`
   WHERE end_date IS NULL LIMIT 10"
```

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Level management tests | 4/4 (100%) |
| Entity CRUD tests | 8/8 (100%) |
| Tree structure tests | 5/5 (100%) |
| Traversal tests | 5/5 (100%) |
| CSV import/export | 4/4 (100%) |
| Cost allocation tests | 5/6 (path prefix rollup requires cost data) |
| Multi-tenant isolation | 3/3 (100%) |
| Cross-org data leakage | 0 |

## Known Limitations

1. **Materialized view refresh**: The 15-minute refresh interval means newly created entities may not appear in the view immediately. Tests should account for this delay.
2. **Cost allocation tests**: Require populated cost data with cloud resource tags matching hierarchy entity IDs. Use demo data for testing.
3. **CSV import**: Large CSV files (1000+ entities) may take longer to process. Tests should use reasonable data sizes.
4. **Tag resolution**: Cloud providers use different tag key formats (GCP: labels, AWS: tags, Azure: tags). Testing all providers requires provider-specific test data.
5. **N-level hierarchy**: Custom levels beyond default 3-tier require API calls to create custom level definitions first.
6. **Soft delete cascade**: Soft-deleting a parent does not automatically soft-delete children. Children become orphans if parent is deleted.

## Edge Cases Tested

- Create entity with no parent (top-level department)
- Create entity with non-existent parent_entity_id (should fail)
- Delete entity with children (should warn or prevent)
- Move entity to create circular reference (should reject)
- Duplicate entity_id within same org (should reject)
- Entity with special characters in name (should handle UTF-8)
- Empty hierarchy tree (no entities seeded)
- Import CSV with missing required columns (should fail with clear error)
