-- =============================================================================
-- MIGRATION: Unifocal (Unifocal) VL / VP split on document lines (Supabase)
-- -----------------------------------------------------------------------------
-- When a linked ordonnance is "Unifocal" (type_vision = 'progressif', which is
-- labelled "Unifocal" in the UI) it carries BOTH a Vision de Loin (VL) and a
-- Vision de Près (VP) refraction. The document forms (Facture optique / Bon de
-- commande verre) now let the user tick VL and/or VP with a separate price for
-- each side, and the printed PDF renders only the ticked side(s) and totals
-- them accordingly.
--
-- These columns store that per-line choice:
--   vl_selected / vp_selected : 1 = this side is billed/ordered, 0 = not.
--   prix_vl / prix_vp         : per-side price HT.
--
-- The local SQLite (Tauri desktop) backend creates the same columns via
-- src-tauri/src/db/mod.rs::apply_migrations. This file is only needed for the
-- Supabase/web build. All statements are idempotent — safe to re-run.
-- =============================================================================

-- facture_lignes — VL/VP split for optique invoices.
ALTER TABLE facture_lignes ADD COLUMN IF NOT EXISTS vl_selected SMALLINT DEFAULT 0;
ALTER TABLE facture_lignes ADD COLUMN IF NOT EXISTS vp_selected SMALLINT DEFAULT 0;
ALTER TABLE facture_lignes ADD COLUMN IF NOT EXISTS prix_vl DECIMAL(15, 2);
ALTER TABLE facture_lignes ADD COLUMN IF NOT EXISTS prix_vp DECIMAL(15, 2);

-- bon_commande_lignes — VL/VP split for verre purchase orders.
ALTER TABLE bon_commande_lignes ADD COLUMN IF NOT EXISTS vl_selected SMALLINT DEFAULT 0;
ALTER TABLE bon_commande_lignes ADD COLUMN IF NOT EXISTS vp_selected SMALLINT DEFAULT 0;
ALTER TABLE bon_commande_lignes ADD COLUMN IF NOT EXISTS prix_vl DECIMAL(15, 2);
ALTER TABLE bon_commande_lignes ADD COLUMN IF NOT EXISTS prix_vp DECIMAL(15, 2);
