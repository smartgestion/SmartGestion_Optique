//! Local SQLite database manager for ParaGestion.
//!
//! The database file lives in the per-user local app-data directory
//! (e.g. on Windows: `%LOCALAPPDATA%\com.paragestion.desktop\paragestion.db`).
//! It is created automatically on first launch and migrated to the current
//! schema version. The single shared connection is wrapped in a
//! `parking_lot::Mutex` and registered as Tauri state so IPC commands can
//! safely acquire it.

pub mod auth;
pub mod commands;
pub mod schema;

use std::path::{Path, PathBuf};

use parking_lot::Mutex;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use thiserror::Error;

/// Errors that can cross the IPC boundary.
#[derive(Debug, Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[allow(dead_code)] // reserved for future use (lazy init / re-open paths)
    #[error("database not initialized")]
    NotInitialized,

    #[error("{0}")]
    Other(String),
}

/// Convert to a string for serde (Tauri commands need `Serialize` errors).
impl serde::Serialize for DbError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type DbResult<T> = Result<T, DbError>;

/// Tauri-managed state holding the shared SQLite connection.
pub struct DbState {
    pub conn: Mutex<Connection>,
    pub path: PathBuf,
}

impl DbState {
    pub fn new(conn: Connection, path: PathBuf) -> Self {
        Self {
            conn: Mutex::new(conn),
            path,
        }
    }
}

/// Resolve the on-disk path for the SQLite file.
///
/// Uses Tauri's `path().app_local_data_dir()` which on Windows resolves to
/// `%LOCALAPPDATA%\<bundle identifier>\`.
fn resolve_db_path(app: &AppHandle) -> DbResult<PathBuf> {
    let mut dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| DbError::Other(format!("failed to resolve app local data dir: {e}")))?;

    // Make sure the directory exists.
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }

    dir.push("paragestion.db");
    Ok(dir)
}

/// Open (or create) the SQLite file at `path` and apply pragmas + migrations.
fn open_and_migrate(path: &Path) -> DbResult<Connection> {
    let existed = path.exists();
    let conn = Connection::open(path)?;

    // Recommended pragmas for desktop apps:
    //  - foreign_keys = ON     (enforce FK constraints)
    //  - journal_mode = WAL    (concurrent reads, durable writes)
    //  - synchronous = NORMAL  (good durability/perf trade-off with WAL)
    //  - busy_timeout = 5s     (retry instead of immediate SQLITE_BUSY)
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;

    apply_migrations(&conn)?;

    if existed {
        log::info!("Opened existing SQLite database at {}", path.display());
    } else {
        log::info!("Created new SQLite database at {}", path.display());
    }

    Ok(conn)
}

/// Add `column` to `table` only when it isn't already present.
///
/// Uses `PRAGMA table_info` to check existence so it is safe to run on every
/// startup (SQLite has no `ADD COLUMN IF NOT EXISTS`).
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    decl: &str,
) -> DbResult<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({});", table))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|name| name == column);

    if !exists {
        conn.execute_batch(&format!(
            "ALTER TABLE {} ADD COLUMN {} {};",
            table, column, decl
        ))?;
    }
    Ok(())
}

/// Apply migrations idempotently inside a single transaction.
fn apply_migrations(conn: &Connection) -> DbResult<()> {
    let tx_sql = "BEGIN IMMEDIATE;";
    conn.execute_batch(tx_sql)?;

    let result: DbResult<()> = (|| {
        for stmt in schema::MIGRATIONS {
            conn.execute_batch(stmt)?;
        }

        // -----------------------------------------------------------------
        // OPTIQUE — optical columns added to existing tables.
        //
        // These extend the base SmartGestion tables for an optician
        // business. They are added idempotently so that both fresh and
        // pre-existing databases converge to the same shape without
        // touching the original CREATE TABLE definitions.
        // -----------------------------------------------------------------

        // produits — article types & optical characteristics
        add_column_if_missing(conn, "produits", "type_produit",        "TEXT DEFAULT 'monture'")?;
        add_column_if_missing(conn, "produits", "monture_taille",      "TEXT")?;
        add_column_if_missing(conn, "produits", "monture_couleur",     "TEXT")?;
        add_column_if_missing(conn, "produits", "monture_matiere",     "TEXT")?;
        add_column_if_missing(conn, "produits", "monture_forme",       "TEXT")?;
        add_column_if_missing(conn, "produits", "monture_genre",       "TEXT")?;
        add_column_if_missing(conn, "produits", "monture_largeur_nb",  "REAL")?;
        add_column_if_missing(conn, "produits", "monture_hauteur_nb",  "REAL")?;
        add_column_if_missing(conn, "produits", "monture_ponte_nb",    "REAL")?;
        add_column_if_missing(conn, "produits", "verre_type",          "TEXT")?;
        add_column_if_missing(conn, "produits", "verre_indice",        "REAL")?;
        add_column_if_missing(conn, "produits", "verre_traitement",    "TEXT")?;
        add_column_if_missing(conn, "produits", "verre_couleur",       "TEXT")?;
        add_column_if_missing(conn, "produits", "lentille_type",       "TEXT")?;
        add_column_if_missing(conn, "produits", "lentille_courbe_base","REAL")?;
        add_column_if_missing(conn, "produits", "lentille_diametre",   "REAL")?;
        add_column_if_missing(conn, "produits", "lentille_marque",     "TEXT")?;
        add_column_if_missing(conn, "produits", "solution_volume_ml",  "INTEGER")?;
        add_column_if_missing(conn, "produits", "solution_type",       "TEXT")?;
        add_column_if_missing(conn, "produits", "fournisseur_ref",     "TEXT")?;
        add_column_if_missing(conn, "produits", "emplacement",         "TEXT")?;
        add_column_if_missing(conn, "produits", "date_peremption",     "TEXT")?;
        add_column_if_missing(conn, "produits", "lot",                 "TEXT")?;
        add_column_if_missing(conn, "produits", "garantie_mois",       "INTEGER DEFAULT 24")?;

        // clients — medical / insurance fields
        add_column_if_missing(conn, "clients", "type_client",            "TEXT DEFAULT 'particulier'")?;
        add_column_if_missing(conn, "clients", "couverture_sociale",     "TEXT")?;
        add_column_if_missing(conn, "clients", "couverture_sociale_detail", "TEXT")?;
        add_column_if_missing(conn, "clients", "assurance_nom",          "TEXT")?;
        add_column_if_missing(conn, "clients", "assurance_numero",       "TEXT")?;
        add_column_if_missing(conn, "clients", "cnops_matricule",        "TEXT")?;
        add_column_if_missing(conn, "clients", "cnss_numero",            "TEXT")?;
        add_column_if_missing(conn, "clients", "mutuelle_nom",           "TEXT")?;
        add_column_if_missing(conn, "clients", "mutuelle_numero",        "TEXT")?;
        add_column_if_missing(conn, "clients", "medecin_traitant",       "TEXT")?;
        add_column_if_missing(conn, "clients", "medecin_telephone",      "TEXT")?;
        add_column_if_missing(conn, "clients", "medecin_adresse",        "TEXT")?;
        add_column_if_missing(conn, "clients", "date_naissance",         "TEXT")?;
        add_column_if_missing(conn, "clients", "genre",                  "TEXT")?;
        add_column_if_missing(conn, "clients", "cine",                   "TEXT")?;
        add_column_if_missing(conn, "clients", "lunette_expiration_date","TEXT")?;

        // factures — optical / prise-en-charge fields
        add_column_if_missing(conn, "factures", "type",                       "TEXT DEFAULT 'simple'")?;
        add_column_if_missing(conn, "factures", "prescription_id",            "INTEGER")?;
        add_column_if_missing(conn, "factures", "ordre_travail_id",           "INTEGER")?;
        add_column_if_missing(conn, "factures", "type_prise_en_charge",       "TEXT")?;
        add_column_if_missing(conn, "factures", "numero_bon_prise_en_charge", "TEXT")?;
        add_column_if_missing(conn, "factures", "droit_timbre",               "REAL DEFAULT 0")?;
        add_column_if_missing(conn, "factures", "ngap_code_id",               "INTEGER")?;
        add_column_if_missing(conn, "factures", "montant_base_remboursement", "REAL DEFAULT 0")?;
        add_column_if_missing(conn, "factures", "taux_remboursement",         "REAL DEFAULT 0")?;
        add_column_if_missing(conn, "factures", "montant_rembourse",          "REAL DEFAULT 0")?;
        add_column_if_missing(conn, "factures", "reste_a_charge_client",      "REAL DEFAULT 0")?;

        // facture_lignes — optical per-line fields
        add_column_if_missing(conn, "facture_lignes", "prescription_id", "INTEGER")?;
        add_column_if_missing(conn, "facture_lignes", "od_og",           "TEXT")?;
        add_column_if_missing(conn, "facture_lignes", "prix_od_ht",      "REAL")?;
        add_column_if_missing(conn, "facture_lignes", "prix_og_ht",      "REAL")?;
        // facture_lignes — unifocal (Unifocal) VL/VP split: which vision
        // side(s) are billed and the price of each side.
        add_column_if_missing(conn, "facture_lignes", "vl_selected", "INTEGER DEFAULT 0")?;
        add_column_if_missing(conn, "facture_lignes", "vp_selected", "INTEGER DEFAULT 0")?;
        add_column_if_missing(conn, "facture_lignes", "prix_vl",     "REAL")?;
        add_column_if_missing(conn, "facture_lignes", "prix_vp",     "REAL")?;

        // prescriptions — independent "Vision de près" (VP) Nature AV & Prisme
        // columns (so Progressif VL/VP don't share the same values).
        add_column_if_missing(conn, "prescriptions", "od_av_vp_vl",             "REAL")?;
        add_column_if_missing(conn, "prescriptions", "og_av_vp_vl",             "REAL")?;
        add_column_if_missing(conn, "prescriptions", "od_av_vp_nature",         "TEXT")?;
        add_column_if_missing(conn, "prescriptions", "og_av_vp_nature",         "TEXT")?;
        add_column_if_missing(conn, "prescriptions", "od_prisme_vp_horizontal", "REAL")?;
        add_column_if_missing(conn, "prescriptions", "od_prisme_vp_vertical",   "REAL")?;
        add_column_if_missing(conn, "prescriptions", "od_prisme_vp_base",       "TEXT")?;
        add_column_if_missing(conn, "prescriptions", "og_prisme_vp_horizontal", "REAL")?;
        add_column_if_missing(conn, "prescriptions", "og_prisme_vp_vertical",   "REAL")?;
        add_column_if_missing(conn, "prescriptions", "og_prisme_vp_base",       "TEXT")?;

        // prescriptions — for Progressif prescriptions, which vision section
        // ('vl' or 'vp') the optician chose as the source values.
        add_column_if_missing(conn, "prescriptions", "progressif_source",       "TEXT")?;

        // prescriptions — per-eye / per-section refractive index (Unifocal:
        // each OD/OG × VL/VP Indice dropdown can hold a different value).
        add_column_if_missing(conn, "prescriptions", "od_indice_vl",            "REAL")?;
        add_column_if_missing(conn, "prescriptions", "og_indice_vl",            "REAL")?;
        add_column_if_missing(conn, "prescriptions", "od_indice_vp",            "REAL")?;
        add_column_if_missing(conn, "prescriptions", "og_indice_vp",            "REAL")?;

        // prescriptions — "Progressif" type: single Vision de loin section
        // (SPH/CYL/AXE) + Addition, stored independently of vl/vp/unifocal.
        add_column_if_missing(conn, "prescriptions", "od_sph_prog",             "REAL")?;
        add_column_if_missing(conn, "prescriptions", "od_cyl_prog",             "REAL")?;
        add_column_if_missing(conn, "prescriptions", "od_axe_prog",             "INTEGER")?;
        add_column_if_missing(conn, "prescriptions", "od_add_prog",             "REAL")?;
        add_column_if_missing(conn, "prescriptions", "og_sph_prog",             "REAL")?;
        add_column_if_missing(conn, "prescriptions", "og_cyl_prog",             "REAL")?;
        add_column_if_missing(conn, "prescriptions", "og_axe_prog",             "INTEGER")?;
        add_column_if_missing(conn, "prescriptions", "og_add_prog",             "REAL")?;

        // prescriptions — original ordonnance scan/photo. `scanned_url` holds a
        // base64 data URL (image or PDF); `scanned_name` the original filename.
        add_column_if_missing(conn, "prescriptions", "scanned_url",  "TEXT")?;
        add_column_if_missing(conn, "prescriptions", "scanned_name", "TEXT")?;

        // bons_commande — Verre Commande (optical) fields
        add_column_if_missing(conn, "bons_commande", "type",      "TEXT DEFAULT 'simple'")?;
        add_column_if_missing(conn, "bons_commande", "client_id", "INTEGER")?;
        // bons_commande — supplier's own order/reference number
        add_column_if_missing(conn, "bons_commande", "numero_fournisseur", "TEXT")?;
        // bons_commande — cancellation reason (filled when statut = 'annulé')
        add_column_if_missing(conn, "bons_commande", "motif_annulation", "TEXT")?;
        // bon_commande_lignes — linked prescription for verre orders
        add_column_if_missing(conn, "bon_commande_lignes", "prescription_id", "INTEGER")?;
        // bon_commande_lignes — unifocal (Unifocal) VL/VP split: which vision
        // side(s) are ordered and the price of each side.
        add_column_if_missing(conn, "bon_commande_lignes", "vl_selected", "INTEGER DEFAULT 0")?;
        add_column_if_missing(conn, "bon_commande_lignes", "vp_selected", "INTEGER DEFAULT 0")?;
        add_column_if_missing(conn, "bon_commande_lignes", "prix_vl",     "REAL")?;
        add_column_if_missing(conn, "bon_commande_lignes", "prix_vp",     "REAL")?;

        // avoirs_fournisseur — avoir type (simple/verre, mirrors BC type) and
        // creation mode ('manuel' or 'auto' when generated from a BC cancellation).
        add_column_if_missing(conn, "avoirs_fournisseur", "type",          "TEXT DEFAULT 'simple'")?;
        add_column_if_missing(conn, "avoirs_fournisseur", "creation_mode", "TEXT DEFAULT 'manuel'")?;
        // avoirs_fournisseur — supplier's own order/reference number
        add_column_if_missing(conn, "avoirs_fournisseur", "numero_fournisseur", "TEXT")?;
        // avoirs_fournisseur — free-text reason/motif
        add_column_if_missing(conn, "avoirs_fournisseur", "motif", "TEXT")?;
        // avoir_fournisseur_lignes — linked prescription for verre avoirs
        add_column_if_missing(conn, "avoir_fournisseur_lignes", "prescription_id", "INTEGER")?;

        // parametres — optician establishment settings
        add_column_if_missing(conn, "parametres", "type_etablissement",    "TEXT DEFAULT 'opticien'")?;
        add_column_if_missing(conn, "parametres", "numero_ordre_opticien", "TEXT")?;
        add_column_if_missing(conn, "parametres", "licence",               "TEXT")?;
        add_column_if_missing(conn, "parametres", "cnops_conventionne",    "INTEGER DEFAULT 0")?;
        add_column_if_missing(conn, "parametres", "cnss_conventionne",     "INTEGER DEFAULT 0")?;
        add_column_if_missing(conn, "parametres", "taux_cnops",            "REAL DEFAULT 80")?;
        add_column_if_missing(conn, "parametres", "taux_cnss",             "REAL DEFAULT 70")?;
        add_column_if_missing(conn, "parametres", "taux_tva_verre",        "REAL DEFAULT 20")?;
        add_column_if_missing(conn, "parametres", "taux_tva_monture",      "REAL DEFAULT 20")?;

        // Record the version (idempotent thanks to INSERT OR IGNORE).
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?1);",
            [schema::SCHEMA_VERSION],
        )?;
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT;")?;
            log::info!("Database schema is at version {}", schema::SCHEMA_VERSION);
            Ok(())
        }
        Err(e) => {
            // Best-effort rollback; ignore secondary errors.
            let _ = conn.execute_batch("ROLLBACK;");
            Err(e)
        }
    }
}

/// Public entry point used by `lib.rs::setup`.
///
/// Resolves the DB path, ensures the file/folder exist, opens it, applies
/// migrations and returns a `DbState` ready to be registered as Tauri state.
pub fn init(app: &AppHandle) -> DbResult<DbState> {
    let path = resolve_db_path(app)?;
    let conn = open_and_migrate(&path)?;
    Ok(DbState::new(conn, path))
}
