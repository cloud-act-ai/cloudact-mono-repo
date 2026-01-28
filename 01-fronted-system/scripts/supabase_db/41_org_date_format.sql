-- Migration: Add date_format column to organizations table
-- Date: 2026-01-28
-- Purpose: Allow organizations to choose their preferred date display format

-- Add date_format column with default value
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS date_format TEXT DEFAULT 'MM/DD/YYYY';

-- Add comment for documentation
COMMENT ON COLUMN public.organizations.date_format IS 'User-preferred date format for display (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)';

-- Add check constraint for valid date formats
ALTER TABLE public.organizations
ADD CONSTRAINT valid_date_format CHECK (
  date_format IS NULL OR date_format IN (
    'MM/DD/YYYY',
    'DD/MM/YYYY',
    'YYYY-MM-DD',
    'DD-MMM-YYYY',
    'MMM DD, YYYY',
    'DD MMM YYYY'
  )
);
