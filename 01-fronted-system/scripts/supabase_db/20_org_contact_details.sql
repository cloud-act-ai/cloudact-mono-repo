-- Migration 20: Add organization contact and address fields
-- Purpose: Store business contact information and address for organizations
-- Pattern: Optional fields that owners can fill in for business purposes

-- ============================================
-- ADD CONTACT COLUMNS
-- ============================================
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS business_address_line1 TEXT,
ADD COLUMN IF NOT EXISTS business_address_line2 TEXT,
ADD COLUMN IF NOT EXISTS business_city TEXT,
ADD COLUMN IF NOT EXISTS business_state TEXT,
ADD COLUMN IF NOT EXISTS business_postal_code TEXT,
ADD COLUMN IF NOT EXISTS business_country VARCHAR(2);

-- ============================================
-- ADD CONSTRAINTS
-- ============================================

-- Email format validation (if provided)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_contact_email'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT chk_org_contact_email CHECK (
            contact_email IS NULL OR contact_email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        );
    END IF;
END $$;

-- Phone format validation (if provided) - allows international formats
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_contact_phone'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT chk_org_contact_phone CHECK (
            contact_phone IS NULL OR contact_phone ~ '^\+?[0-9\s\-\(\)]{7,20}$'
        );
    END IF;
END $$;

-- Country code validation (if provided) - ISO 3166-1 alpha-2
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_business_country'
    ) THEN
        ALTER TABLE organizations
        ADD CONSTRAINT chk_org_business_country CHECK (
            business_country IS NULL OR business_country ~ '^[A-Z]{2}$'
        );
    END IF;
END $$;

-- ============================================
-- ADD INDEXES
-- ============================================

-- Index for country-based queries (useful for regional filtering)
CREATE INDEX IF NOT EXISTS idx_organizations_business_country
ON organizations(business_country)
WHERE business_country IS NOT NULL;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON COLUMN organizations.contact_email IS 'Business contact email for the organization';
COMMENT ON COLUMN organizations.contact_phone IS 'Business contact phone number (international format supported)';
COMMENT ON COLUMN organizations.business_address_line1 IS 'Street address line 1';
COMMENT ON COLUMN organizations.business_address_line2 IS 'Street address line 2 (optional)';
COMMENT ON COLUMN organizations.business_city IS 'City name';
COMMENT ON COLUMN organizations.business_state IS 'State/Province/Region';
COMMENT ON COLUMN organizations.business_postal_code IS 'Postal/ZIP code';
COMMENT ON COLUMN organizations.business_country IS 'ISO 3166-1 alpha-2 country code (e.g., US, GB, IN)';

-- ============================================
-- MIGRATION VERIFICATION
-- ============================================
DO $$
DECLARE
    col_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'organizations'
      AND column_name IN (
        'contact_email', 'contact_phone',
        'business_address_line1', 'business_address_line2',
        'business_city', 'business_state', 'business_postal_code', 'business_country'
      );

    IF col_count = 8 THEN
        RAISE NOTICE '✓ Migration 20: All 8 contact/address columns added successfully';
    ELSE
        RAISE WARNING 'Migration 20: Expected 8 columns, found %', col_count;
    END IF;
END $$;
