CREATE TABLE utilisateur (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom VARCHAR(120) NOT NULL,
    prenom VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@usms\.ma$'),
    mot_de_passe_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ETUDIANT', 'ANNONCEUR', 'ADMINISTRATEUR')),
    code_verification_otp TEXT,
    verification_expires_at TIMESTAMPTZ,
    verification_sent_at TIMESTAMPTZ,
    verification_attempts INTEGER NOT NULL DEFAULT 0,
    est_verifie BOOLEAN NOT NULL DEFAULT FALSE,
    actif BOOLEAN NOT NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE etudiant (
    utilisateur_id UUID PRIMARY KEY REFERENCES utilisateur(id),
    cne_apogee VARCHAR(100) NOT NULL DEFAULT '',
    filiere VARCHAR(200) NOT NULL DEFAULT '',
    niveau VARCHAR(100) NOT NULL DEFAULT '',
    centres_interet TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE annonceur (
    utilisateur_id UUID PRIMARY KEY REFERENCES utilisateur(id),
    nom_organisation VARCHAR(200) NOT NULL,
    type_partenaire VARCHAR(120) NOT NULL DEFAULT '',
    contact_tel VARCHAR(50) NOT NULL DEFAULT ''
);

CREATE TABLE administrateur (
    utilisateur_id UUID PRIMARY KEY REFERENCES utilisateur(id),
    departement VARCHAR(200) NOT NULL DEFAULT ''
);

CREATE TABLE club (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom_club VARCHAR(200) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    categorie VARCHAR(120) NOT NULL,
    logo_url TEXT NOT NULL DEFAULT '',
    statut_actif BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE adhesion_club (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etudiant_id UUID NOT NULL REFERENCES etudiant(utilisateur_id),
    club_id UUID NOT NULL REFERENCES club(id),
    role_dans_club VARCHAR(20) NOT NULL DEFAULT 'MEMBRE' CHECK (role_dans_club IN ('MEMBRE', 'RESPONSABLE')),
    statut VARCHAR(20) NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'ACCEPTE', 'REFUSE')),
    date_demande TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (etudiant_id, club_id)
);

CREATE TABLE evenement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titre VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    categorie VARCHAR(120) NOT NULL,
    date_heure_debut TIMESTAMPTZ NOT NULL,
    date_heure_fin TIMESTAMPTZ NOT NULL,
    lieu VARCHAR(300) NOT NULL,
    capacite_max INTEGER NOT NULL CHECK (capacite_max > 0),
    statut VARCHAR(20) NOT NULL DEFAULT 'BROUILLON' CHECK (statut IN ('BROUILLON', 'PUBLIE', 'ANNULE')),
    club_id UUID REFERENCES club(id),
    annonceur_id UUID REFERENCES annonceur(utilisateur_id),
    CHECK ((club_id IS NOT NULL)::int + (annonceur_id IS NOT NULL)::int = 1),
    CHECK (date_heure_fin > date_heure_debut)
);

CREATE TABLE inscription (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etudiant_id UUID NOT NULL REFERENCES etudiant(utilisateur_id),
    evenement_id UUID NOT NULL REFERENCES evenement(id),
    date_inscription TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut VARCHAR(20) NOT NULL DEFAULT 'CONFIRMEE' CHECK (statut IN ('CONFIRMEE', 'ANNULEE')),
    UNIQUE (etudiant_id, evenement_id)
);

CREATE INDEX evenement_catalogue_idx ON evenement(statut, date_heure_debut);
CREATE INDEX evenement_club_idx ON evenement(club_id);
CREATE INDEX inscription_places_idx ON inscription(evenement_id, statut);
CREATE INDEX adhesion_club_membres_idx ON adhesion_club(club_id, statut);

-- Technical delivery queue for OTP and registration confirmation emails.
CREATE TABLE outbound_email (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient VARCHAR(254) NOT NULL,
    subject VARCHAR(250) NOT NULL,
    body TEXT NOT NULL,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
