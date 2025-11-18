-- Migration: Add missing columns to tenant_usage_quotas table
-- Date: 2025-11-18
-- Purpose: Fix schema mismatch between deployment script and actual schema definition
--
-- This migration adds columns that were defined in tenants_dataset.sql but missing from
-- the deployment script, causing async_executor.py to fail when updating these fields.

-- Add missing columns for cancelled pipelines tracking
ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS pipelines_cancelled_today INT64 DEFAULT 0;

-- Add missing columns for concurrent execution tracking
ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS max_concurrent_reached INT64 DEFAULT 0;

-- Add missing columns for quota management
ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS quota_exceeded BOOL DEFAULT FALSE;

ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS quota_warning_sent BOOL DEFAULT FALSE;

ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS quota_exceeded_at TIMESTAMP;

-- Add missing columns for additional usage metrics
ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS total_api_calls_today INT64 DEFAULT 0;

ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS total_storage_used_gb NUMERIC(10, 2) DEFAULT 0;

-- Add missing timestamp columns for pipeline tracking
ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS last_pipeline_started_at TIMESTAMP;

ALTER TABLE `gac-prod-471220.tenants.tenant_usage_quotas`
ADD COLUMN IF NOT EXISTS last_pipeline_completed_at TIMESTAMP;

-- Verify columns were added
SELECT
    column_name,
    data_type,
    is_nullable
FROM `gac-prod-471220.tenants.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'tenant_usage_quotas'
ORDER BY ordinal_position;
