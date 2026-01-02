-- =============================================
-- Migration: Cloud Provider Integrations Table
-- Purpose: Multi-credential support for cloud providers (GCP, AWS, Azure, OCI)
-- Pattern: Mirrors subscriptions junction table approach
-- Run: Execute in Supabase SQL Editor
-- =============================================

-- Drop old columns from organizations table if they exist
-- These are being replaced by the new junction table
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_aws_status;
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_aws_configured_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_aws_enabled;
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_azure_status;
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_azure_configured_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_azure_enabled;
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_oci_status;
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_oci_configured_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS integration_oci_enabled;

-- =============================================
-- Cloud Provider Integrations Table
-- Supports multiple credentials per provider per org
-- =============================================

CREATE TABLE IF NOT EXISTS cloud_provider_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Credential identification (maps to BigQuery org_integration_credentials)
  credential_id VARCHAR(100) NOT NULL,
  credential_name VARCHAR(200) NOT NULL,

  -- Provider info
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('gcp', 'aws', 'azure', 'oci')),

  -- Account identification (provider-specific)
  -- GCP: project_id, AWS: account_id, Azure: subscription_id, OCI: tenancy_ocid
  account_identifier VARCHAR(200),
  billing_account_id VARCHAR(100),

  -- Status tracking
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('VALID', 'INVALID', 'PENDING', 'EXPIRED', 'NOT_CONFIGURED')),
  last_validated_at TIMESTAMPTZ,
  last_error TEXT,

  -- Enablement (allows disabling without deleting)
  is_enabled BOOLEAN DEFAULT true,
  configured_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata for provider-specific fields (JSON)
  metadata JSONB DEFAULT '{}',

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(org_id, credential_id),
  UNIQUE(org_id, provider, credential_name)
);

-- =============================================
-- Indexes for Common Queries
-- =============================================

CREATE INDEX IF NOT EXISTS idx_cloud_integrations_org_id
  ON cloud_provider_integrations(org_id);

CREATE INDEX IF NOT EXISTS idx_cloud_integrations_org_provider
  ON cloud_provider_integrations(org_id, provider);

CREATE INDEX IF NOT EXISTS idx_cloud_integrations_org_provider_enabled
  ON cloud_provider_integrations(org_id, provider, is_enabled)
  WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_cloud_integrations_status
  ON cloud_provider_integrations(org_id, status);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE cloud_provider_integrations ENABLE ROW LEVEL SECURITY;

-- Users can only see integrations for orgs they belong to
CREATE POLICY "Users can view their org's cloud integrations"
  ON cloud_provider_integrations
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

-- Only admins/owners can create integrations
CREATE POLICY "Admins can create cloud integrations"
  ON cloud_provider_integrations
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

-- Only admins/owners can update integrations
CREATE POLICY "Admins can update cloud integrations"
  ON cloud_provider_integrations
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

-- Only admins/owners can delete integrations
CREATE POLICY "Admins can delete cloud integrations"
  ON cloud_provider_integrations
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

-- =============================================
-- Updated At Trigger
-- =============================================

CREATE OR REPLACE FUNCTION update_cloud_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cloud_integration_updated_at ON cloud_provider_integrations;
CREATE TRIGGER cloud_integration_updated_at
  BEFORE UPDATE ON cloud_provider_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_cloud_integration_updated_at();

-- =============================================
-- Comments for Documentation
-- =============================================

COMMENT ON TABLE cloud_provider_integrations IS 'Multi-credential cloud provider integrations per org. Supports GCP, AWS, Azure, OCI. Credentials encrypted in BigQuery org_integration_credentials.';

COMMENT ON COLUMN cloud_provider_integrations.credential_id IS 'References credential_id in BigQuery org_integration_credentials table';
COMMENT ON COLUMN cloud_provider_integrations.credential_name IS 'Human-readable name for the credential (e.g., "Production GCP", "Staging AWS")';
COMMENT ON COLUMN cloud_provider_integrations.provider IS 'Cloud provider: gcp, aws, azure, oci';
COMMENT ON COLUMN cloud_provider_integrations.account_identifier IS 'Provider-specific account ID: GCP project_id, AWS account_id, Azure subscription_id, OCI tenancy_ocid';
COMMENT ON COLUMN cloud_provider_integrations.billing_account_id IS 'Billing account for cost aggregation';
COMMENT ON COLUMN cloud_provider_integrations.status IS 'Validation status: VALID, INVALID, PENDING, EXPIRED, NOT_CONFIGURED';
COMMENT ON COLUMN cloud_provider_integrations.is_enabled IS 'Soft toggle to disable without deleting';
COMMENT ON COLUMN cloud_provider_integrations.metadata IS 'Provider-specific metadata as JSON (region, scopes, etc.)';

-- =============================================
-- Helper View: Primary Integration per Provider
-- For backward compatibility - returns first enabled integration per provider
-- =============================================

CREATE OR REPLACE VIEW cloud_provider_integrations_primary AS
SELECT DISTINCT ON (org_id, provider)
  id,
  org_id,
  credential_id,
  credential_name,
  provider,
  account_identifier,
  billing_account_id,
  status,
  last_validated_at,
  is_enabled,
  configured_at,
  metadata
FROM cloud_provider_integrations
WHERE is_enabled = true
ORDER BY org_id, provider, configured_at ASC;

COMMENT ON VIEW cloud_provider_integrations_primary IS 'Returns primary (first) enabled integration per provider per org. Use for backward compatibility with single-credential UIs.';

-- =============================================
-- Record Migration
-- =============================================

INSERT INTO schema_migrations (filename, checksum)
VALUES ('25_cloud_provider_integrations.sql', 'cloud-provider-integrations-v2-junction-table')
ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum;

-- =============================================
-- Verification Query
-- =============================================

-- Check table structure:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'cloud_provider_integrations';

-- Check integrations for an org:
-- SELECT provider, credential_name, status, is_enabled, configured_at
-- FROM cloud_provider_integrations
-- WHERE org_id = 'your-org-uuid'
-- ORDER BY provider, configured_at;
