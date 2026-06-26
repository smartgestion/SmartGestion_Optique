-- =============================================================================
-- MIGRATION: Progressive prescription "source vision" selector
--
-- For Progressif prescriptions the optician chooses which vision section is the
-- editable SOURCE used to auto-calculate the other one:
--   * 'vl' : Vision de loin is the source  → Vision de près is calculated
--   * 'vp' : Vision de près is the source   → Vision de loin is calculated
--
-- Formula applied in the form when clicking "Calculer":
--   source = vl : SPH_vp = SPH_vl + ADD ; CYL_vp = CYL_vl ; AXE_vp = AXE_vl
--   source = vp : SPH_vl = SPH_vp - ADD ; CYL_vl = CYL_vp ; AXE_vl = AXE_vp
--
-- This column simply remembers the chosen source so the form re-opens with the
-- correct section order and read-only marking.
-- =============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS progressif_source TEXT
  CHECK (progressif_source IN ('vl', 'vp'));
