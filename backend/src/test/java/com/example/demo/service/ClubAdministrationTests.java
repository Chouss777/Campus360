package com.example.demo.service;

import com.example.demo.data.CampusStore;
import com.example.demo.web.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class ClubAdministrationTests {
    @Autowired private CampusStore store;
    @Autowired private ClubService clubs;
    private UUID admin;
    private UUID manager;
    private UUID secondManager;
    private UUID club;
    private UUID otherClub;

    @BeforeEach
    void fixtures() {
        admin = user("ADMINISTRATEUR");
        manager = user("ETUDIANT");
        secondManager = user("ETUDIANT");
        club = club();
        otherClub = club();
        membership(manager, club, "ACCEPTE", "RESPONSABLE");
        membership(secondManager, club, "ACCEPTE", "RESPONSABLE");
        membership(user("ETUDIANT"), club, "EN_ATTENTE", "RESPONSABLE");
        membership(user("ETUDIANT"), club, "REFUSE", "RESPONSABLE");
        membership(user("ETUDIANT"), club, "ACCEPTE", "MEMBRE");
        authenticate(admin);
    }

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void adminListShowsAllAcceptedResponsibleAssignmentsInTheirOwnClub() {
        var listing = clubs.list(true);
        var result = listing.stream().filter(c -> club.equals(c.get("id"))).findFirst().orElseThrow();
        var assignments = (List<?>) result.get("responsables");
        assertEquals(2, assignments.size());
        assertEquals(Set.of(manager, secondManager), assignments.stream().map(r -> ((Map<?, ?>) r).get("id")).collect(java.util.stream.Collectors.toSet()));
        for (var assignment : assignments) {
            var fields = (Map<?, ?>) assignment;
            assertEquals(Set.of("id", "nom", "prenom", "email"), fields.keySet());
            assertTrue(fields.get("email").toString().endsWith("@usms.ma"));
        }
        assertEquals(List.of(), listing.stream().filter(c -> otherClub.equals(c.get("id"))).findFirst().orElseThrow().get("responsables"));
    }

    @Test
    void publicClubResponsesDoNotExposeManagerAssignments() {
        SecurityContextHolder.clearContext();
        assertTrue(clubs.list(false).stream().noneMatch(c -> c.containsKey("responsables")));
        assertFalse(clubs.detail(club).containsKey("responsables"));
    }

    @Test
    void adminListIsStillAdminOnlyAndMembershipManagementIsNotGrantedToAdmin() {
        for (var id : List.of(manager, user("ANNONCEUR"))) {
            authenticate(id);
            assertEquals(403, assertThrows(ApiException.class, () -> clubs.list(true)).status);
        }
        authenticate(admin);
        assertEquals(403, assertThrows(ApiException.class, () -> clubs.members(club)).status);
        SecurityContextHolder.clearContext();
        assertEquals(401, assertThrows(ApiException.class, () -> clubs.list(true)).status);
    }

    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        store.update("INSERT INTO utilisateur(id, nom, prenom, email, mot_de_passe_hash, role, actif, est_verifie) VALUES (?, 'Interface', 'Test', ?, 'test-hash', ?, true, true)", id, "interface-" + id + "@usms.ma", role);
        if ("ETUDIANT".equals(role)) store.update("INSERT INTO etudiant(utilisateur_id) VALUES (?)", id);
        return id;
    }

    private UUID club() {
        UUID id = UUID.randomUUID();
        store.update("INSERT INTO club(id, nom_club, description, categorie) VALUES (?, ?, 'Test interface', 'Test')", id, "Interface " + id);
        return id;
    }

    private void membership(UUID user, UUID club, String status, String role) {
        store.update("INSERT INTO adhesion_club(etudiant_id, club_id, statut, role_dans_club) VALUES (?, ?, ?, ?)", user, club, status, role);
    }

    private void authenticate(UUID id) {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(id.toString(), null, List.of()));
    }
}
