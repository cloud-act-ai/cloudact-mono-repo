-- Migration 22: Add business person details columns
-- Purpose: Store business contact person name, position, and department
-- Pattern: Organization contact information for billing/invoicing

-- ============================================
-- ADD BUSINESS PERSON COLUMNS
-- ============================================
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS business_person_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS business_person_position VARCHAR(255),
ADD COLUMN IF NOT EXISTS business_person_department VARCHAR(255);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON COLUMN organizations.business_person_name IS 'Primary business contact person full name';
COMMENT ON COLUMN organizations.business_person_position IS 'Position/title of the business contact person (e.g., CTO, Finance Manager)';
COMMENT ON COLUMN organizations.business_person_department IS 'Department of the business contact person (e.g., Engineering, Finance)';

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
      AND column_name IN ('business_person_name', 'business_person_position', 'business_person_department');

    IF col_count = 3 THEN
        RAISE NOTICE 'Migration 22: Business person detail columns added successfully';
    ELSE
        RAISE WARNING 'Migration 22: Expected 3 columns, found %', col_count;
    END IF;
END $$;
