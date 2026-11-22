package com.example.demo.service;

import com.example.demo.data.CampusStore;
import com.example.demo.web.ApiException;
import com.example.demo.web.Requests;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class ClubService {
    private final CampusStore store;
    private final AccessService access;
    private final EventService events;
    private static final String CLUBS = "SELECT c.*, (SELECT count(*) FROM adhesion_club a WHERE a.club_id = c.id AND a.statut = 'ACCEPTE') AS nombre_membres FROM club c ";

    public ClubService(CampusStore store, AccessService access, EventService events) {
        this.store = store;
        this.access = access;
        this.events = events;
    }

    public List<Map<String, Object>> list(boolean admin) {
        if (admin) access.require("ADMINISTRATEUR");
        var clubs = store.list(CLUBS + (admin ? "" : "WHERE c.statut_actif = true ") + "ORDER BY c.nom_club");
        if (admin) {
            var managers = store.list("""
                    SELECT a.club_id, u.id, u.nom, u.prenom, u.email
                    FROM adhesion_club a JOIN utilisateur u ON u.id = a.etudiant_id
                    WHERE a.statut = 'ACCEPTE' AND a.role_dans_club = 'RESPONSABLE'
                    ORDER BY u.nom, u.prenom, u.id
                    """);
            for (var club : clubs) {
                club.put("responsables", managers.stream()
                        .filter(manager -> club.get("id").equals(manager.get("clubId")))
                        .map(manager -> Map.of("id", manager.get("id"), "nom", manager.get("nom"),
                                "prenom", manager.get("prenom"), "email", manager.get("email")))
                        .toList());
            }
        }
        return clubs;
    }

    public Map<String, Object> detail(UUID id) {
        var club = store.one(CLUBS + "WHERE c.id = ? AND c.statut_actif = true", id);
        club.put("evenements", events.catalogue("", null, null, id, false));
        return club;
    }

    public Map<String, Object> save(UUID id, Requests.Club input) {
        access.require("ADMINISTRATEUR");
        AccountService.validateImage(input.logoUrl());
        if (input.logoUrl().startsWith("/api/v1/media/") && !store.exists("SELECT filename FROM uploaded_media WHERE filename = ? AND public_read = true", input.logoUrl().substring("/api/v1/media/".length()))) {
            throw new ApiException(422, "LOGO_INVALID", "Importez le logo avec un compte administrateur.");
        }
        if (id == null) {
            if (input.responsableId() == null) throw new ApiException(422, "RESPONSIBLE_REQUIRED", "Désignez un étudiant responsable.");
            id = UUID.randomUUID();
            store.update("INSERT INTO club(id, nom_club, description, categorie, logo_url, statut_actif, contact, bureau) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    id, input.nomClub().trim(), input.description().trim(), input.categorie().trim(), input.logoUrl(), input.statutActif(), input.contact() == null ? "" : input.contact(), input.bureau() == null ? "" : input.bureau());
        } else {
            store.one("SELECT id FROM club WHERE id = ? FOR UPDATE", id);
            store.update("UPDATE club SET nom_club = ?, description = ?, categorie = ?, logo_url = ?, statut_actif = ?, contact = COALESCE(?, contact), bureau = COALESCE(?, bureau) WHERE id = ?",
                    input.nomClub().trim(), input.description().trim(), input.categorie().trim(), input.logoUrl(), input.statutActif(), input.contact(), input.bureau(), id);
        }
        if (input.responsableId() != null) nominate(id, input.responsableId());
        return store.one(CLUBS + "WHERE c.id = ?", id);
    }

    public void nominate(UUID clubId, UUID studentId) {
        access.require("ADMINISTRATEUR");
        store.one("SELECT id FROM club WHERE id = ? FOR UPDATE", clubId);
        if (!store.exists("SELECT id FROM utilisateur WHERE id = ? AND role = 'ETUDIANT' AND est_verifie = true AND actif = true", studentId)) {
            throw new ApiException(422, "STUDENT_REQUIRED", "Choisissez un étudiant vérifié et actif.");
        }
        store.update("INSERT INTO adhesion_club(etudiant_id, club_id, role_dans_club, statut) VALUES (?, ?, 'RESPONSABLE', 'ACCEPTE') ON CONFLICT (etudiant_id, club_id) DO UPDATE SET role_dans_club = 'RESPONSABLE', statut = 'ACCEPTE'", studentId, clubId);
    }

    public Map<String, Object> join(UUID clubId) {
        UUID id = access.require("ETUDIANT");
        store.one("SELECT id FROM club WHERE id = ? AND statut_actif = true FOR UPDATE", clubId);
        if (store.exists("SELECT id FROM adhesion_club WHERE club_id = ? AND etudiant_id = ? AND statut IN ('EN_ATTENTE', 'ACCEPTE')", clubId, id)) {
            throw new ApiException(409, "MEMBERSHIP_EXISTS", "Une adhésion ou demande existe déjà.");
        }
        store.update("INSERT INTO adhesion_club(etudiant_id, club_id) VALUES (?, ?) ON CONFLICT (etudiant_id, club_id) DO UPDATE SET statut = 'EN_ATTENTE', role_dans_club = 'MEMBRE', date_demande = now()", id, clubId);
        return store.one("SELECT * FROM adhesion_club WHERE club_id = ? AND etudiant_id = ?", clubId, id);
    }

    public List<Map<String, Object>> mine() {
        return store.list("SELECT a.*, c.nom_club, c.statut_actif FROM adhesion_club a JOIN club c ON c.id = a.club_id WHERE a.etudiant_id = ? ORDER BY a.date_demande DESC", access.require("ETUDIANT"));
    }

    public List<Map<String, Object>> members(UUID clubId) {
        access.manager(clubId);
        return store.list("SELECT a.*, u.nom, u.prenom, u.email FROM adhesion_club a JOIN utilisateur u ON u.id = a.etudiant_id WHERE a.club_id = ? ORDER BY a.date_demande DESC", clubId);
    }

    public void decide(UUID clubId, UUID membershipId, String status) {
        access.manager(clubId);
        var membership = store.one("SELECT * FROM adhesion_club WHERE id = ? AND club_id = ? FOR UPDATE", membershipId, clubId);
        if (!"EN_ATTENTE".equals(membership.get("statut"))) throw new ApiException(409, "MEMBERSHIP_NOT_PENDING", "Cette demande a déjà été traitée.");
        store.update("UPDATE adhesion_club SET statut = ? WHERE id = ?", status, membershipId);
    }

    public void remove(UUID clubId, UUID membershipId) {
        access.manager(clubId);
        var membership = store.one("SELECT * FROM adhesion_club WHERE id = ? AND club_id = ? FOR UPDATE", membershipId, clubId);
        if (!"ACCEPTE".equals(membership.get("statut"))) throw new ApiException(409, "MEMBERSHIP_NOT_ACCEPTED", "Ce membre ne possède pas une adhésion acceptée.");
        store.update("DELETE FROM adhesion_club WHERE id = ?", membershipId);
    }
}
