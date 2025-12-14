-- Migration: 16_org_internationalization.sql
-- Purpose: Add org-level i18n settings (currency, country, language, timezone)
-- Pattern: Like org_slug - foundational multi-tenant parameters
--
-- Supported values:
-- - Currency (ISO 4217): USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, INR, SGD, AED, SAR, QAR, KWD, BHD, OMR
-- - Country (ISO 3166-1): Inferred from currency
-- - Language (BCP 47): en (only English for now)
-- - Timezone (IANA): 15 major timezones

-- ============================================
-- ADD COLUMNS
-- ============================================

-- Add i18n columns to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS default_country VARCHAR(2) DEFAULT 'US',
ADD COLUMN IF NOT EXISTS default_language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS default_timezone VARCHAR(50) DEFAULT 'UTC';

-- ============================================
-- ADD CONSTRAINTS
-- ============================================

-- Currency must be 3 uppercase letters (ISO 4217)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_currency'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT chk_org_currency CHECK (default_currency ~ '^[A-Z]{3}$');
    END IF;
END $$;

-- Country must be 2 uppercase letters (ISO 3166-1 alpha-2)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_country'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT chk_org_country CHECK (default_country ~ '^[A-Z]{2}$');
    END IF;
END $$;

-- Language must be valid BCP 47 code (lowercase, 2-10 chars)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_language'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT chk_org_language CHECK (default_language ~ '^[a-z]{2,10}$');
    END IF;
END $$;

-- Timezone must be non-empty string (IANA format validated at app layer)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_timezone'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT chk_org_timezone CHECK (default_timezone IS NOT NULL AND length(default_timezone) > 0);
    END IF;
END $$;

-- ============================================
-- ADD INDEXES (Enterprise Scale)
-- ============================================

-- Index for filtering by locale (common query pattern)
CREATE INDEX IF NOT EXISTS idx_organizations_locale
ON organizations(default_currency, default_country);

-- Index for currency-specific queries
CREATE INDEX IF NOT EXISTS idx_organizations_currency
ON organizations(default_currency);

-- Index for timezone-specific queries
CREATE INDEX IF NOT EXISTS idx_organizations_timezone
ON organizations(default_timezone);

-- ============================================
-- UPDATE EXISTING ROWS
-- ============================================

-- Ensure all existing orgs have defaults (idempotent)
UPDATE organizations
SET
    default_currency = COALESCE(default_currency, 'USD'),
    default_country = COALESCE(default_country, 'US'),
    default_language = COALESCE(default_language, 'en'),
    default_timezone = COALESCE(default_timezone, 'UTC')
WHERE default_currency IS NULL
   OR default_country IS NULL
   OR default_language IS NULL
   OR default_timezone IS NULL;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN organizations.default_currency IS 'ISO 4217 currency code (e.g., USD, EUR, AED). Default: USD';
COMMENT ON COLUMN organizations.default_country IS 'ISO 3166-1 alpha-2 country code (e.g., US, AE). Auto-inferred from currency';
COMMENT ON COLUMN organizations.default_language IS 'BCP 47 language tag (e.g., en, ar). Default: en (English only for now)';
COMMENT ON COLUMN organizations.default_timezone IS 'IANA timezone identifier (e.g., UTC, Asia/Dubai). Default: UTC';

-- ============================================
-- MIGRATION VERIFICATION
-- ============================================

DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'organizations'
      AND column_name IN ('default_currency', 'default_country', 'default_language', 'default_timezone');

    IF col_count = 4 THEN
        RAISE NOTICE '✓ Migration 16: All 4 i18n columns added successfully';
    ELSE
        RAISE WARNING 'Migration 16: Expected 4 columns, found %', col_count;
    END IF;
END $$;
