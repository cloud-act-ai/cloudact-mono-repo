-- Organization Hierarchy Materialized View (N-Level)
-- Provides org-specific view of centralized org_hierarchy table
--
-- Architecture:
--   organizations.org_hierarchy (N-level configurable)
--   -> {org_dataset}.x_org_hierarchy (filtered by org_slug)
--
-- Data Flow:
--   1. Hierarchy CRUD writes to CENTRAL organizations.org_hierarchy
--   2. This MV filters central data for THIS org only
--   3. All services query this MV for fast, pre-filtered, org-scoped results
--
-- Benefits:
--   - Single source of truth in central dataset
--   - Per-org view for fast queries without org_slug filter
--   - Auto-refreshed every 15 minutes
--   - Clustered for fast hierarchy lookups by level and path
--   - Multi-tenancy isolation at view level
--
-- N-Level Support:
--   - Generic level/level_code fields (not hardcoded dept/project/team)
--   - Materialized path for subtree queries
--   - path_ids/path_names arrays for breadcrumb navigation
--   - depth field for level-based filtering
--
-- Placeholders:
--   {project_id} - GCP project ID
--   {dataset_id} - Organization dataset (e.g., acmecorp_prod)
--   {org_slug}   - Organization slug for filtering

CREATE MATERIALIZED VIEW IF NOT EXISTS `{project_id}.{dataset_id}.x_org_hierarchy`
CLUSTER BY level, level_code, is_active, path
OPTIONS (
  enable_refresh = true,
  refresh_interval_minutes = 15,
  max_staleness = INTERVAL "1" HOUR
)
AS
SELECT
  id,
  org_slug,
  entity_id,
  entity_name,
  level,
  level_code,
  parent_id,
  path,
  path_ids,
  path_names,
  depth,
  owner_id,
  owner_name,
  owner_email,
  description,
  metadata,
  sort_order,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by,
  version,
  end_date
FROM `{project_id}.organizations.org_hierarchy`
WHERE org_slug = '{org_slug}'
  AND end_date IS NULL;
