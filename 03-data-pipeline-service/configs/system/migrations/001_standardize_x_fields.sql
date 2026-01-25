-- Migration: Standardize x_* fields across all tables
-- Version: 001
-- Date: 2026-01-22
-- Description: Rename hierarchy_* to x_hierarchy_*, ingestion_date to x_ingestion_date
--
-- IMPORTANT: Run this for each org dataset: {org_slug}_{env}
-- Example: cloudact_inc_01162026_prod
--
-- BigQuery ALTER TABLE RENAME COLUMN syntax (GA since 2023)

-- ============================================================================
-- CLOUD PROVIDER TABLES
-- ============================================================================

-- GCP Billing
ALTER TABLE `{project}.{dataset}.cloud_gcp_billing_raw_daily`
  RENAME COLUMN ingestion_date TO x_ingestion_date,
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- Add missing column
ALTER TABLE `{project}.{dataset}.cloud_gcp_billing_raw_daily`
  ADD COLUMN IF NOT EXISTS x_hierarchy_validated_at TIMESTAMP;

-- AWS Billing
ALTER TABLE `{project}.{dataset}.cloud_aws_billing_raw_daily`
  RENAME COLUMN ingestion_timestamp TO x_ingestion_date,
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- Azure Billing
ALTER TABLE `{project}.{dataset}.cloud_azure_billing_raw_daily`
  RENAME COLUMN ingestion_timestamp TO x_ingestion_date,
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- Add missing column
ALTER TABLE `{project}.{dataset}.cloud_azure_billing_raw_daily`
  ADD COLUMN IF NOT EXISTS x_hierarchy_validated_at TIMESTAMP;

-- OCI Billing
ALTER TABLE `{project}.{dataset}.cloud_oci_billing_raw_daily`
  RENAME COLUMN ingestion_timestamp TO x_ingestion_date,
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- Add missing column
ALTER TABLE `{project}.{dataset}.cloud_oci_billing_raw_daily`
  ADD COLUMN IF NOT EXISTS x_hierarchy_validated_at TIMESTAMP;

-- ============================================================================
-- GENAI TABLES
-- ============================================================================

-- GenAI PAYG Usage Raw
ALTER TABLE `{project}.{dataset}.genai_payg_usage_raw`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- GenAI PAYG Costs Daily
ALTER TABLE `{project}.{dataset}.genai_payg_costs_daily`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- GenAI Commitment Usage Raw
ALTER TABLE `{project}.{dataset}.genai_commitment_usage_raw`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- GenAI Commitment Costs Daily
ALTER TABLE `{project}.{dataset}.genai_commitment_costs_daily`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- GenAI Infrastructure Usage Raw
ALTER TABLE `{project}.{dataset}.genai_infrastructure_usage_raw`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- GenAI Infrastructure Costs Daily
ALTER TABLE `{project}.{dataset}.genai_infrastructure_costs_daily`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- GenAI Costs Daily Unified
ALTER TABLE `{project}.{dataset}.genai_costs_daily_unified`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- GenAI Usage Daily Unified
ALTER TABLE `{project}.{dataset}.genai_usage_daily_unified`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- ============================================================================
-- FOCUS 1.3 UNIFIED TABLE
-- ============================================================================

ALTER TABLE `{project}.{dataset}.cost_data_standard_1_3`
  RENAME COLUMN hierarchy_entity_id TO x_hierarchy_entity_id,
  RENAME COLUMN hierarchy_entity_name TO x_hierarchy_entity_name,
  RENAME COLUMN hierarchy_level_code TO x_hierarchy_level_code,
  RENAME COLUMN hierarchy_path TO x_hierarchy_path,
  RENAME COLUMN hierarchy_path_names TO x_hierarchy_path_names;

-- Add missing column
ALTER TABLE `{project}.{dataset}.cost_data_standard_1_3`
  ADD COLUMN IF NOT EXISTS x_hierarchy_validated_at TIMESTAMP;

-- ============================================================================
-- GENAI PRICING TABLES (org_slug → x_org_slug)
-- ============================================================================

-- GenAI PAYG Pricing
ALTER TABLE `{project}.{dataset}.genai_payg_pricing`
  RENAME COLUMN org_slug TO x_org_slug;

-- GenAI Commitment Pricing
ALTER TABLE `{project}.{dataset}.genai_commitment_pricing`
  RENAME COLUMN org_slug TO x_org_slug;

-- GenAI Infrastructure Pricing
ALTER TABLE `{project}.{dataset}.genai_infrastructure_pricing`
  RENAME COLUMN org_slug TO x_org_slug;
