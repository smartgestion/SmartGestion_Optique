-- =============================================================================
-- MIGRATION: Per-eye / per-section refractive index (Indice) for Unifocal
--
-- In Unifocal (ex-"Progressif") mode the prescription form shows an Indice
-- dropdown for each OD/OG × Vision de loin (VL) / Vision de près (VP) block.
-- Previously every dropdown shared the single `verre_indice` column, so each
-- one could not hold a different value.
--
-- This migration adds four dedicated columns so each Indice selection is
-- stored independently:
--   * od_indice_vl / og_indice_vl : Indice for the Vision de loin block
--   * od_indice_vp / og_indice_vp : Indice for the Vision de près block
--
-- (`verre_indice` is kept for the global "Verre prescrit" Indice, which is
--  locked to "aucun" when Type de vision = Unifocal.)
-- =============================================================================

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_indice_vl DECIMAL(4,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_indice_vl DECIMAL(4,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_indice_vp DECIMAL(4,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_indice_vp DECIMAL(4,2);
