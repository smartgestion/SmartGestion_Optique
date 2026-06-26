-- =============================================================================
-- MIGRATION: Optique "Verre Commande" purchase orders (cloud Supabase backend)
-- -----------------------------------------------------------------------------
-- Brings the paragestion `bons_commande` / `bon_commande_lignes` tables to
-- parity with the optique app so the ported "Verre Commande" logic in
-- BonCommandeForm works against the cloud/web backend exactly like it does in
-- the optique folder.
--
-- A "verre" purchase order is tied to a client + an active ordonnance
-- (prescription) and a single verre product line. The local SQLite (Tauri
-- desktop) backend already creates these columns via
-- src-tauri/src/db/mod.rs::apply_migrations — this file is only needed for the
-- Supabase/web build. Run it once in the Supabase SQL editor.
--
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS), so it is safe to
-- re-run.
-- =============================================================================

-- bons_commande — order type (simple vs verre) and the linked client.
ALTER TABLE bons_commande ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'simple';
ALTER TABLE bons_commande ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);

-- bon_commande_lignes — the prescription a verre line was ordered against.
ALTER TABLE bon_commande_lignes ADD COLUMN IF NOT EXISTS prescription_id BIGINT REFERENCES prescriptions(id);

CREATE INDEX IF NOT EXISTS idx_bons_commande_type ON bons_commande (type);
CREATE INDEX IF NOT EXISTS idx_bons_commande_client ON bons_commande (client_id);
CREATE INDEX IF NOT EXISTS idx_bon_commande_lignes_prescription ON bon_commande_lignes (prescription_id);
