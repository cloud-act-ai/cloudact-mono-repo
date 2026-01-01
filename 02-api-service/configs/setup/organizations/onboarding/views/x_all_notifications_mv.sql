-- Organization Notifications Consolidated Materialized View
-- Single view for all notification data: channels, rules, summaries, and history
--
-- Architecture:
--   organizations.org_notification_* tables
--   -> {org_dataset}.x_all_notifications (filtered by org_slug)
--
-- Data Flow:
--   1. API service writes notification config to CENTRAL organizations dataset
--   2. Pipeline service writes history to CENTRAL organizations dataset
--   3. This MV filters central data for THIS org only
--   4. Frontend queries this MV for fast, pre-filtered results
--
-- Benefits:
--   - Single materialized view per org for all notification data
--   - Auto-refreshed every 15 minutes (more frequent for alerts)
--   - Clustered for fast dashboard queries
--   - Denormalized - history entries enriched with channel/rule info
--
-- Placeholders:
--   {project_id} - GCP project ID
--   {dataset_id} - Organization dataset (e.g., acmecorp_prod)
--   {org_slug}   - Organization slug for filtering

CREATE MATERIALIZED VIEW IF NOT EXISTS `{project_id}.{dataset_id}.x_all_notifications`
CLUSTER BY notification_type, status, priority, created_at
OPTIONS (
  enable_refresh = true,
  refresh_interval_minutes = 15,
  max_staleness = INTERVAL "1" HOUR
)
AS
SELECT
  -- Notification History Info
  h.notification_id,
  h.org_slug,
  h.notification_type,
  h.priority,
  h.subject,
  h.body_preview,
  h.status,
  h.sent_at,
  h.delivered_at,
  h.error_message,
  h.retry_count,
  h.recipients,
  h.acknowledged_at,
  h.acknowledged_by,
  h.escalated,
  h.escalated_at,
  h.created_at,

  -- Rule Info (for alert notifications)
  h.rule_id,
  r.name AS rule_name,
  r.description AS rule_description,
  r.rule_category,
  r.rule_type,
  r.priority AS rule_priority,
  r.conditions AS rule_conditions,
  r.is_active AS rule_is_active,
  r.last_triggered_at AS rule_last_triggered,
  r.trigger_count_today AS rule_trigger_count,

  -- Summary Info (for summary notifications)
  h.summary_id,
  s.name AS summary_name,
  s.summary_type,
  s.schedule_cron AS summary_schedule,
  s.schedule_timezone AS summary_timezone,
  s.include_sections AS summary_sections,
  s.is_active AS summary_is_active,
  s.last_sent_at AS summary_last_sent,
  s.next_scheduled_at AS summary_next_scheduled,

  -- Channel Info
  h.channel_id,
  c.name AS channel_name,
  c.channel_type,
  c.is_default AS channel_is_default,
  c.is_active AS channel_is_active,
  c.email_recipients,
  c.slack_channel,

  -- Trigger data snapshot (JSON)
  h.trigger_data

FROM `{project_id}.organizations.org_notification_history` h
LEFT JOIN `{project_id}.organizations.org_notification_channels` c
  ON h.channel_id = c.channel_id
  AND h.org_slug = c.org_slug
LEFT JOIN `{project_id}.organizations.org_notification_rules` r
  ON h.rule_id = r.rule_id
  AND h.org_slug = r.org_slug
LEFT JOIN `{project_id}.organizations.org_notification_summaries` s
  ON h.summary_id = s.summary_id
  AND h.org_slug = s.org_slug
WHERE h.org_slug = '{org_slug}';
