-- Organization Notification Stats View
-- Aggregated statistics for notification dashboard
--
-- Architecture:
--   organizations.org_notification_* tables
--   -> {org_dataset}.x_notification_stats (aggregated by org_slug)
--
-- Note: Using regular VIEW instead of MATERIALIZED VIEW because
-- BigQuery doesn't support incremental MVs with JOINs + aggregations.
-- For dashboards, this is fine as queries are still fast with proper indexing.
--
-- Placeholders:
--   {project_id} - GCP project ID
--   {dataset_id} - Organization dataset (e.g., acmecorp_prod)
--   {org_slug}   - Organization slug for filtering

CREATE OR REPLACE VIEW `{project_id}.{dataset_id}.x_notification_stats`
AS
WITH channel_stats AS (
  SELECT
    org_slug,
    COUNT(*) AS total_channels,
    COUNTIF(is_active = TRUE) AS active_channels,
    COUNTIF(is_default = TRUE) AS default_channels,
    COUNTIF(channel_type = 'email') AS email_channels,
    COUNTIF(channel_type = 'slack') AS slack_channels,
    COUNTIF(channel_type = 'webhook') AS webhook_channels
  FROM `{project_id}.organizations.org_notification_channels`
  WHERE org_slug = '{org_slug}'
  GROUP BY org_slug
),
rule_stats AS (
  SELECT
    org_slug,
    COUNT(*) AS total_rules,
    COUNTIF(is_active = TRUE) AS active_rules,
    COUNTIF(priority = 'critical') AS critical_rules,
    COUNTIF(priority = 'high') AS high_rules,
    COUNTIF(rule_category = 'cost') AS cost_rules,
    COUNTIF(rule_category = 'pipeline') AS pipeline_rules,
    SUM(trigger_count_today) AS total_triggers_today
  FROM `{project_id}.organizations.org_notification_rules`
  WHERE org_slug = '{org_slug}'
  GROUP BY org_slug
),
summary_stats AS (
  SELECT
    org_slug,
    COUNT(*) AS total_summaries,
    COUNTIF(is_active = TRUE) AS active_summaries,
    COUNTIF(summary_type = 'daily') AS daily_summaries,
    COUNTIF(summary_type = 'weekly') AS weekly_summaries,
    COUNTIF(summary_type = 'monthly') AS monthly_summaries
  FROM `{project_id}.organizations.org_notification_summaries`
  WHERE org_slug = '{org_slug}'
  GROUP BY org_slug
),
history_stats AS (
  SELECT
    org_slug,
    COUNT(*) AS total_notifications,
    COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) AS notifications_24h,
    COUNTIF(notification_type = 'alert' AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) AS alerts_24h,
    COUNTIF(status = 'delivered') AS delivered_count,
    COUNTIF(status = 'failed') AS failed_count,
    COUNTIF(status = 'delivered' AND acknowledged_at IS NULL) AS pending_acknowledgments,
    COUNTIF(escalated = TRUE) AS escalated_count,
    SAFE_DIVIDE(COUNTIF(status = 'delivered'), COUNT(*)) * 100 AS delivery_rate
  FROM `{project_id}.organizations.org_notification_history`
  WHERE org_slug = '{org_slug}'
  GROUP BY org_slug
)
SELECT
  '{org_slug}' AS org_slug,
  CURRENT_TIMESTAMP() AS computed_at,

  -- Channel stats
  COALESCE(c.total_channels, 0) AS total_channels,
  COALESCE(c.active_channels, 0) AS active_channels,
  COALESCE(c.email_channels, 0) AS email_channels,
  COALESCE(c.slack_channels, 0) AS slack_channels,
  COALESCE(c.webhook_channels, 0) AS webhook_channels,

  -- Rule stats
  COALESCE(r.total_rules, 0) AS total_rules,
  COALESCE(r.active_rules, 0) AS active_rules,
  COALESCE(r.critical_rules, 0) AS critical_rules,
  COALESCE(r.cost_rules, 0) AS cost_rules,
  COALESCE(r.pipeline_rules, 0) AS pipeline_rules,
  COALESCE(r.total_triggers_today, 0) AS total_triggers_today,

  -- Summary stats
  COALESCE(s.total_summaries, 0) AS total_summaries,
  COALESCE(s.active_summaries, 0) AS active_summaries,

  -- History stats
  COALESCE(h.total_notifications, 0) AS total_notifications,
  COALESCE(h.notifications_24h, 0) AS notifications_24h,
  COALESCE(h.alerts_24h, 0) AS alerts_24h,
  COALESCE(h.delivered_count, 0) AS delivered_count,
  COALESCE(h.failed_count, 0) AS failed_count,
  COALESCE(h.pending_acknowledgments, 0) AS pending_acknowledgments,
  COALESCE(h.escalated_count, 0) AS escalated_count,
  ROUND(COALESCE(h.delivery_rate, 100.0), 2) AS delivery_rate

FROM (SELECT '{org_slug}' AS org_slug) base
LEFT JOIN channel_stats c ON base.org_slug = c.org_slug
LEFT JOIN rule_stats r ON base.org_slug = r.org_slug
LEFT JOIN summary_stats s ON base.org_slug = s.org_slug
LEFT JOIN history_stats h ON base.org_slug = h.org_slug;
