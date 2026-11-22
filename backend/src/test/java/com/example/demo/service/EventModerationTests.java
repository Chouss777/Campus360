package com.example.demo.service;

import com.example.demo.data.CampusStore;
import com.example.demo.web.ApiException;
import com.example.demo.web.Requests;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class EventModerationTests {
    @Autowired private CampusStore store;
    @Autowired private EventService events;
    @Autowired private ClubService clubs;

    private UUID admin;
    private UUID manager;
    private UUID student;
    private UUID anotherStudent;
    private UUID advertiser;
    private UUID club;
    private UUID event;

    @BeforeEach
    void createTransactionalFixtures() {
        admin = user("ADMINISTRATEUR");
        manager = user("ETUDIANT");
        student = user("ETUDIANT");
        anotherStudent = user("ETUDIANT");
        advertiser = user("ANNONCEUR");
        club = UUID.randomUUID();
        event = UUID.randomUUID();
        store.update("INSERT INTO club(id, nom_club, description, categorie) VALUES (?, ?, 'Test D01', 'Test')", club, "D01 " + club);
        store.update("INSERT INTO adhesion_club(etudiant_id, club_id, statut, role_dans_club) VALUES (?, ?, 'ACCEPTE', 'RESPONSABLE')", manager, club);
        store.update("INSERT INTO evenement(id, titre, description, categorie, date_heure_debut, date_heure_fin, lieu, capacite_max, statut, club_id) VALUES (?, 'Test D01', 'Test', 'Test', now() + interval '1 day', now() + interval '2 days', 'Campus', 1, 'PUBLIE', ?)", event, club);
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void suspensionHidesPublicViewsAndPreservesExistingRegistrationRecords() {
        store.update("INSERT INTO inscription(etudiant_id, evenement_id) VALUES (?, ?)", student, event);
        var before = store.one("SELECT * FROM inscription WHERE evenement_id = ?", event);
        authenticate(admin);

        events.suspend(event);

        assertEquals("SUSPENDU", status());
        assertTrue(events.catalogue("", null, null, club, false).isEmpty());
        assertTrue(((List<?>) clubs.detail(club).get("evenements")).isEmpty());
        assertEquals(404, assertThrows(ApiException.class, () -> events.detail(event)).status);
        assertEquals(before, store.one("SELECT * FROM inscription WHERE evenement_id = ?", event));
        authenticate(student);
        assertEquals("CONFIRMEE", events.planning().getFirst().get("statut"));
        authenticate(anotherStudent);
        assertEquals("EVENT_UNAVAILABLE", assertThrows(ApiException.class, () -> events.register(event)).code);
    }

    @Test
    void restoringAFullEventPublishesItWithCalculatedFullAvailability() {
        store.update("INSERT INTO inscription(etudiant_id, evenement_id) VALUES (?, ?)", student, event);
        authenticate(admin);
        events.suspend(event);

        events.restore(event);

        var restored = events.detail(event);
        assertEquals("PUBLIE", restored.get("statut"));
        assertEquals("COMPLET", restored.get("disponibilite"));
        assertEquals(0, ((Number) restored.get("placesRestantes")).intValue());
        authenticate(anotherStudent);
        assertEquals("EVENT_FULL", assertThrows(ApiException.class, () -> events.register(event)).code);
        assertEquals("CONFIRMEE", store.one("SELECT statut FROM inscription WHERE evenement_id = ?", event).get("statut"));
    }

    @Test
    void nonAdministratorsCannotSuspendRestoreOrValidate() {
        for (UUID id : List.of(manager, student, advertiser)) {
            authenticate(id);
            assertEquals(403, assertThrows(ApiException.class, () -> events.suspend(event)).status);
            assertEquals(403, assertThrows(ApiException.class, () -> events.restore(event)).status);
            assertEquals(403, assertThrows(ApiException.class, () -> events.validate(event)).status);
        }
        assertEquals("PUBLIE", status());
    }

    @Test
    void organizerCannotBypassAdministrativeSuspensionThroughEventSave() {
        authenticate(manager);
        assertEquals(403, assertThrows(ApiException.class, () -> events.save(null, input("SUSPENDU", club))).status);
        assertEquals(403, assertThrows(ApiException.class, () -> events.save(event, input("SUSPENDU", club))).status);
        authenticate(admin);
        events.suspend(event);
        authenticate(manager);
        for (String target : List.of("PUBLIE", "BROUILLON", "ANNULE")) {
            assertEquals(403, assertThrows(ApiException.class, () -> events.save(event, input(target, club))).status);
        }
        events.save(event, input("SUSPENDU", club));
        assertEquals("SUSPENDU", status());
    }

    @Test
    void organizersCanStillPublishDirectlyAndAdminCanValidateDrafts() {
        authenticate(manager);
        var direct = events.save(null, input("PUBLIE", club));
        assertEquals("PUBLIE", events.detail((UUID) direct.get("id")).get("statut"));
        authenticate(advertiser);
        var advertised = events.save(null, input("PUBLIE", null));
        assertEquals("PUBLIE", events.detail((UUID) advertised.get("id")).get("statut"));
        assertEquals(403, assertThrows(ApiException.class, () -> events.save(null, input("SUSPENDU", null))).status);
        authenticate(manager);
        var draft = events.save(null, input("BROUILLON", club));
        authenticate(admin);
        events.validate((UUID) draft.get("id"));
        assertEquals("PUBLIE", events.detail((UUID) draft.get("id")).get("statut"));
    }

    @Test
    void cancellationDuringSuspensionReleasesThePlaceWithoutRestoringTheEvent() {
        authenticate(student);
        UUID registration = (UUID) events.register(event).get("id");
        authenticate(admin);
        events.suspend(event);
        authenticate(student);
        events.cancel(registration);
        assertEquals("SUSPENDU", status());
        authenticate(admin);
        events.restore(event);
        assertEquals("OUVERT", events.detail(event).get("disponibilite"));
        authenticate(anotherStudent);
        assertEquals("CONFIRMEE", events.register(event).get("statut"));
    }

    @Test
    void moderationTransitionsAreIdempotentAndDoNotRepublishCancelledEvents() {
        authenticate(admin);
        events.suspend(event);
        events.suspend(event);
        assertEquals(409, assertThrows(ApiException.class, () -> events.validate(event)).status);
        events.restore(event);
        events.restore(event);
        events.validate(event);
        events.withdraw(event);
        assertEquals(409, assertThrows(ApiException.class, () -> events.restore(event)).status);
        assertEquals(409, assertThrows(ApiException.class, () -> events.validate(event)).status);
        assertEquals(409, assertThrows(ApiException.class, () -> events.suspend(event)).status);
        assertEquals("ANNULE", status());
    }

    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        store.update("INSERT INTO utilisateur(id, nom, prenom, email, mot_de_passe_hash, role, actif, est_verifie) VALUES (?, 'D01', 'Test', ?, 'test-hash', ?, true, true)", id, "d01-" + id + "@usms.ma", role);
        if ("ETUDIANT".equals(role)) store.update("INSERT INTO etudiant(utilisateur_id) VALUES (?)", id);
        if ("ADMINISTRATEUR".equals(role)) store.update("INSERT INTO administrateur(utilisateur_id) VALUES (?)", id);
        if ("ANNONCEUR".equals(role)) store.update("INSERT INTO annonceur(utilisateur_id, nom_organisation) VALUES (?, 'D01 organisation')", id);
        return id;
    }

    private void authenticate(UUID id) {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(id.toString(), null, List.of()));
    }

    private String status() {
        return (String) store.one("SELECT statut FROM evenement WHERE id = ?", event).get("statut");
    }

    private Requests.Event input(String status, UUID clubId) {
        return new Requests.Event("Test D01 modifié", "Description", "Test", OffsetDateTime.now().plusDays(1),
                OffsetDateTime.now().plusDays(2), "Campus", 1, status, clubId);
    }
}
