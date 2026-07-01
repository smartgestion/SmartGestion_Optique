-- =============================================================================
-- MIGRATION: Ordre de Travail as the central workflow hub (Supabase backend)
-- -----------------------------------------------------------------------------
-- The Ordre de Travail (OT) becomes the hub from which the whole optical flow
-- is created & managed: Client -> Ordonnance -> Commande -> Facture / Vente ->
-- Notes. Documents created from an OT are stamped with `ordre_travail_id`; a
-- walk-in sale is linked by storing its id on the OT (`vente_id`).
--
--   bons_commande.ordre_travail_id  : BC created from an OT
--   factures.ordre_travail_id       : facture created from an OT (already added
--                                     by MIGRATION_OPTIQUE_* / desktop; kept here
--                                     idempotently for safety)
--   ordres_travail.vente_id         : linked existing vente passager
--   ordre_travail_notes             : per-OT notes timeline (multiple dated notes)
--
-- The local SQLite (Tauri desktop) backend creates the same columns/table via
-- src-tauri/src/db/mod.rs::apply_migrations. This file is only needed for the
-- Supabase/web build. All statements are idempotent — safe to re-run.
-- =============================================================================

ALTER TABLE bons_commande  ADD COLUMN IF NOT EXISTS ordre_travail_id BIGINT REFERENCES ordres_travail(id);
ALTER TABLE factures       ADD COLUMN IF NOT EXISTS ordre_travail_id BIGINT REFERENCES ordres_travail(id);
ALTER TABLE ordres_travail ADD COLUMN IF NOT EXISTS vente_id         BIGINT REFERENCES ventes_passagers(id);

CREATE TABLE IF NOT EXISTS ordre_travail_notes (
    id               BIGSERIAL PRIMARY KEY,
    user_id          TEXT,
    ordre_travail_id BIGINT NOT NULL REFERENCES ordres_travail(id) ON DELETE CASCADE,
    note             TEXT   NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ot_notes_ot     ON ordre_travail_notes (ordre_travail_id);
CREATE INDEX IF NOT EXISTS idx_bons_commande_ot ON bons_commande (ordre_travail_id);
CREATE INDEX IF NOT EXISTS idx_factures_ot      ON factures (ordre_travail_id);
