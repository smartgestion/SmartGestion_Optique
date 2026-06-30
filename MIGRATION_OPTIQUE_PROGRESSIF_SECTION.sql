-- =============================================================================
-- MIGRATION: "Progressif" Type de vision — single Vision de loin section
--
-- Adds a new Type de vision value ('progressif_vl') rendered as a single
-- Vision de loin section (OD/OG) with the Addition field included. Its values
-- are stored in dedicated *_prog columns so they don't collide with the
-- existing vl / vp / unifocal columns.
--
--   * Sphère     : od_sph_prog / og_sph_prog
--   * Cylindre   : od_cyl_prog / og_cyl_prog
--   * Axe        : od_axe_prog / og_axe_prog
--   * Addition   : od_add_prog / og_add_prog
-- =============================================================================

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_sph_prog DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_cyl_prog DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_axe_prog INTEGER;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS od_add_prog DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_sph_prog DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_cyl_prog DECIMAL(5,2);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_axe_prog INTEGER;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS og_add_prog DECIMAL(5,2);
