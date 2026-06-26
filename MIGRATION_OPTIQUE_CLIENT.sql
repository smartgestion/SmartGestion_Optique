-- =============================================================================
-- MIGRATION: Optique client fields (cloud Supabase backend)
-- -----------------------------------------------------------------------------
-- Brings the paragestion `clients` table to parity with the optique app so the
-- ported optique ClientForm + the optique client linkage on PDF documents work
-- against the cloud/web backend exactly like they do in the optique folder.
--
-- The local SQLite (Tauri desktop) backend already creates these columns via
-- src-tauri/src/db/mod.rs::apply_migrations — this file is only needed for the
-- Supabase/web build. Run it once in the Supabase SQL editor.
--
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS), so it is safe to
-- re-run.
-- =============================================================================

-- Patient civility is derived from `genre` (femme -> Mme, homme -> Mr) just
-- like the optique ClientForm.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS genre TEXT;

-- Optical / patient identity fields written by the optique ClientForm.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cine TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS couverture_sociale TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS couverture_sociale_detail TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lunette_expiration_date DATE;
