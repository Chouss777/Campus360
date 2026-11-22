package com.example.demo.config;

import com.example.demo.data.CampusStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.crypto.password.PasswordEncoder;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Each test uses an uncommitted private schema on the disposable PostgreSQL instance. */
@SpringBootTest
@EnabledIfEnvironmentVariable(named="CAMPUS360_ISOLATED_ACCEPTANCE", matches="1")
class DemoDataTests {
    @Autowired DataSource dataSource;
    @Autowired PasswordEncoder passwords;
    @TempDir Path uploads;
    Connection connection;
    CampusStore store;
    DemoData seed;

    @BeforeEach
    void isolatedSchema() throws Exception {
        connection = dataSource.getConnection();
        assertTrue(connection.getMetaData().getURL().contains(":25432/"), "Use the isolated PostgreSQL port");
        connection.setAutoCommit(false);
        String schema = "fpk_seed_" + UUID.randomUUID().toString().replace("-", "");
        try (var sql = connection.createStatement()) {
            sql.execute("CREATE SCHEMA " + schema);
            sql.execute("SET LOCAL search_path TO " + schema);
        }
        new ResourceDatabasePopulator(
                new ClassPathResource("db/migration/V1__campus360_mvp1.sql"),
                new ClassPathResource("db/migration/V2__approved_profile_and_club_fields.sql"),
                new ClassPathResource("db/migration/V3__image_access_metadata.sql"),
                new ClassPathResource("db/migration/V4__approved_event_suspension.sql"))
                .populate(connection);
        store = new CampusStore(new JdbcTemplate(new SingleConnectionDataSource(connection, true)));
        String testPassword = System.getenv("CAMPUS360_TEST_PASSWORD");
        assertNotNull(testPassword, "CAMPUS360_TEST_PASSWORD is required for isolated seed tests");
        assertFalse(testPassword.isBlank(), "CAMPUS360_TEST_PASSWORD must not be blank");
        seed = new DemoData(store, passwords, uploads.toString(), testPassword);
    }

    @AfterEach
    void rollbackSchema() throws Exception {
        if (connection != null) { connection.rollback(); connection.close(); }
    }

    @Test
    void emptyDemoHasExactlyThreeUsersSevenClubsAndOnlyTheFourOriginalPublishedEvents() {
        run();
        assertEquals(3, count("utilisateur"));
        assertEquals(7, count("club"));
        assertEquals(4, count("evenement"));
        assertEquals(2, count("inscription"));
        assertEquals(7, count("adhesion_club"));
        assertTrue(store.list("SELECT * FROM evenement").stream().allMatch(e -> "PUBLIE".equals(e.get("statut"))));
        assertEquals(List.of("admin@usms.ma", "annonceur@usms.ma", "etudiant@usms.ma"), store.list("SELECT email FROM utilisateur ORDER BY email").stream().map(u -> u.get("email")).toList());
        assertEquals(7, store.list("SELECT * FROM uploaded_media WHERE public_read = true").size());
        assertTrue(store.list("SELECT * FROM club").stream().allMatch(c -> c.get("logoUrl").toString().startsWith("/api/v1/media/")));
        assertTrue(store.list("SELECT * FROM adhesion_club").stream().allMatch(m -> "RESPONSABLE".equals(m.get("roleDansClub")) && "ACCEPTE".equals(m.get("statut"))));
        var before = snapshot();
        run();
        assertTrue(before.equals(snapshot()), "Restart must not duplicate or reset data");
    }

    @Test
    void legacyUpgradePreservesAllEventStatesRegistrationsCredentialsAndUnrelatedUsers() {
        legacy();
        UUID real = user("real-student@usms.ma", "ETUDIANT");
        UUID oldClub = (UUID) store.one("SELECT id FROM club WHERE categorie = 'Technologie'").get("id");
        UUID event = UUID.randomUUID();
        store.update("INSERT INTO evenement(id,titre,categorie,date_heure_debut,date_heure_fin,lieu,capacite_max,statut,club_id) VALUES (?,'Web','Technologie',now()+interval '1 day',now()+interval '2 days','Campus',10,'PUBLIE',?)", event, oldClub);
        for (String status : List.of("BROUILLON", "SUSPENDU", "ANNULE")) {
            store.update("INSERT INTO evenement(titre,categorie,date_heure_debut,date_heure_fin,lieu,capacite_max,statut,club_id) VALUES (?,'Technologie',now()+interval '1 day',now()+interval '2 days','Campus',10,?,?)", status, status, oldClub);
        }
        store.update("INSERT INTO inscription(etudiant_id,evenement_id) VALUES (?,?)", real, event);
        var events = store.list("SELECT * FROM evenement ORDER BY id");
        var registrations = store.list("SELECT * FROM inscription ORDER BY id");
        var credentials = store.list("SELECT id,email,mot_de_passe_hash,est_verifie FROM utilisateur ORDER BY id");
        run();
        assertEquals(events, store.list("SELECT * FROM evenement ORDER BY id"));
        assertEquals(registrations, store.list("SELECT * FROM inscription ORDER BY id"));
        assertTrue(credentials.equals(store.list("SELECT id,email,mot_de_passe_hash,est_verifie FROM utilisateur ORDER BY id")), "Existing identities and credentials must stay unchanged");
        assertEquals(oldClub, store.one("SELECT id FROM club WHERE nom_club = 'AL KHAWARIZMI IT'").get("id"));
        assertEquals(7, count("club"));
        assertEquals(7, count("utilisateur"));
        assertEquals(true, store.one("SELECT actif FROM utilisateur WHERE id = ?", real).get("actif"));
        assertEquals(4, store.list("SELECT id FROM utilisateur WHERE actif = true").size(), "Real users remain active in addition to the three demo users");
        assertEquals(7, store.list("SELECT id FROM adhesion_club WHERE etudiant_id = ? AND role_dans_club = 'RESPONSABLE' AND statut = 'ACCEPTE'", id("etudiant@usms.ma")).size());
        var after = snapshot();
        run();
        assertTrue(after.equals(snapshot()), "Restart changed state");
    }

    @Test
    void laterAdminEditsAndSuspensionAreNotOverwrittenAtStartup() {
        run();
        store.update("UPDATE club SET statut_actif=false,description='Administrator edit' WHERE nom_club='Beelite Club'");
        store.update("UPDATE adhesion_club SET role_dans_club='MEMBRE'");
        store.update("UPDATE evenement SET statut='SUSPENDU'");
        var before = snapshot();
        run();
        assertTrue(before.equals(snapshot()), "Admin edits were reset");
    }

    @Test
    void approvedCopyCleanupChangesOnlyKnownFixtureFieldsAndIsIdempotent() throws Exception {
        previousCopy();
        var accounts = store.list("SELECT * FROM utilisateur ORDER BY id");
        var memberships = store.list("SELECT * FROM adhesion_club ORDER BY id");
        var registrations = store.list("SELECT * FROM inscription ORDER BY id");
        var protectedEvents = store.list("SELECT id,categorie,date_heure_debut,date_heure_fin,statut,club_id,annonceur_id FROM evenement ORDER BY id");
        run();
        for (var e : resourceRows("published-events.tsv")) {
            var actual = store.one("SELECT titre,description,lieu,capacite_max FROM evenement WHERE id=?", UUID.fromString(e[0]));
            assertEquals(e[1], actual.get("titre"));
            assertEquals(e[2], actual.get("description"));
            assertEquals(e[6], actual.get("lieu"));
            assertEquals(Integer.parseInt(e[7]), actual.get("capaciteMax"));
        }
        for (var c : resourceRows("fpk-clubs.tsv")) {
            assertEquals(c[4], store.one("SELECT description FROM club WHERE nom_club=?", c[2]).get("description"));
        }
        assertTrue(accounts.equals(store.list("SELECT * FROM utilisateur ORDER BY id")), "Accounts or credentials changed");
        assertEquals(memberships, store.list("SELECT * FROM adhesion_club ORDER BY id"));
        assertEquals(registrations, store.list("SELECT * FROM inscription ORDER BY id"));
        assertEquals(protectedEvents, store.list("SELECT id,categorie,date_heure_debut,date_heure_fin,statut,club_id,annonceur_id FROM evenement ORDER BY id"));
        assertEquals("Service universitaire", store.one("SELECT nom_organisation FROM annonceur").get("nomOrganisation"));
        var cleaned = snapshot();
        run();
        assertTrue(cleaned.equals(snapshot()), "Copy cleanup repeated or reset data");
        store.update("UPDATE evenement SET lieu='Organizer venue edit' WHERE titre='Rencontre culturelle'");
        store.update("UPDATE club SET description='Administrator description' WHERE nom_club='JLM'");
        var edited = snapshot();
        run();
        assertTrue(edited.equals(snapshot()), "Subsequent organizer/admin edits were overwritten");
    }

    @Test
    void copyCleanupRejectsCapacityBelowConfirmedRegistrations() throws Exception {
        previousCopy();
        UUID web = UUID.fromString("8c8a82c3-0c70-4aad-9944-551aa0c023ae");
        for (int i = 0; i < 31; i++) {
            UUID student = user("capacity-" + i + "@usms.ma", "ETUDIANT");
            store.update("INSERT INTO inscription(etudiant_id,evenement_id,statut) VALUES (?,?,'CONFIRMEE')", student, web);
        }
        var event = store.one("SELECT * FROM evenement WHERE id=?", web);
        var registrations = store.list("SELECT * FROM inscription ORDER BY id");
        assertThrows(IllegalStateException.class, this::run);
        assertEquals(event, store.one("SELECT * FROM evenement WHERE id=?", web));
        assertEquals(registrations, store.list("SELECT * FROM inscription ORDER BY id"));
    }

    private void previousCopy() throws Exception {
        run();
        for (var c : resourceRows("fpk-clubs.tsv")) {
            store.update("UPDATE club SET nom_club=?,description=? WHERE nom_club=?", c[9], c[10], c[2]);
        }
        for (var e : resourceRows("previous-published-events.tsv")) {
            store.update("UPDATE evenement SET titre=?,description=?,lieu=?,capacite_max=? WHERE id=?", e[1], e[2], e[6], Integer.parseInt(e[7]), UUID.fromString(e[0]));
        }
        store.update("UPDATE annonceur SET nom_organisation='Service universitaire — Démo'");
    }

    private static List<String[]> resourceRows(String name) throws Exception {
        try (var input = new ClassPathResource("demo/" + name).getInputStream()) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8).lines()
                    .filter(line -> !line.isBlank() && !line.startsWith("#"))
                    .map(line -> line.split("\t", -1)).toList();
        }
    }

    @Test
    void modifiedLegacyClubsRequireReviewBeforeAnyRecordIsChanged() {
        legacy();
        store.update("UPDATE club SET description='A real modification'");
        var before = snapshot();
        assertThrows(IllegalStateException.class, this::run);
        assertTrue(before.equals(snapshot()), "Unexpected legacy fixture change");
    }

    @Test
    void unrelatedActiveClubIsNeverArchivedToForceTheSevenClubLimit() {
        legacy();
        store.update("INSERT INTO club(nom_club,description,categorie) VALUES ('Real club','Keep me','Test')");
        var before = snapshot();
        assertThrows(IllegalStateException.class, this::run);
        assertTrue(before.equals(snapshot()), "Unrelated club was modified");
    }

    @Test
    void ambiguousPublishedEventThemeRequiresAProductDecision() {
        legacy();
        UUID club = (UUID) store.one("SELECT id FROM club WHERE categorie='Technologie'").get("id");
        store.update("INSERT INTO evenement(titre,categorie,date_heure_debut,date_heure_fin,lieu,capacite_max,statut,club_id) VALUES ('Unrelated','Sport',now(),now()+interval '1 day','Campus',10,'PUBLIE',?)", club);
        var before = snapshot();
        assertThrows(IllegalStateException.class, this::run);
        assertTrue(before.equals(snapshot()), "Ambiguous event was modified");
    }

    private void legacy() {
        for (String email : List.of("admin@usms.ma", "etudiant@usms.ma", "annonceur@usms.ma", "responsable@usms.ma", "responsable2@usms.ma", "etudiant2@usms.ma")) {
            user(email, email.startsWith("admin") ? "ADMINISTRATEUR" : email.startsWith("annonceur") ? "ANNONCEUR" : "ETUDIANT");
        }
        for (var fixture : List.of(
                new String[]{"Club Informatique — Démo", "Ateliers et rencontres autour de l’informatique.", "Technologie", "responsable@usms.ma"},
                new String[]{"Club Culture — Démo", "Rencontres et activités culturelles du campus.", "Culture", "responsable2@usms.ma"})) {
            UUID club = UUID.randomUUID();
            store.update("INSERT INTO club(id,nom_club,description,categorie) VALUES (?,?,?,?)", club, fixture[0], fixture[1], fixture[2]);
            store.update("INSERT INTO adhesion_club(etudiant_id,club_id,role_dans_club,statut) VALUES (?,?,'RESPONSABLE','ACCEPTE')", id(fixture[3]), club);
        }
    }

    private UUID user(String email, String role) {
        UUID id = id(email);
        store.update("INSERT INTO utilisateur(id,nom,prenom,email,mot_de_passe_hash,role,actif,est_verifie) VALUES (?,'Fixture','Test',?,'unchanged-test-credential',?,true,true)", id, email, role);
        if (role.equals("ETUDIANT")) store.update("INSERT INTO etudiant(utilisateur_id) VALUES (?)", id);
        if (role.equals("ADMINISTRATEUR")) store.update("INSERT INTO administrateur(utilisateur_id) VALUES (?)", id);
        if (role.equals("ANNONCEUR")) store.update("INSERT INTO annonceur(utilisateur_id,nom_organisation) VALUES (?,'University advertiser')", id);
        return id;
    }

    private static UUID id(String email) { return UUID.nameUUIDFromBytes(email.getBytes(StandardCharsets.UTF_8)); }
    private void run() { seed.run(new DefaultApplicationArguments()); }
    private int count(String table) { return ((Number) store.one("SELECT count(*) AS total FROM " + table).get("total")).intValue(); }
    private List<List<Map<String,Object>>> snapshot() {
        return List.of("utilisateur", "club", "evenement", "inscription", "adhesion_club", "uploaded_media").stream()
                .map(table -> store.list("SELECT * FROM " + table + " ORDER BY " + (table.equals("uploaded_media") ? "filename" : "id"))).toList();
    }
}
