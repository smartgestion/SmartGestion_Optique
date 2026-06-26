-- =============================================================================
-- MIGRATION: Portefeuille (document management) — cloud Supabase backend
-- -----------------------------------------------------------------------------
-- Creates the three Portefeuille tables (folders, files, papers) so the
-- document-management feature works against the cloud/web backend exactly like
-- it does in the Tauri desktop build.
--
-- The local SQLite (Tauri desktop) backend already creates these tables via
-- src-tauri/src/db/schema.rs (SCHEMA_VERSION 4) — this file is only needed for
-- the Supabase/web build. Run it once in the Supabase SQL editor.
--
-- All statements are idempotent (IF NOT EXISTS), so it is safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Folders (supports nesting via parent_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portefeuille_folders (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    nom         TEXT NOT NULL,
    parent_id   BIGINT REFERENCES portefeuille_folders(id) ON DELETE CASCADE,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Files (uploaded documents — base64 data URL stored in data_url)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portefeuille_files (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id   BIGINT REFERENCES portefeuille_folders(id) ON DELETE CASCADE,
    nom         TEXT NOT NULL,
    extension   TEXT,
    type_mime   TEXT,
    taille      BIGINT DEFAULT 0,
    data_url    TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Papers (in-app rich-text documents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portefeuille_papers (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id   BIGINT REFERENCES portefeuille_folders(id) ON DELETE CASCADE,
    titre       TEXT NOT NULL DEFAULT 'Sans titre',
    contenu     TEXT DEFAULT '',
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pf_folders_user   ON portefeuille_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_pf_folders_parent ON portefeuille_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_pf_files_user     ON portefeuille_files(user_id);
CREATE INDEX IF NOT EXISTS idx_pf_files_folder   ON portefeuille_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_pf_papers_user    ON portefeuille_papers(user_id);
CREATE INDEX IF NOT EXISTS idx_pf_papers_folder  ON portefeuille_papers(folder_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (permissive: scoped in-app by user_id, mirrors the rest
-- of the project — see RLS_SIMPLE.sql)
-- ---------------------------------------------------------------------------
ALTER TABLE portefeuille_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE portefeuille_files   ENABLE ROW LEVEL SECURITY;
ALTER TABLE portefeuille_papers  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all portefeuille_folders" ON portefeuille_folders;
CREATE POLICY "Allow all portefeuille_folders" ON portefeuille_folders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all portefeuille_files" ON portefeuille_files;
CREATE POLICY "Allow all portefeuille_files" ON portefeuille_files FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all portefeuille_papers" ON portefeuille_papers;
CREATE POLICY "Allow all portefeuille_papers" ON portefeuille_papers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

SELECT 'Portefeuille tables created' AS status;
