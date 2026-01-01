-- Organization Hierarchy Materialized View
-- Provides org-specific view of centralized org_hierarchy table
--
-- Architecture:
--   organizations.org_hierarchy
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
--   - Clustered for fast hierarchy lookups
--   - Multi-tenancy isolation at view level
--
-- Placeholders:
--   {project_id} - GCP project ID
--   {dataset_id} - Organization dataset (e.g., acmecorp_prod)
--   {org_slug}   - Organization slug for filtering

CREATE MATERIALIZED VIEW IF NOT EXISTS `{project_id}.{dataset_id}.x_org_hierarchy`
CLUSTER BY entity_type, entity_id, is_active
OPTIONS (
  enable_refresh = true,
  refresh_interval_minutes = 15,
  max_staleness = INTERVAL "1" HOUR
)
AS
SELECT
  id,
  org_slug,
  entity_type,
  entity_id,
  entity_name,
  parent_id,
  parent_type,
  dept_id,
  dept_name,
  project_id,
  project_name,
  team_id,
  team_name,
  owner_id,
  owner_name,
  owner_email,
  description,
  metadata,
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
