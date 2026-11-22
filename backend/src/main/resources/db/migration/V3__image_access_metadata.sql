-- Technical ownership metadata keeps student photos private and club logos public.
CREATE TABLE uploaded_media (
    filename VARCHAR(50) PRIMARY KEY,
    owner_id UUID REFERENCES utilisateur(id),
    public_read BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO uploaded_media(filename, owner_id, public_read)
SELECT split_part(photo_profil, '/', 5), utilisateur_id, FALSE
FROM etudiant WHERE photo_profil ~ '^/api/v1/media/[a-f0-9-]{36}\.(png|jpg)$'
ON CONFLICT DO NOTHING;

INSERT INTO uploaded_media(filename, public_read)
SELECT split_part(logo_url, '/', 5), TRUE
FROM club WHERE logo_url ~ '^/api/v1/media/[a-f0-9-]{36}\.(png|jpg)$'
ON CONFLICT DO NOTHING;
