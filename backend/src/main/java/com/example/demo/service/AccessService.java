package com.example.demo.service;

import com.example.demo.data.CampusStore;
import com.example.demo.web.ApiException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.UUID;

@Service
public class AccessService {
    private final CampusStore store;

    public AccessService(CampusStore store) { this.store = store; }

    public Map<String, Object> current() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ApiException(401, "LOGIN_REQUIRED", "Connectez-vous pour continuer.");
        }
        var user = store.one("SELECT id, nom, prenom, email, role, actif, est_verifie FROM utilisateur WHERE id = ?",
                UUID.fromString(authentication.getName()));
        if (!Boolean.TRUE.equals(user.get("actif")) || !Boolean.TRUE.equals(user.get("estVerifie"))) {
            throw new ApiException(401, "ACCOUNT_UNAVAILABLE", "Ce compte est suspendu ou non vérifié.");
        }
        return user;
    }

    public UUID require(String role) {
        var user = current();
        if (!role.equals(user.get("role"))) throw new ApiException(403, "FORBIDDEN", "Accès non autorisé.");
        return (UUID) user.get("id");
    }

    public void manager(UUID clubId) {
        UUID id = require("ETUDIANT");
        if (!store.exists("SELECT id FROM adhesion_club WHERE club_id = ? AND etudiant_id = ? AND statut = 'ACCEPTE' AND role_dans_club = 'RESPONSABLE'", clubId, id)) {
            throw new ApiException(403, "CLUB_FORBIDDEN", "Vous ne gérez pas ce club.");
        }
    }
}
