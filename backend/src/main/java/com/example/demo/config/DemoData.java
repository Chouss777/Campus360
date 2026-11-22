package com.example.demo.config;

import com.example.demo.data.CampusStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Demo-profile data only. Existing event states, credentials and history are never reset. */
@Component
@Profile("demo")
public class DemoData implements ApplicationRunner {
    private final CampusStore store;
    private final PasswordEncoder passwords;
    private final Path uploads;
    private final String demoPassword;

    public DemoData(CampusStore store, PasswordEncoder passwords,
                    @Value("${campus360.upload-dir}") String uploads,
                    @Value("${campus360.demo-password:}") String demoPassword) {
        this.store = store;
        this.passwords = passwords;
        this.uploads = Path.of(uploads).toAbsolutePath().normalize();
        this.demoPassword = demoPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments arguments) {
        boolean empty = !store.exists("SELECT id FROM utilisateur LIMIT 1");
        var definitions = rows("fpk-clubs.tsv");
        boolean legacy = definitions.stream().anyMatch(c -> !c[7].isEmpty()
                && store.exists("SELECT id FROM club WHERE nom_club = ?", c[7]));
        if (legacy) validateLegacy(definitions);
        UUID admin = user("admin@usms.ma", "Administration", "Campus", "ADMINISTRATEUR");
        UUID student = user("etudiant@usms.ma", "Étudiant", "Démo", "ETUDIANT");
        // Email renaming is pending: preserve this advertiser's UUID and credentials.
        UUID advertiser = user("annonceur@usms.ma", "Service", "Université", "ANNONCEUR");
        Map<String, UUID> clubs = new LinkedHashMap<>();
        for (var definition : definitions) {
            UUID club = club(definition, installLogo(definition, admin));
            clubs.put(definition[0], club);
            if (empty || legacy) {
                store.update("""
                        INSERT INTO adhesion_club(etudiant_id, club_id, role_dans_club, statut)
                        VALUES (?, ?, 'RESPONSABLE', 'ACCEPTE')
                        ON CONFLICT(etudiant_id, club_id) DO UPDATE
                        SET role_dans_club = 'RESPONSABLE', statut = 'ACCEPTE'
                        """, student, club);
            }
        }
        if (legacy) {
            for (String email : List.of("responsable@usms.ma", "responsable2@usms.ma", "etudiant2@usms.ma")) {
                UUID retired = userId(email);
                store.update("UPDATE utilisateur SET actif = false WHERE id = ? AND email = ?", retired, email);
                for (UUID club : clubs.values()) {
                    store.update("UPDATE adhesion_club SET role_dans_club = 'MEMBRE' WHERE etudiant_id = ? AND club_id = ? AND role_dans_club = 'RESPONSABLE'", retired, club);
                }
            }
        }
        // Fixed copies of the four existing published records, only for an empty demo DB.
        // Existing databases never get new events, registrations, dates or status changes.
        if (empty) seedPublishedSnapshot(clubs, advertiser, student);
        cleanRetainedEventCopy(clubs, advertiser);
        store.update("UPDATE annonceur SET nom_organisation = 'Service universitaire' WHERE utilisateur_id = ? AND nom_organisation = 'Service universitaire — Démo'", advertiser);
    }

    private void validateLegacy(List<String[]> definitions) {
        for (var club : store.list("SELECT nom_club FROM club WHERE statut_actif = true")) {
            if (definitions.stream().noneMatch(c -> c[2].equals(club.get("nomClub")) || c[7].equals(club.get("nomClub")))) {
                throw new IllegalStateException("FPK demo cleanup requires review: an unrelated active club exists.");
            }
        }
        for (var c : definitions) {
            if (c[7].isEmpty()) continue;
            var old = store.list("SELECT id, description, categorie FROM club WHERE nom_club = ?", c[7]);
            if (old.isEmpty() || !c[8].equals(old.getFirst().get("description"))
                    || !c[3].equals(old.getFirst().get("categorie"))
                    || store.exists("SELECT id FROM club WHERE nom_club = ?", c[2])) {
                throw new IllegalStateException("FPK demo cleanup requires review: original club fixtures were modified or a target already exists.");
            }
            if (store.exists("SELECT id FROM evenement WHERE club_id = ? AND statut = 'PUBLIE' AND categorie <> ?", old.getFirst().get("id"), c[3])) {
                throw new IllegalStateException("FPK demo cleanup requires review: a published event needs an organizer decision.");
            }
        }
        for (String email : List.of("responsable@usms.ma", "responsable2@usms.ma", "etudiant2@usms.ma")) {
            if (!store.exists("SELECT id FROM utilisateur WHERE id = ? AND email = ? AND role = 'ETUDIANT'", userId(email), email)) {
                throw new IllegalStateException("FPK demo cleanup requires review: a retired seed identity does not match.");
            }
        }
    }

    private UUID user(String email, String first, String last, String role) {
        if (store.exists("SELECT id FROM utilisateur WHERE email = ?", email)) return (UUID) store.one("SELECT id FROM utilisateur WHERE email = ?", email).get("id");
        if (demoPassword.isBlank()) {
            throw new IllegalStateException("DEMO_ACCOUNT_PASSWORD is required to create demo accounts");
        }
        UUID id = userId(email);
        store.update("INSERT INTO utilisateur(id, nom, prenom, email, mot_de_passe_hash, role, actif, est_verifie) VALUES (?, ?, ?, ?, ?, ?, true, true)", id, last, first, email, passwords.encode(demoPassword), role);
        if ("ETUDIANT".equals(role)) store.update("INSERT INTO etudiant(utilisateur_id, filiere, niveau) VALUES (?, 'Informatique', 'Licence')", id);
        if ("ADMINISTRATEUR".equals(role)) store.update("INSERT INTO administrateur(utilisateur_id, departement) VALUES (?, 'Administration universitaire')", id);
        if ("ANNONCEUR".equals(role)) store.update("INSERT INTO annonceur(utilisateur_id, nom_organisation, type_partenaire) VALUES (?, 'Service universitaire', 'Institution')", id);
        return id;
    }

    private UUID club(String[] c, String logo) {
        var existing = store.list("SELECT id FROM club WHERE id = ? OR nom_club = ? OR logo_url = ?", UUID.fromString(c[1]), c[2], logo);
        if (existing.size() > 1) throw new IllegalStateException("FPK demo club identity collision requires review.");
        if (!existing.isEmpty()) {
            UUID id = (UUID) existing.getFirst().get("id");
            // Match only the previous approved fixture copy; preserve later admin edits.
            store.update("UPDATE club SET nom_club = ?, description = ? WHERE id = ? AND logo_url = ? AND nom_club = ? AND description = ?",
                    c[2], c[4], id, logo, c[9], c[10]);
            return id;
        }
        if (!c[7].isEmpty()) {
            var old = store.list("SELECT id FROM club WHERE nom_club = ?", c[7]);
            if (!old.isEmpty()) {
                UUID id = (UUID) old.getFirst().get("id");
                // Preserve UUID, dates, memberships and every event reference.
                store.update("UPDATE club SET nom_club = ?, description = ?, categorie = ?, logo_url = ? WHERE id = ?", c[2], c[4], c[3], logo, id);
                return id;
            }
        }
        UUID id = UUID.fromString(c[1]);
        store.update("INSERT INTO club(id, nom_club, description, categorie, logo_url) VALUES (?, ?, ?, ?, ?)", id, c[2], c[4], c[3], logo);
        return id;
    }

    private String installLogo(String[] c, UUID admin) {
        String filename = UUID.fromString(c[6]) + c[5].substring(c[5].lastIndexOf('.'));
        Path target = uploads.resolve(filename);
        try (var input = new ClassPathResource("demo/clubs/" + c[5]).getInputStream()) {
            Files.createDirectories(uploads);
            if (!Files.exists(target)) Files.copy(input, target);
        } catch (IOException failure) {
            throw new UncheckedIOException("Cannot install original FPK demo logo", failure);
        }
        store.update("INSERT INTO uploaded_media(filename, owner_id, public_read) VALUES (?, ?, true) ON CONFLICT DO NOTHING", filename, admin);
        if (!store.exists("SELECT filename FROM uploaded_media WHERE filename = ? AND public_read = true AND owner_id = ?", filename, admin)) {
            throw new IllegalStateException("FPK demo logo metadata collision requires review.");
        }
        return "/api/v1/media/" + filename;
    }

    private void seedPublishedSnapshot(Map<String, UUID> clubs, UUID advertiser, UUID student) {
        for (var e : rows("published-events.tsv")) {
            String clubKey = e.length > 8 ? e[8] : "";
            UUID club = clubKey.isEmpty() ? null : clubs.get(clubKey);
            store.update("""
                    INSERT INTO evenement(id, titre, description, categorie, date_heure_debut, date_heure_fin, lieu, capacite_max, statut, club_id, annonceur_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PUBLIE', ?, ?)
                    """, UUID.fromString(e[0]), e[1], e[2], e[3], OffsetDateTime.parse(e[4]), OffsetDateTime.parse(e[5]), e[6], Integer.parseInt(e[7]), club, club == null ? advertiser : null);
        }
        for (var r : rows("published-registrations.tsv")) {
            store.update("INSERT INTO inscription(id, etudiant_id, evenement_id, date_inscription, statut) VALUES (?, ?, ?, ?, ?)", UUID.fromString(r[0]), student, UUID.fromString(r[2]), OffsetDateTime.parse(r[3]), r[4]);
        }
    }

    private void cleanRetainedEventCopy(Map<String, UUID> clubs, UUID advertiser) {
        var updated = rows("published-events.tsv");
        for (var prior : rows("previous-published-events.tsv")) {
            var next = updated.stream().filter(e -> e[0].equals(prior[0])).findFirst().orElseThrow();
            String clubKey = prior.length > 8 ? prior[8] : "";
            UUID club = clubKey.isEmpty() ? null : clubs.get(clubKey);
            UUID owner = club == null ? advertiser : null;
            // Same row lock as registration/cancellation/capacity changes (D09).
            // Exact old fixture content prevents touching other events or subsequent edits.
            if (!store.exists("""
                    SELECT id FROM evenement WHERE id = ? AND titre = ? AND description = ?
                    AND categorie = ? AND date_heure_debut = ? AND date_heure_fin = ?
                    AND lieu = ? AND capacite_max = ? AND statut = 'PUBLIE'
                    AND club_id IS NOT DISTINCT FROM ? AND annonceur_id IS NOT DISTINCT FROM ?
                    FOR UPDATE
                    """, UUID.fromString(prior[0]), prior[1], prior[2], prior[3],
                    OffsetDateTime.parse(prior[4]), OffsetDateTime.parse(prior[5]), prior[6],
                    Integer.parseInt(prior[7]), club, owner)) continue;
            int capacity = Integer.parseInt(next[7]);
            long confirmed = ((Number) store.one("SELECT count(*) AS total FROM inscription WHERE evenement_id = ? AND statut = 'CONFIRMEE'", UUID.fromString(prior[0])).get("total")).longValue();
            if (confirmed > capacity) throw new IllegalStateException("FPK demo cleanup requires review: proposed capacity is below confirmed registrations.");
            store.update("UPDATE evenement SET titre = ?, description = ?, lieu = ?, capacite_max = ? WHERE id = ?",
                    next[1], next[2], next[6], capacity, UUID.fromString(prior[0]));
        }
    }

    private static UUID userId(String email) {
        return UUID.nameUUIDFromBytes(email.getBytes(StandardCharsets.UTF_8));
    }

    private static List<String[]> rows(String name) {
        try (var input = new ClassPathResource("demo/" + name).getInputStream()) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8).lines()
                    .filter(line -> !line.isBlank() && !line.startsWith("#"))
                    .map(line -> line.split("\t", -1)).toList();
        } catch (IOException failure) {
            throw new UncheckedIOException("Cannot read FPK demo manifest", failure);
        }
    }
}
