package com.example.demo.service;

import com.example.demo.data.CampusStore;
import com.example.demo.web.ApiException;
import com.example.demo.web.Requests;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional
public class EventService {
    public static final String EVENTS = """
            SELECT e.*, COALESCE(c.nom_club, a.nom_organisation) AS organisateur,
                   a.type_partenaire, a.contact_tel,
                   c.statut_actif AS club_actif,
                   e.capacite_max - COALESCE(r.confirmed, 0) AS places_restantes
            FROM evenement e
            LEFT JOIN club c ON c.id = e.club_id
            LEFT JOIN annonceur a ON a.utilisateur_id = e.annonceur_id
            LEFT JOIN (SELECT evenement_id, count(*) AS confirmed FROM inscription
                       WHERE statut = 'CONFIRMEE' GROUP BY evenement_id) r ON r.evenement_id = e.id
            """;
    private final CampusStore store;
    private final AccessService access;
    private final MailService mail;
    private static final ZoneId CAMPUS_ZONE = ZoneId.of("Africa/Casablanca");

    public EventService(CampusStore store, AccessService access, MailService mail) {
        this.store = store;
        this.access = access;
        this.mail = mail;
    }

    public List<Map<String, Object>> catalogue(String text, String category, LocalDate date, UUID clubId, boolean available) {
        StringBuilder sql = new StringBuilder(EVENTS + "WHERE e.statut = 'PUBLIE' ");
        List<Object> arguments = new ArrayList<>();
        if (!text.isBlank()) {
            sql.append("AND (e.titre ILIKE ? OR e.description ILIKE ?) ");
            arguments.add("%" + text.trim() + "%");
            arguments.add("%" + text.trim() + "%");
        }
        if (category != null && !category.isBlank()) {
            sql.append("AND e.categorie = ? ");
            arguments.add(category);
        }
        if (date != null) {
            sql.append("AND e.date_heure_debut >= ? AND e.date_heure_debut < ? ");
            arguments.add(date.atStartOfDay(CAMPUS_ZONE).toOffsetDateTime());
            arguments.add(date.plusDays(1).atStartOfDay(CAMPUS_ZONE).toOffsetDateTime());
        }
        if (clubId != null) {
            sql.append("AND e.club_id = ? ");
            arguments.add(clubId);
        }
        if (available) sql.append("AND e.capacite_max > COALESCE(r.confirmed, 0) ");
        sql.append("ORDER BY e.date_heure_debut, e.id");
        return decorate(store.list(sql.toString(), arguments.toArray()));
    }

    public Map<String, Object> detail(UUID id) {
        return decorate(store.one(EVENTS + "WHERE e.id = ? AND e.statut = 'PUBLIE'", id));
    }

    public List<Map<String, Object>> managed(boolean admin) {
        if (admin) {
            access.require("ADMINISTRATEUR");
            return decorate(store.list(EVENTS + "ORDER BY e.date_heure_debut DESC"));
        }
        var user = access.current();
        return decorate(store.list(EVENTS + """
                WHERE (? = 'ANNONCEUR' AND e.annonceur_id = ?)
                   OR (? = 'ETUDIANT' AND EXISTS (SELECT 1 FROM adhesion_club m
                       WHERE m.club_id = e.club_id AND m.etudiant_id = ?
                         AND m.statut = 'ACCEPTE' AND m.role_dans_club = 'RESPONSABLE'))
                ORDER BY e.date_heure_debut DESC
                """, user.get("role"), user.get("id"), user.get("role"), user.get("id")));
    }

    public Map<String, Object> save(UUID id, Requests.Event input) {
        if (!input.dateHeureFin().isAfter(input.dateHeureDebut())) throw new ApiException(422, "DATES_INVALID", "La fin doit être postérieure au début.");
        var user = access.current();
        if (id == null) {
            if ("SUSPENDU".equals(input.statut())) {
                throw new ApiException(403, "ADMIN_MODERATION_REQUIRED", "La suspension est réservée à l’administration.");
            }
            UUID clubId = input.clubId();
            UUID advertiser = null;
            if ("ANNONCEUR".equals(user.get("role"))) {
                if (clubId != null) throw new ApiException(403, "ORGANIZER_FORBIDDEN", "Un annonceur publie pour son organisme.");
                advertiser = (UUID) user.get("id");
            } else {
                if (clubId == null) throw new ApiException(422, "CLUB_REQUIRED", "Choisissez votre club organisateur.");
                access.manager(clubId);
            }
            id = UUID.randomUUID();
            store.update("INSERT INTO evenement(id, titre, description, categorie, date_heure_debut, date_heure_fin, lieu, capacite_max, statut, club_id, annonceur_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    id, input.titre().trim(), input.description().trim(), input.categorie().trim(), input.dateHeureDebut(), input.dateHeureFin(), input.lieu().trim(), input.capaciteMax(), input.statut(), clubId, advertiser);
        } else {
            var event = lock(id);
            own(event);
            boolean suspended = "SUSPENDU".equals(event.get("statut"));
            if (suspended != "SUSPENDU".equals(input.statut())) {
                throw new ApiException(403, "ADMIN_MODERATION_REQUIRED", "Seule l’administration peut suspendre ou rétablir cet événement.");
            }
            if (input.clubId() != null && !input.clubId().equals(event.get("clubId"))) throw new ApiException(403, "ORGANIZER_FIXED", "Le club organisateur est fixé à la création.");
            if (input.capaciteMax() < confirmed(id)) throw new ApiException(409, "CAPACITY_TOO_SMALL", "La capacité doit couvrir toutes les inscriptions confirmées.");
            store.update("UPDATE evenement SET titre = ?, description = ?, categorie = ?, date_heure_debut = ?, date_heure_fin = ?, lieu = ?, capacite_max = ?, statut = ? WHERE id = ?",
                    input.titre().trim(), input.description().trim(), input.categorie().trim(), input.dateHeureDebut(), input.dateHeureFin(), input.lieu().trim(), input.capaciteMax(), input.statut(), id);
        }
        return decorate(store.one(EVENTS + "WHERE e.id = ?", id));
    }

    public void withdraw(UUID id) {
        access.require("ADMINISTRATEUR");
        lock(id);
        store.update("UPDATE evenement SET statut = 'ANNULE' WHERE id = ?", id);
    }

    public void suspend(UUID id) {
        moderate(id, Set.of("PUBLIE", "SUSPENDU"), "SUSPENDU");
    }

    public void restore(UUID id) {
        moderate(id, Set.of("SUSPENDU", "PUBLIE"), "PUBLIE");
    }

    public void validate(UUID id) {
        moderate(id, Set.of("BROUILLON", "PUBLIE"), "PUBLIE");
    }

    private void moderate(UUID id, Set<String> allowedStatuses, String targetStatus) {
        access.require("ADMINISTRATEUR");
        var event = lock(id);
        if (!allowedStatuses.contains(event.get("statut"))) {
            throw new ApiException(409, "MODERATION_TRANSITION_INVALID", "Cette action ne correspond pas à l’état actuel de l’événement.");
        }
        store.update("UPDATE evenement SET statut = ? WHERE id = ?", targetStatus, id);
    }

    public Map<String, Object> register(UUID eventId) {
        UUID studentId = access.require("ETUDIANT");
        var event = lock(eventId);
        if (!"PUBLIE".equals(event.get("statut"))) throw new ApiException(409, "EVENT_UNAVAILABLE", "Cet événement est indisponible.");
        if (store.exists("SELECT id FROM inscription WHERE evenement_id = ? AND etudiant_id = ? AND statut = 'CONFIRMEE'", eventId, studentId)) {
            throw new ApiException(409, "REGISTRATION_EXISTS", "Vous êtes déjà inscrit à cet événement.");
        }
        if (confirmed(eventId) >= ((Number) event.get("capaciteMax")).intValue()) throw new ApiException(409, "EVENT_FULL", "Cet événement est complet.");
        store.update("INSERT INTO inscription(etudiant_id, evenement_id) VALUES (?, ?) ON CONFLICT (etudiant_id, evenement_id) DO UPDATE SET statut = 'CONFIRMEE', date_inscription = now()", studentId, eventId);
        var user = access.current();
        mail.enqueue((String) user.get("email"), "Campus360 — Confirmation d’inscription", "Votre inscription est confirmée.\n\n" + event.get("titre") + "\nDébut : " + event.get("dateHeureDebut") + "\nLieu : " + event.get("lieu"));
        var registration = store.one("SELECT * FROM inscription WHERE evenement_id = ? AND etudiant_id = ?", eventId, studentId);
        registration.put("evenement", detail(eventId));
        return registration;
    }

    public void cancel(UUID registrationId) {
        UUID studentId = access.require("ETUDIANT");
        var registration = store.one("SELECT evenement_id FROM inscription WHERE id = ? AND etudiant_id = ?", registrationId, studentId);
        lock((UUID) registration.get("evenementId"));
        store.update("UPDATE inscription SET statut = 'ANNULEE' WHERE id = ? AND etudiant_id = ?", registrationId, studentId);
    }

    public List<Map<String, Object>> planning() {
        UUID studentId = access.require("ETUDIANT");
        var registrations = store.list("SELECT * FROM inscription WHERE etudiant_id = ? ORDER BY date_inscription DESC", studentId);
        for (var registration : registrations) {
            registration.put("evenement", decorate(store.one(EVENTS + "WHERE e.id = ?", registration.get("evenementId"))));
        }
        return registrations;
    }

    private Map<String, Object> lock(UUID id) { return store.one("SELECT * FROM evenement WHERE id = ? FOR UPDATE", id); }

    private int confirmed(UUID id) {
        return ((Number) store.one("SELECT count(*) AS total FROM inscription WHERE evenement_id = ? AND statut = 'CONFIRMEE'", id).get("total")).intValue();
    }

    private void own(Map<String, Object> event) {
        var user = access.current();
        if (event.get("clubId") != null) {
            access.manager((UUID) event.get("clubId"));
        } else if (!"ANNONCEUR".equals(user.get("role")) || !user.get("id").equals(event.get("annonceurId"))) {
            throw new ApiException(403, "EVENT_FORBIDDEN", "Vous ne gérez pas cet événement.");
        }
    }

    private Map<String, Object> decorate(Map<String, Object> event) {
        event.put("dateHeureDebutCampus", ((Instant) event.get("dateHeureDebut")).atZone(CAMPUS_ZONE).toLocalDateTime().toString());
        event.put("dateHeureFinCampus", ((Instant) event.get("dateHeureFin")).atZone(CAMPUS_ZONE).toLocalDateTime().toString());
        if ("PUBLIE".equals(event.get("statut"))) {
            event.put("disponibilite", ((Number) event.get("placesRestantes")).longValue() == 0 ? "COMPLET" : "OUVERT");
        }
        event.put("passe", ((Instant) event.get("dateHeureFin")).isBefore(Instant.now()));
        return event;
    }

    private List<Map<String, Object>> decorate(List<Map<String, Object>> events) {
        events.forEach(this::decorate);
        return events;
    }
}
