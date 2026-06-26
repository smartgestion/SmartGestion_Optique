-- =============================================================================
-- MIGRATION: Independent "Vision de près" (VP) fields for Progressif
--
-- Until now the prescription form shared Nature AV and Prisme values between
-- the "Vision de loin" (VL) and "Vision de près" (VP) cards, so editing one
-- mirrored the other when Type de vision = Progressif.
--
-- This migration adds dedicated VP columns so VL and VP are fully separated:
--   * Nature AV (VP)        : od_av_vp_nature / og_av_vp_nature
--   * Prisme OD (VP)        : od_prisme_vp_horizontal / od_prisme_vp_vertical / od_prisme_vp_base
--   * Prisme OG (VP)        : og_prisme_vp_horizontal / og_prisme_vp_vertical / og_prisme_vp_base
--
-- (Sphère/Cylindre/Axe/Addition already had separate *_vp columns, and the
--  acuité visuelle already had od_av_vp / og_av_vp.)
-- =============================================================================

-- Acuité visuelle VL belonging to the VP section (kept separate from the VL
-- section's od_av_vl / og_av_vl so Progressif VL/VP don't mirror each other).
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_av_vp_vl DECIMAL(4,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_av_vp_vl DECIMAL(4,2);

-- Nature AV (VP)
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_av_vp_nature TEXT CHECK (od_av_vp_nature IN ('cc', 'sc'));
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_av_vp_nature TEXT CHECK (og_av_vp_nature IN ('cc', 'sc'));

-- Prisme OD (VP)
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_prisme_vp_horizontal DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_prisme_vp_vertical DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_prisme_vp_base TEXT CHECK (od_prisme_vp_base IN ('nasal','temporal','superieur','inferieur','nasal_superieur','nasal_inferieur','temporal_superieur','temporal_inferieur'));

-- Prisme OG (VP)
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_prisme_vp_horizontal DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_prisme_vp_vertical DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_prisme_vp_base TEXT CHECK (og_prisme_vp_base IN ('nasal','temporal','superieur','inferieur','nasal_superieur','nasal_inferieur','temporal_superieur','temporal_inferieur'));
