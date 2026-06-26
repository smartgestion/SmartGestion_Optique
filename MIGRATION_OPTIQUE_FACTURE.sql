-- =============================================================================
-- MIGRATION: Optique invoice line pricing (cloud Supabase backend)
-- -----------------------------------------------------------------------------
-- Brings the paragestion `facture_lignes` / `factures` tables to parity with
-- the optique app so the ported optique FactureForm works against the
-- cloud/web backend exactly like it does in the optique folder.
--
-- The optique invoice form creates two fixed lines (monture + verre); the
-- verre line stores a separate per-eye price (prix_od_ht / prix_og_ht) and an
-- optional linked prescription. The local SQLite (Tauri desktop) backend
-- already creates these columns via src-tauri/src/db/mod.rs::apply_migrations —
-- this file is only needed for the Supabase/web build. Run it once in the
-- Supabase SQL editor.
--
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS), so it is safe to
-- re-run.
-- =============================================================================

-- facture_lignes — optical per-line fields written by the optique FactureForm.
ALTER TABLE facture_lignes ADD COLUMN IF NOT EXISTS prescription_id BIGINT REFERENCES prescriptions(id);
ALTER TABLE facture_lignes ADD COLUMN IF NOT EXISTS prix_od_ht DECIMAL(15, 2);
ALTER TABLE facture_lignes ADD COLUMN IF NOT EXISTS prix_og_ht DECIMAL(15, 2);

-- factures — optical header fields. `type` distinguishes simple vs optique
-- invoices; `prescription_id` links the optique invoice to an ordonnance.
ALTER TABLE factures ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'simple';
ALTER TABLE factures ADD COLUMN IF NOT EXISTS prescription_id BIGINT REFERENCES prescriptions(id);

-- prescriptions — ensure the `statut` column exists so the form can list only
-- active ordonnances for the selected client.
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_facture_lignes_prescription ON facture_lignes (prescription_id);
CREATE INDEX IF NOT EXISTS idx_factures_prescription ON factures (prescription_id);
