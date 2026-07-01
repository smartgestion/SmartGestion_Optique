-- =============================================================================
-- MIGRATION: Original ordonnance scan/photo attachment (Supabase backend)
-- -----------------------------------------------------------------------------
-- The PrescriptionForm now lets the user attach the ORIGINAL ordonnance (an
-- image or a PDF). The file is stored inline as a base64 data URL:
--   scanned_url  : the data URL (data:image/...;base64,... or data:application/pdf;...)
--   scanned_name : the original file name (for display / download).
--
-- The local SQLite (Tauri desktop) backend creates the same columns via
-- src-tauri/src/db/mod.rs::apply_migrations. This file is only needed for the
-- Supabase/web build. All statements are idempotent — safe to re-run.
-- =============================================================================

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS scanned_url  TEXT;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS scanned_name TEXT;
