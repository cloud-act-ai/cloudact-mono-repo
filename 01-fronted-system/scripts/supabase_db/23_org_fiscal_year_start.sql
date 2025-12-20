-- Migration: 23_org_fiscal_year_start.sql
-- Purpose: Add fiscal year start month setting for organizations
-- Pattern: Month (1-12) when fiscal year begins, auto-defaulted based on timezone/country
--
-- Fiscal Year Defaults by Country:
-- - January (1): US, CN, AE, SA, QA, KW, BH, OM, SG, CH, DE, FR
-- - April (4): IN, JP, GB, CA
-- - July (7): AU, EG
-- - October (10): US Federal Government (optional)

-- ============================================
-- ADD COLUMN
-- ============================================

-- Add fiscal year start column to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS fiscal_year_start_month INTEGER DEFAULT 1;

-- ============================================
-- ADD CONSTRAINT
-- ============================================

-- Fiscal year start must be a valid month (1-12)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_fiscal_year_start'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT chk_org_fiscal_year_start CHECK (fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12);
    END IF;
END $$;

-- ============================================
-- UPDATE EXISTING ROWS BASED ON TIMEZONE
-- ============================================

-- Set default fiscal year based on existing timezone settings
-- India, Japan, UK, Canada -> April (4)
UPDATE organizations
SET fiscal_year_start_month = 4
WHERE fiscal_year_start_month IS NULL
  AND default_timezone IN ('Asia/Kolkata', 'Asia/Tokyo', 'Europe/London');

-- Australia -> July (7)
UPDATE organizations
SET fiscal_year_start_month = 7
WHERE fiscal_year_start_month IS NULL
  AND default_timezone = 'Australia/Sydney';

-- All others -> January (1) - Calendar Year
UPDATE organizations
SET fiscal_year_start_month = COALESCE(fiscal_year_start_month, 1)
WHERE fiscal_year_start_month IS NULL;

-- ============================================
-- ADD INDEX
-- ============================================

-- Index for fiscal year queries (useful for cost analytics grouping)
CREATE INDEX IF NOT EXISTS idx_organizations_fiscal_year
ON organizations(fiscal_year_start_month);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN organizations.fiscal_year_start_month IS 'Month (1-12) when fiscal year starts. Default: 1 (January). Auto-set based on timezone: India/Japan/UK=4 (April), Australia=7 (July)';

-- ============================================
-- MIGRATION VERIFICATION
-- ============================================

DO $$
DECLARE
    col_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations'
          AND column_name = 'fiscal_year_start_month'
    ) INTO col_exists;

    IF col_exists THEN
        RAISE NOTICE '✓ Migration 23: fiscal_year_start_month column added successfully';
    ELSE
        RAISE WARNING 'Migration 23: fiscal_year_start_month column not found';
    END IF;
END $$;
