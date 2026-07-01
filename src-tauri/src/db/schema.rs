//! SQLite schema translated from the Supabase Postgres schema.
//!
//! Translation rules applied:
//! - `bigint NOT NULL DEFAULT nextval(...)`  -> `INTEGER PRIMARY KEY AUTOINCREMENT`
//! - `numeric`                                -> `REAL`
//! - `uuid`                                   -> `TEXT` (uuid string)
//! - `timestamp with time zone DEFAULT now()` -> `TEXT DEFAULT CURRENT_TIMESTAMP`
//! - `date DEFAULT CURRENT_DATE`              -> `TEXT DEFAULT CURRENT_DATE`
//! - `boolean`                                -> `INTEGER` (0/1)
//! - FKs to `auth.users(id)` are dropped (no local auth schema); `user_id`
//!   columns are kept as TEXT so the Supabase schema parity is preserved for
//!   future cloud-sync.
//! - All other primary keys, foreign keys, defaults and CHECK constraints
//!   are preserved exactly as in the source schema.

/// Statements executed in order on a fresh database.
///
/// Order matters: parent tables before children that reference them.
pub const MIGRATIONS: &[&str] = &[
    // -----------------------------------------------------------------
    // Schema-version bookkeeping
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        applied_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    "#,

    // -----------------------------------------------------------------
    // Independent / parent tables
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS clients (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        nom           TEXT    NOT NULL,
        email         TEXT,
        telephone     TEXT,
        adresse       TEXT,
        ville         TEXT,
        code_postal   TEXT,
        pays          TEXT    DEFAULT 'Maroc',
        ice           TEXT,
        rc            TEXT,
        if_identifiant TEXT,
        patente       TEXT,
        notes         TEXT,
        created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
        code          TEXT,
        type          TEXT    DEFAULT 'entreprise',
        user_id       TEXT,
        nom_societe   TEXT
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS fournisseurs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        nom          TEXT    NOT NULL,
        email        TEXT,
        telephone    TEXT,
        adresse      TEXT,
        ville        TEXT,
        ice          TEXT,
        notes        TEXT,
        created_at   TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at   TEXT    DEFAULT CURRENT_TIMESTAMP,
        contact      TEXT,
        code_postale TEXT,
        type         TEXT    DEFAULT 'entreprise',
        user_id      TEXT,
        code         TEXT,
        nom_societe  TEXT
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS produits (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        reference       TEXT,
        designation     TEXT    NOT NULL,
        nom             TEXT,
        description     TEXT,
        categorie       TEXT,
        marque          TEXT,
        barcode         TEXT,
        image_url       TEXT,
        prix_achat_ht   REAL    DEFAULT 0,
        prix_vente_ht   REAL    DEFAULT 0,
        tva             REAL    DEFAULT 20,
        prix_achat_ttc  REAL    DEFAULT 0,
        prix_vente_ttc  REAL    DEFAULT 0,
        stock_actuel    REAL    DEFAULT 0,
        stock_min       REAL    DEFAULT 5,
        unite           TEXT    DEFAULT 'unité',
        is_active       INTEGER DEFAULT 1,
        created_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
        taux_tva        REAL    DEFAULT 20,
        user_id         TEXT
    );
    "#,

    // -----------------------------------------------------------------
    // Sales-side documents
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS devis (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        numero              TEXT    NOT NULL,
        client_id           INTEGER,
        date_emission       TEXT    DEFAULT CURRENT_DATE,
        date_validite       TEXT,
        statut              TEXT    DEFAULT 'brouillon',
        montant_ht          REAL    DEFAULT 0,
        montant_tva         REAL    DEFAULT 0,
        montant_ttc         REAL    DEFAULT 0,
        notes               TEXT,
        conditions_paiement TEXT,
        created_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        mode_paiement       TEXT,
        date_echeance       TEXT,
        user_id             TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS devis_lignes (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        devis_id         INTEGER,
        produit_id       INTEGER,
        reference        TEXT,
        designation      TEXT    NOT NULL,
        quantite         REAL    NOT NULL,
        prix_unitaire_ht REAL    NOT NULL,
        tva              REAL    DEFAULT 20,
        montant_ht       REAL,
        montant_ttc      REAL,
        ordre            INTEGER DEFAULT 0,
        montant_tva      REAL    DEFAULT 0,
        FOREIGN KEY (devis_id)   REFERENCES devis(id),
        FOREIGN KEY (produit_id) REFERENCES produits(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS factures (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        numero              TEXT    NOT NULL,
        client_id           INTEGER,
        devis_id            INTEGER,
        date_emission       TEXT    DEFAULT CURRENT_DATE,
        date_echeance       TEXT,
        statut              TEXT    DEFAULT 'brouillon',
        mode_paiement       TEXT,
        montant_ht          REAL    DEFAULT 0,
        montant_tva         REAL    DEFAULT 0,
        montant_ttc         REAL    DEFAULT 0,
        reste_a_payer       REAL    DEFAULT 0,
        notes               TEXT,
        conditions_paiement TEXT,
        created_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        cogs                REAL    DEFAULT 0,
        stock_updated       INTEGER DEFAULT 0,
        user_id             TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id),
        FOREIGN KEY (devis_id)  REFERENCES devis(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS facture_lignes (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        facture_id       INTEGER,
        produit_id       INTEGER,
        reference        TEXT,
        designation      TEXT    NOT NULL,
        quantite         REAL    NOT NULL,
        prix_unitaire_ht REAL    NOT NULL,
        tva              REAL    DEFAULT 20,
        montant_ht       REAL,
        montant_ttc      REAL,
        ordre            INTEGER DEFAULT 0,
        FOREIGN KEY (facture_id) REFERENCES factures(id),
        FOREIGN KEY (produit_id) REFERENCES produits(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS avoirs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        numero        TEXT    NOT NULL,
        facture_id    INTEGER,
        client_id     INTEGER,
        date_emission TEXT    DEFAULT CURRENT_DATE,
        motif         TEXT,
        montant_ht    REAL    DEFAULT 0,
        montant_tva   REAL    DEFAULT 0,
        montant_ttc   REAL    DEFAULT 0,
        statut        TEXT    DEFAULT 'brouillon',
        notes         TEXT,
        created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
        user_id       TEXT,
        FOREIGN KEY (client_id)  REFERENCES clients(id),
        FOREIGN KEY (facture_id) REFERENCES factures(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS avoir_lignes (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        avoir_id         INTEGER,
        produit_id       INTEGER,
        reference        TEXT,
        designation      TEXT    NOT NULL,
        quantite         REAL    NOT NULL,
        prix_unitaire_ht REAL    NOT NULL,
        tva              REAL    DEFAULT 20,
        montant_ht       REAL,
        montant_ttc      REAL,
        ordre            INTEGER DEFAULT 0,
        FOREIGN KEY (avoir_id)   REFERENCES avoirs(id),
        FOREIGN KEY (produit_id) REFERENCES produits(id)
    );
    "#,

    // -----------------------------------------------------------------
    // Purchasing-side documents
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS bons_commande (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        numero                TEXT    NOT NULL,
        fournisseur_id        INTEGER,
        numero_fournisseur    TEXT,
        date_commande         TEXT    DEFAULT CURRENT_DATE,
        date_livraison_prevue TEXT,
        statut                TEXT    DEFAULT 'brouillon',
        montant_ht            REAL    DEFAULT 0,
        montant_tva           REAL    DEFAULT 0,
        montant_ttc           REAL    DEFAULT 0,
        notes                 TEXT,
        motif_annulation      TEXT,
        ordre_travail_id      INTEGER,
        created_at            TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at            TEXT    DEFAULT CURRENT_TIMESTAMP,
        stock_updated         INTEGER DEFAULT 0,
        user_id               TEXT,
        FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS bon_commande_lignes (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        bon_commande_id  INTEGER,
        produit_id       INTEGER,
        reference        TEXT,
        designation      TEXT    NOT NULL,
        quantite         REAL    NOT NULL,
        prix_unitaire_ht REAL    NOT NULL,
        tva              REAL    DEFAULT 20,
        ordre            INTEGER DEFAULT 0,
        montant_ht       REAL    DEFAULT 0,
        montant_ttc      REAL    DEFAULT 0,
        FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id),
        FOREIGN KEY (produit_id)      REFERENCES produits(id)
    );
    "#,

    // Supplier credit notes (purchase-side mirror of avoirs).
    r#"
    CREATE TABLE IF NOT EXISTS avoirs_fournisseur (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        numero             TEXT    NOT NULL,
        numero_fournisseur TEXT,
        bon_commande_id    INTEGER,
        fournisseur_id     INTEGER,
        date_emission      TEXT    DEFAULT CURRENT_DATE,
        montant_ht      REAL    DEFAULT 0,
        montant_tva     REAL    DEFAULT 0,
        montant_ttc     REAL    DEFAULT 0,
        statut          TEXT    DEFAULT 'émis',
        motif           TEXT,
        notes           TEXT,
        created_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
        user_id         TEXT,
        FOREIGN KEY (fournisseur_id)  REFERENCES fournisseurs(id),
        FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS avoir_fournisseur_lignes (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        avoir_fournisseur_id INTEGER,
        produit_id           INTEGER,
        reference            TEXT,
        designation          TEXT    NOT NULL,
        quantite             REAL    NOT NULL,
        prix_unitaire_ht     REAL    NOT NULL,
        tva                  REAL    DEFAULT 20,
        montant_ht           REAL,
        montant_ttc          REAL,
        ordre                INTEGER DEFAULT 0,
        FOREIGN KEY (avoir_fournisseur_id) REFERENCES avoirs_fournisseur(id),
        FOREIGN KEY (produit_id)           REFERENCES produits(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS bons_livraison (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        numero          TEXT    NOT NULL,
        fournisseur_id  INTEGER,
        bon_commande_id INTEGER,
        date_livraison  TEXT    DEFAULT CURRENT_DATE,
        statut          TEXT    DEFAULT 'reçu',
        montant_ht      REAL    DEFAULT 0,
        montant_tva     REAL    DEFAULT 0,
        montant_ttc     REAL    DEFAULT 0,
        stock_updated   INTEGER DEFAULT 0,
        notes           TEXT,
        created_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
        user_id         TEXT,
        FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id),
        FOREIGN KEY (fournisseur_id)  REFERENCES fournisseurs(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS bon_livraison_lignes (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        bon_livraison_id  INTEGER,
        produit_id        INTEGER,
        reference         TEXT,
        designation       TEXT    NOT NULL,
        quantite          REAL    NOT NULL,
        prix_unitaire_ht  REAL    NOT NULL,
        tva               REAL    DEFAULT 20,
        ordre             INTEGER DEFAULT 0,
        montant_ht        REAL    DEFAULT 0,
        montant_ttc       REAL    DEFAULT 0,
        FOREIGN KEY (bon_livraison_id) REFERENCES bons_livraison(id),
        FOREIGN KEY (produit_id)       REFERENCES produits(id)
    );
    "#,

    // -----------------------------------------------------------------
    // Sales-side delivery notes (client). Mirrors `bons_livraison` but is
    // tied to a client and NEVER touches stock — purely a printable
    // delivery document for the customer.
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS bons_livraison_client (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        numero          TEXT    NOT NULL,
        client_id       INTEGER,
        facture_id      INTEGER,
        date_livraison  TEXT    DEFAULT CURRENT_DATE,
        statut          TEXT    DEFAULT 'en_attente',
        montant_ht      REAL    DEFAULT 0,
        montant_tva     REAL    DEFAULT 0,
        montant_ttc     REAL    DEFAULT 0,
        notes           TEXT,
        created_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
        user_id         TEXT,
        FOREIGN KEY (client_id)  REFERENCES clients(id),
        FOREIGN KEY (facture_id) REFERENCES factures(id)
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS bon_livraison_client_lignes (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        bon_livraison_client_id  INTEGER,
        produit_id               INTEGER,
        reference                TEXT,
        designation              TEXT    NOT NULL,
        quantite                 REAL    NOT NULL,
        prix_unitaire_ht         REAL    NOT NULL,
        tva                      REAL    DEFAULT 20,
        ordre                    INTEGER DEFAULT 0,
        montant_ht               REAL    DEFAULT 0,
        montant_ttc              REAL    DEFAULT 0,
        FOREIGN KEY (bon_livraison_client_id) REFERENCES bons_livraison_client(id),
        FOREIGN KEY (produit_id)              REFERENCES produits(id)
    );
    "#,

    // -----------------------------------------------------------------
    // Expenses
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS depenses (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        numero              TEXT    UNIQUE,
        fournisseur_id      INTEGER,
        categorie           TEXT,
        description         TEXT,
        date_depense        TEXT    DEFAULT CURRENT_DATE,
        montant_ht          REAL    DEFAULT 0,
        tva                 REAL    DEFAULT 20,
        montant_ttc         REAL    DEFAULT 0,
        mode_paiement       TEXT,
        reference_paiement  TEXT,
        notes               TEXT,
        created_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        montant_tva         REAL    DEFAULT 0,
        reference           TEXT,
        user_id             TEXT,
        FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
    );
    "#,

    // -----------------------------------------------------------------
    // Walk-in sales (ventes passagers)
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS ventes_passagers (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        numero        TEXT    NOT NULL,
        date          TEXT    DEFAULT CURRENT_DATE,
        client_nom    TEXT,
        montant_ht    REAL    DEFAULT 0,
        montant_tva   REAL    DEFAULT 0,
        montant_ttc   REAL    DEFAULT 0,
        mode_paiement TEXT,
        notes         TEXT,
        created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
        cogs          REAL    DEFAULT 0,
        user_id       TEXT
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS ventes_passagers_lignes (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        vente_passager_id INTEGER,
        produit_id        INTEGER,
        reference         TEXT,
        designation       TEXT    NOT NULL,
        quantite          REAL    NOT NULL,
        prix_unitaire_ht  REAL    NOT NULL,
        tva               REAL    DEFAULT 20,
        montant_ht        REAL,
        montant_ttc       REAL,
        ordre             INTEGER DEFAULT 0,
        montant_tva       REAL    DEFAULT 0,
        vp_id             INTEGER,
        FOREIGN KEY (produit_id)        REFERENCES produits(id),
        FOREIGN KEY (vente_passager_id) REFERENCES ventes_passagers(id)
    );
    "#,

    // -----------------------------------------------------------------
    // Stock movement journal
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS mouvements_stock (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        produit_id          INTEGER,
        type                TEXT    NOT NULL,
        quantite            REAL    DEFAULT 0,
        notes               TEXT,
        reference_document  TEXT,
        entite_nom          TEXT,
        prix_unitaire       REAL    DEFAULT 0,
        date_mouvement      TEXT    DEFAULT CURRENT_TIMESTAMP,
        created_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (produit_id) REFERENCES produits(id)
    );
    "#,

    // -----------------------------------------------------------------
    // Activity log
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS logs_activites (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        action       TEXT    NOT NULL,
        details      TEXT,
        entite_type  TEXT,
        entite_id    TEXT,
        utilisateur  TEXT,
        date_action  TEXT    DEFAULT CURRENT_TIMESTAMP,
        created_at   TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    "#,

    // -----------------------------------------------------------------
    // Notifications
    //
    // Note: in Postgres `id` was uuid with `gen_random_uuid()`; in SQLite
    // we use a TEXT PK and rely on the caller (or a default expression)
    // to supply a uuid string.
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS notifications (
        id          TEXT    PRIMARY KEY,
        user_id     TEXT    NOT NULL,
        title       TEXT    NOT NULL,
        message     TEXT    NOT NULL,
        type        TEXT    NOT NULL DEFAULT 'info'
                             CHECK (type IN ('success','error','warning','info')),
        is_read     INTEGER NOT NULL DEFAULT 0,
        link        TEXT,
        created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    "#,

    // -----------------------------------------------------------------
    // Application settings (singleton-ish, keyed by user_id which is UNIQUE)
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS parametres (
        id                          INTEGER PRIMARY KEY AUTOINCREMENT,
        nom_entreprise              TEXT,
        adresse                     TEXT,
        telephone                   TEXT,
        email                       TEXT,
        ice                         TEXT,
        rc                          TEXT,
        if_identifiant              TEXT,
        patente                     TEXT,
        logo_url                    TEXT,
        devise                      TEXT    DEFAULT 'DH',
        conditions_paiement_defaut  TEXT,
        pied_page_defaut            TEXT,
        created_at                  TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at                  TEXT    DEFAULT CURRENT_TIMESTAMP,
        activer_droit_timbre        INTEGER DEFAULT 1,
        couleur_principale          TEXT    DEFAULT '#267E54',
        banque                      TEXT    DEFAULT '',
        rib                         TEXT    DEFAULT '',
        swift                       TEXT    DEFAULT '',
        if_number                   TEXT    DEFAULT '',
        tp_patente                  TEXT    DEFAULT '',
        cnss                        TEXT    DEFAULT '',
        capital_social              TEXT    DEFAULT '',
        site_web                    TEXT    DEFAULT '',
        code_postale                TEXT    DEFAULT '',
        nom_societe                 TEXT,
        nom                         TEXT    DEFAULT '',
        ville                       TEXT    DEFAULT '',
        forme_juridique             TEXT    DEFAULT '',
        user_id                     TEXT    UNIQUE,
        activer_filigrane           INTEGER DEFAULT 1,
        texte_filigrane             TEXT    DEFAULT 'SmartGestion',
        watermark_text              TEXT    DEFAULT 'SmartGestion'
    );
    "#,

    // -----------------------------------------------------------------
    // Tasks
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        description TEXT,
        completed   INTEGER DEFAULT 0,
        priority    TEXT    DEFAULT 'medium',
        due_date    TEXT,
        created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    "#,

    // -----------------------------------------------------------------
    // Local users (offline authentication)
    //
    // - `id`            : client-side generated UUID (v4) as TEXT.
    // - `email`         : stored lowercased & trimmed; UNIQUE.
    // - `password_hash` : bcrypt-encoded string (~60 chars) containing
    //                     the algorithm marker, cost factor and salt.
    // - `role`          : free-form role label (e.g. 'admin', 'user').
    //
    // The `user_id` TEXT columns on every business table (clients,
    // factures, ...) can now point at `users.id` for multi-user setups.
    // We do not add a hard FK so that pre-existing rows from cloud sync
    // (where user_id was a Supabase auth uuid) continue to validate.
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS users (
        id            TEXT    PRIMARY KEY,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        role          TEXT    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    "#,

    // -----------------------------------------------------------------
    // OPTIQUE — Prescriptions (ordonnances)
    //
    // Eyewear prescriptions: OD (œil droit) / OG (œil gauche) values for
    // vision de loin (VL) and vision de près (VP), prisms, visual acuity,
    // fitting parameters and prescribed-lens specs. Translated from the
    // Supabase MIGRATION_OPTIQUE / MIGRATION_OPTIQUE_V2 schema.
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS prescriptions (
        id                          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id                     TEXT,
        client_id                   INTEGER,
        date_ordonnance             TEXT    DEFAULT CURRENT_DATE,
        date_expiration             TEXT,
        type_prescription           TEXT,
        type_vision                 TEXT,
        notes                       TEXT,

        -- Prescriber (médecin traitant)
        opticien_nom                TEXT,
        opticien_adresse            TEXT,
        opticien_telephone          TEXT,
        medecin_traitant_nom        TEXT,
        medecin_traitant_specialite TEXT,
        medecin_traitant_telephone  TEXT,
        medecin_traitant_email      TEXT,
        medecin_traitant_adresse    TEXT,

        -- Vision de loin (VL)
        od_sph_vl                   REAL,
        od_cyl_vl                   REAL,
        od_axe_vl                   INTEGER,
        od_add_vl                   REAL,
        og_sph_vl                   REAL,
        og_cyl_vl                   REAL,
        og_axe_vl                   INTEGER,
        og_add_vl                   REAL,

        -- Vision de près (VP)
        od_sph_vp                   REAL,
        od_cyl_vp                   REAL,
        od_axe_vp                   INTEGER,
        od_add_vp                   REAL,
        og_sph_vp                   REAL,
        og_cyl_vp                   REAL,
        og_axe_vp                   INTEGER,
        og_add_vp                   REAL,

        -- "Progressif" (single Vision de loin section + Addition)
        od_sph_prog                 REAL,
        od_cyl_prog                 REAL,
        od_axe_prog                 INTEGER,
        od_add_prog                 REAL,
        og_sph_prog                 REAL,
        og_cyl_prog                 REAL,
        og_axe_prog                 INTEGER,
        og_add_prog                 REAL,

        -- Acuité visuelle
        od_av_vl                    REAL,
        og_av_vl                    REAL,
        od_av_vp                    REAL,
        og_av_vp                    REAL,
        od_av_nature                TEXT,
        og_av_nature                TEXT,
        od_av_vp_vl                 REAL,
        og_av_vp_vl                 REAL,
        od_av_vp_nature             TEXT,
        og_av_vp_nature             TEXT,

        -- Prismes (VL)
        od_prisme_horizontal        REAL,
        od_prisme_vertical          REAL,
        od_prisme_base              TEXT,
        og_prisme_horizontal        REAL,
        og_prisme_vertical          REAL,
        og_prisme_base              TEXT,

        -- Prismes (VP)
        od_prisme_vp_horizontal     REAL,
        od_prisme_vp_vertical       REAL,
        od_prisme_vp_base           TEXT,
        og_prisme_vp_horizontal     REAL,
        og_prisme_vp_vertical       REAL,
        og_prisme_vp_base           TEXT,

        -- Distance pupillaire / hauteurs
        dp_binoculaire              REAL,
        dp_od                       REAL,
        dp_og                       REAL,
        hauteur_od                  REAL,
        hauteur_og                  REAL,

        -- Paramètres de montage
        distance_vertex             REAL,
        inclinaison_pantoscopique   REAL,
        angle_courbe_faciale        REAL,

        -- Verre prescrit
        verre_type                  TEXT,
        verre_indice                REAL,
        -- Per-eye / per-section indice (Unifocal: OD/OG × VL/VP)
        od_indice_vl                REAL,
        og_indice_vl                REAL,
        od_indice_vp                REAL,
        og_indice_vp                REAL,
        verre_traitement            TEXT,

        -- Progressif: which vision section ('vl' | 'vp') is the source
        progressif_source           TEXT,

        -- Scan de l'ordonnance (base64 data URL) + nom de fichier d'origine
        scanned_url                 TEXT,
        scanned_name                TEXT,

        statut                      TEXT    DEFAULT 'active',
        created_at                  TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at                  TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id)
    );
    "#,

    // -----------------------------------------------------------------
    // OPTIQUE — Ordres de travail (lab / atelier work orders)
    //
    // The optician's workshop workflow: brouillon -> envoye_labo ->
    // recu_labo -> montage -> controle -> termine. Links a client +
    // prescription to a frame and lens, with lab info and pricing.
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS ordres_travail (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id             TEXT,
        client_id           INTEGER,
        prescription_id     INTEGER,

        numero_ordre        TEXT    NOT NULL,
        date_creation       TEXT    DEFAULT CURRENT_DATE,
        date_souhaitee      TEXT,
        date_envoi_labo     TEXT,
        date_reception_labo TEXT,
        date_montage        TEXT,
        date_controle       TEXT,
        date_remise         TEXT,

        statut              TEXT    DEFAULT 'brouillon',

        -- Frame
        produit_monture_id  INTEGER,
        monture_reference   TEXT,
        monture_designation TEXT,

        -- Lens (stocked product OR free description)
        produit_verre_id    INTEGER,
        verre_type          TEXT,
        verre_indice        REAL,
        verre_traitement    TEXT,
        verre_couleur       TEXT,
        verre_designation   TEXT,

        -- Lab instructions
        instructions_labo   TEXT,
        type_detourage      TEXT,
        centrage_notes      TEXT,
        biseau_type         TEXT,

        -- Laboratory / supplier
        labo_nom            TEXT,
        labo_contact        TEXT,
        labo_prix           REAL    DEFAULT 0,

        -- Selling price
        prix_vente_ht       REAL    DEFAULT 0,
        taux_tva            REAL    DEFAULT 20,

        -- Central-hub: a linked walk-in sale (ordre_travail is the hub, it
        -- stores the id of an existing vente passager it is tied to).
        vente_id            INTEGER,

        created_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id)         REFERENCES clients(id),
        FOREIGN KEY (prescription_id)   REFERENCES prescriptions(id),
        FOREIGN KEY (produit_monture_id) REFERENCES produits(id),
        FOREIGN KEY (produit_verre_id)  REFERENCES produits(id)
    );
    "#,

    // Ordre de travail — notes timeline (multiple dated notes per OT).
    r#"
    CREATE TABLE IF NOT EXISTS ordre_travail_notes (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          TEXT,
        ordre_travail_id INTEGER NOT NULL,
        note             TEXT    NOT NULL,
        created_at       TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ordre_travail_id) REFERENCES ordres_travail(id)
    );
    "#,

    // -----------------------------------------------------------------
    // OPTIQUE — Rendez-vous (appointments)
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS rendez_vous (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          TEXT,
        client_id        INTEGER,
        prescription_id  INTEGER,
        ordre_travail_id INTEGER,

        date_rdv         TEXT    NOT NULL,
        heure_rdv        TEXT    NOT NULL,
        duree_minutes    INTEGER DEFAULT 30,
        type_rdv         TEXT    NOT NULL,
        statut           TEXT    DEFAULT 'planifie',
        notes            TEXT,
        rappel_sms       INTEGER DEFAULT 0,
        rappel_email     INTEGER DEFAULT 0,
        rappel_envoye    INTEGER DEFAULT 0,

        created_at       TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at       TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id)        REFERENCES clients(id),
        FOREIGN KEY (prescription_id)  REFERENCES prescriptions(id),
        FOREIGN KEY (ordre_travail_id) REFERENCES ordres_travail(id)
    );
    "#,

    // -----------------------------------------------------------------
    // OPTIQUE — NGAP reimbursement codes (Moroccan nomenclature)
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS ngap_codes (
        id                        INTEGER PRIMARY KEY AUTOINCREMENT,
        code                      TEXT    NOT NULL UNIQUE,
        libelle                   TEXT    NOT NULL,
        tarif_tnr                 REAL,
        taux_remboursement_cnops  REAL,
        taux_remboursement_cnss   REAL,
        categorie                 TEXT,
        actif                     INTEGER DEFAULT 1,
        created_at                TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    "#,

    // -----------------------------------------------------------------
    // OPTIQUE — Ayants droit (client dependents / beneficiaries)
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS ayants_droit (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id           TEXT,
        client_id         INTEGER,
        nom               TEXT    NOT NULL,
        prenom            TEXT    NOT NULL,
        date_naissance    TEXT,
        lien_parente      TEXT,
        cnops_matricule   TEXT,
        cnss_numero       TEXT,
        mutuelle_numero   TEXT,
        created_at        TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id)
    );
    "#,

    // -----------------------------------------------------------------
    // PORTEFEUILLE — Document management (folders, files, papers)
    //
    // A digital document workspace: nested folders containing uploaded
    // files (stored as base64 data URLs since the desktop build has no
    // object storage) and rich-text "papers" authored in-app.
    // -----------------------------------------------------------------
    r#"
    CREATE TABLE IF NOT EXISTS portefeuille_folders (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT,
        nom         TEXT    NOT NULL,
        parent_id   INTEGER,
        is_favorite INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES portefeuille_folders(id) ON DELETE CASCADE
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS portefeuille_files (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT,
        folder_id   INTEGER,
        nom         TEXT    NOT NULL,
        extension   TEXT,
        type_mime   TEXT,
        taille      INTEGER DEFAULT 0,
        data_url    TEXT,
        is_favorite INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES portefeuille_folders(id) ON DELETE CASCADE
    );
    "#,

    r#"
    CREATE TABLE IF NOT EXISTS portefeuille_papers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT,
        folder_id   INTEGER,
        titre       TEXT    NOT NULL DEFAULT 'Sans titre',
        contenu     TEXT    DEFAULT '',
        is_favorite INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
        updated_at  TEXT    DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES portefeuille_folders(id) ON DELETE CASCADE
    );
    "#,

    // -----------------------------------------------------------------
    // Helpful indexes on hot foreign-key paths
    // -----------------------------------------------------------------
    "CREATE INDEX IF NOT EXISTS idx_users_email                 ON users(email);",
    "CREATE INDEX IF NOT EXISTS idx_factures_client_id          ON factures(client_id);",
    "CREATE INDEX IF NOT EXISTS idx_factures_devis_id           ON factures(devis_id);",
    "CREATE INDEX IF NOT EXISTS idx_facture_lignes_facture_id   ON facture_lignes(facture_id);",
    "CREATE INDEX IF NOT EXISTS idx_facture_lignes_produit_id   ON facture_lignes(produit_id);",
    "CREATE INDEX IF NOT EXISTS idx_devis_client_id             ON devis(client_id);",
    "CREATE INDEX IF NOT EXISTS idx_devis_lignes_devis_id       ON devis_lignes(devis_id);",
    "CREATE INDEX IF NOT EXISTS idx_avoirs_client_id            ON avoirs(client_id);",
    "CREATE INDEX IF NOT EXISTS idx_avoirs_facture_id           ON avoirs(facture_id);",
    "CREATE INDEX IF NOT EXISTS idx_avoir_lignes_avoir_id       ON avoir_lignes(avoir_id);",
    "CREATE INDEX IF NOT EXISTS idx_bons_commande_fournisseur   ON bons_commande(fournisseur_id);",
    "CREATE INDEX IF NOT EXISTS idx_bc_lignes_bc_id             ON bon_commande_lignes(bon_commande_id);",
    "CREATE INDEX IF NOT EXISTS idx_bons_livraison_fournisseur  ON bons_livraison(fournisseur_id);",
    "CREATE INDEX IF NOT EXISTS idx_bons_livraison_bc_id        ON bons_livraison(bon_commande_id);",
    "CREATE INDEX IF NOT EXISTS idx_bl_lignes_bl_id             ON bon_livraison_lignes(bon_livraison_id);",
    "CREATE INDEX IF NOT EXISTS idx_blc_client_id               ON bons_livraison_client(client_id);",
    "CREATE INDEX IF NOT EXISTS idx_blc_facture_id              ON bons_livraison_client(facture_id);",
    "CREATE INDEX IF NOT EXISTS idx_blc_lignes_blc_id           ON bon_livraison_client_lignes(bon_livraison_client_id);",
    "CREATE INDEX IF NOT EXISTS idx_depenses_fournisseur        ON depenses(fournisseur_id);",
    "CREATE INDEX IF NOT EXISTS idx_vp_lignes_vp_id             ON ventes_passagers_lignes(vente_passager_id);",
    "CREATE INDEX IF NOT EXISTS idx_mouvements_stock_produit    ON mouvements_stock(produit_id);",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user_id       ON notifications(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_produits_reference          ON produits(reference);",
    "CREATE INDEX IF NOT EXISTS idx_produits_barcode            ON produits(barcode);",

    // -------------------- OPTIQUE indexes --------------------------------
    "CREATE INDEX IF NOT EXISTS idx_prescriptions_client        ON prescriptions(client_id);",
    "CREATE INDEX IF NOT EXISTS idx_prescriptions_user          ON prescriptions(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_ordres_travail_client       ON ordres_travail(client_id);",
    "CREATE INDEX IF NOT EXISTS idx_ordres_travail_user         ON ordres_travail(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_ordres_travail_statut       ON ordres_travail(statut);",
    "CREATE INDEX IF NOT EXISTS idx_ot_notes_ot                 ON ordre_travail_notes(ordre_travail_id);",
    // NOTE: indexes on `bons_commande(ordre_travail_id)` and
    // `factures(ordre_travail_id)` are created in mod.rs::apply_migrations
    // AFTER the columns are added (they don't exist on pre-existing DBs yet).
    "CREATE INDEX IF NOT EXISTS idx_rdv_client                  ON rendez_vous(client_id);",
    "CREATE INDEX IF NOT EXISTS idx_rdv_user                    ON rendez_vous(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_rdv_date                    ON rendez_vous(date_rdv);",
    "CREATE INDEX IF NOT EXISTS idx_ayants_droit_client         ON ayants_droit(client_id);",

    // -------------------- PORTEFEUILLE indexes ---------------------------
    "CREATE INDEX IF NOT EXISTS idx_pf_folders_user             ON portefeuille_folders(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_pf_folders_parent           ON portefeuille_folders(parent_id);",
    "CREATE INDEX IF NOT EXISTS idx_pf_files_user               ON portefeuille_files(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_pf_files_folder             ON portefeuille_files(folder_id);",
    "CREATE INDEX IF NOT EXISTS idx_pf_papers_user              ON portefeuille_papers(user_id);",
    "CREATE INDEX IF NOT EXISTS idx_pf_papers_folder            ON portefeuille_papers(folder_id);",

    // -------------------- OPTIQUE seed: NGAP codes -----------------------
    r#"
    INSERT OR IGNORE INTO ngap_codes (code, libelle, tarif_tnr, taux_remboursement_cnops, taux_remboursement_cnss, categorie) VALUES
        ('FQ',    'Monture de lunettes (forfait)', 200, 80, 70, 'optique'),
        ('FV',    'Verre simple foyer',            150, 80, 70, 'optique'),
        ('FV-MF', 'Verre multifocal/progressif',   300, 80, 70, 'optique'),
        ('LENT',  'Lentille de contact par œil',   250, 80, 70, 'lentille'),
        ('CS',    'Consultation spécialiste',      150, 80, 70, 'consultation'),
        ('CG',    'Consultation généraliste',       80, 80, 70, 'consultation'),
        ('REF',   'Réfraction (examen de vue)',    100, 80, 70, 'acte');
    "#,
];

/// Current schema version (bump when adding migrations).
///
///   v1 — initial Supabase-parity schema (Task 2).
///   v2 — adds the `users` table for offline authentication (Task 4A).
///   v3 — Optique: prescriptions, rendez_vous, ordres_travail, ngap_codes,
///        ayants_droit tables + optical columns on produits/clients/factures/
///        facture_lignes/parametres.
///   v4 — Portefeuille: portefeuille_folders / portefeuille_files /
///        portefeuille_papers document-management tables.
///   v5 — prescriptions: per-eye/per-section refractive index columns
///        (od_indice_vl/og_indice_vl/od_indice_vp/og_indice_vp) for Unifocal.
///   v6 — prescriptions: "Progressif" single-VL section columns
///        (od/og _sph/_cyl/_axe/_add _prog) with Addition.
pub const SCHEMA_VERSION: i64 = 6;
