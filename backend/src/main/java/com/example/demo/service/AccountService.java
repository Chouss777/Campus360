package com.example.demo.service;

import com.example.demo.data.CampusStore;
import com.example.demo.web.ApiException;
import com.example.demo.web.Requests;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.nio.charset.StandardCharsets;

@Service
@Transactional
public class AccountService {
    private final CampusStore store;
    private final AccessService access;
    private final PasswordEncoder passwords;
    private final MailService mail;
    private final SecureRandom random = new SecureRandom();

    public AccountService(CampusStore store, AccessService access, PasswordEncoder passwords, MailService mail) {
        this.store = store;
        this.access = access;
        this.passwords = passwords;
        this.mail = mail;
    }

    public Map<String, Object> signup(Requests.Signup input) {
        String email = universityEmail(input.email());
        if (input.motDePasse().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiException(422, "PASSWORD_TOO_LONG", "Le mot de passe doit contenir au maximum 72 octets UTF-8.");
        }
        if (store.exists("SELECT id FROM utilisateur WHERE email = ?", email)) {
            throw new ApiException(409, "EMAIL_EXISTS", "Cette adresse est déjà utilisée.");
        }
        UUID id = UUID.randomUUID();
        store.update("INSERT INTO utilisateur(id, nom, prenom, email, mot_de_passe_hash, role, actif) VALUES (?, ?, ?, ?, ?, 'ETUDIANT', true)",
                id, input.nom().trim(), input.prenom().trim(), email, passwords.encode(input.motDePasse()));
        store.update("INSERT INTO etudiant(utilisateur_id, cne_apogee) VALUES (?, ?)", id, input.cneApogee() == null ? "" : input.cneApogee().trim());
        issueCode(id, email);
        return Map.of("email", email, "estVerifie", false);
    }

    private void issueCode(UUID id, String email) {
        String code = "%06d".formatted(random.nextInt(1000000));
        store.update("UPDATE utilisateur SET code_verification_otp = ?, verification_expires_at = now() + interval '15 minutes', verification_sent_at = now(), verification_attempts = 0 WHERE id = ?",
                passwords.encode(code), id);
        mail.enqueue(email, "Campus360 — Vérifiez votre compte", "Votre code de vérification Campus360 est " + code + ". Il expire dans 15 minutes.");
    }

    @Transactional(noRollbackFor=ApiException.class)
    public void verify(Requests.Verification input) {
        var user = store.one("SELECT * FROM utilisateur WHERE email = ? FOR UPDATE", universityEmail(input.email()));
        if (Boolean.TRUE.equals(user.get("estVerifie"))) return;
        Instant expires = (Instant) user.get("verificationExpiresAt");
        if (expires == null || expires.isBefore(Instant.now()) || ((Number) user.get("verificationAttempts")).intValue() >= 5) {
            throw new ApiException(422, "OTP_EXPIRED", "Code expiré. Demandez un nouveau code.");
        }
        if (!passwords.matches(input.code(), (String) user.get("codeVerificationOtp"))) {
            store.update("UPDATE utilisateur SET verification_attempts = verification_attempts + 1 WHERE id = ?", user.get("id"));
            throw new ApiException(422, "OTP_INVALID", "Code de vérification incorrect.");
        }
        store.update("UPDATE utilisateur SET est_verifie = true, code_verification_otp = NULL, verification_expires_at = NULL WHERE id = ?", user.get("id"));
    }

    public void resend(String address) {
        String email = universityEmail(address);
        var users = store.list("SELECT * FROM utilisateur WHERE email = ? FOR UPDATE", email);
        if (users.isEmpty() || Boolean.TRUE.equals(users.getFirst().get("estVerifie"))) return;
        var user = users.getFirst();
        Instant last = (Instant) user.get("verificationSentAt");
        if (last != null && last.plusSeconds(60).isAfter(Instant.now())) {
            throw new ApiException(429, "OTP_RATE_LIMIT", "Attendez une minute avant de demander un nouveau code.");
        }
        issueCode((UUID) user.get("id"), email);
    }

    public Map<String, Object> authenticate(Requests.Login input) {
        var users = store.list("SELECT * FROM utilisateur WHERE email = ?", universityEmail(input.email()));
        if (users.isEmpty() || !passwords.matches(input.motDePasse(), (String) users.getFirst().get("motDePasseHash"))) {
            throw new ApiException(401, "INVALID_CREDENTIALS", "Adresse ou mot de passe incorrect.");
        }
        var user = users.getFirst();
        if (!Boolean.TRUE.equals(user.get("estVerifie"))) throw new ApiException(403, "EMAIL_UNVERIFIED", "Vérifiez votre adresse e-mail avant de vous connecter.");
        if (!Boolean.TRUE.equals(user.get("actif"))) throw new ApiException(403, "ACCOUNT_SUSPENDED", "Votre compte est suspendu.");
        return user;
    }

    public Map<String, Object> me() {
        var user = access.current();
        UUID id = (UUID) user.get("id");
        user.put("clubs", store.list("SELECT c.id, c.nom_club, c.statut_actif, a.role_dans_club FROM club c JOIN adhesion_club a ON a.club_id = c.id WHERE a.etudiant_id = ? AND a.statut = 'ACCEPTE'", id));
        user.put("profile", store.list("SELECT cne_apogee, filiere, niveau, centres_interet, photo_profil FROM etudiant WHERE utilisateur_id = ?", id).stream().findFirst().orElse(Map.of()));
        user.put("organisation", store.list("SELECT nom_organisation, type_partenaire, contact_tel FROM annonceur WHERE utilisateur_id = ?", id).stream().findFirst().orElse(Map.of()));
        return user;
    }

    public Map<String, Object> updateProfile(Requests.Profile input) {
        UUID id = access.require("ETUDIANT");
        if (input.photoProfil() != null) validateImage(input.photoProfil());
        if (input.photoProfil() != null && input.photoProfil().startsWith("/api/v1/media/")) {
            String filename = input.photoProfil().substring("/api/v1/media/".length());
            if (!store.exists("SELECT filename FROM uploaded_media WHERE filename = ? AND (owner_id = ? OR public_read = true)", filename, id)) {
                throw new ApiException(403, "IMAGE_FORBIDDEN", "Choisissez une image importée par votre compte.");
            }
        }
        store.update("UPDATE etudiant SET filiere = ?, niveau = ?, centres_interet = ?, photo_profil = COALESCE(?, photo_profil) WHERE utilisateur_id = ?",
                input.filiere().trim(), input.niveau().trim(), input.centresInteret().toArray(String[]::new), input.photoProfil(), id);
        return me();
    }

    public List<Map<String, Object>> users(String query, String role, Boolean actif) {
        access.require("ADMINISTRATEUR");
        String pattern = "%" + query.toLowerCase(Locale.ROOT) + "%";
        return store.list("SELECT u.id, u.nom, u.prenom, u.email, u.role, u.actif, u.est_verifie, u.date_creation, a.nom_organisation, a.type_partenaire, a.contact_tel FROM utilisateur u LEFT JOIN annonceur a ON a.utilisateur_id = u.id WHERE lower(u.nom || ' ' || u.prenom || ' ' || u.email) LIKE ? AND (?::text IS NULL OR u.role = ?) AND (?::boolean IS NULL OR u.actif = ?) ORDER BY u.date_creation DESC", pattern, role, role, actif, actif);
    }

    public void updateAccount(UUID id, Requests.Account input) {
        access.require("ADMINISTRATEUR");
        var user = store.one("SELECT role FROM utilisateur WHERE id = ? FOR UPDATE", id);
        String role = input.role() == null ? (String) user.get("role") : input.role();
        if ("ANNONCEUR".equals(role)) {
            var existing = store.list("SELECT nom_organisation, type_partenaire, contact_tel FROM annonceur WHERE utilisateur_id = ?", id).stream().findFirst().orElse(Map.of());
            String name = input.nomOrganisation() == null ? (String) existing.getOrDefault("nomOrganisation", "") : input.nomOrganisation();
            if (name.isBlank()) throw new ApiException(422, "ORGANISATION_REQUIRED", "Indiquez le nom de l’organisme annonceur.");
            store.update("INSERT INTO annonceur(utilisateur_id, nom_organisation, type_partenaire, contact_tel) VALUES (?, ?, ?, ?) ON CONFLICT (utilisateur_id) DO UPDATE SET nom_organisation = EXCLUDED.nom_organisation, type_partenaire = EXCLUDED.type_partenaire, contact_tel = EXCLUDED.contact_tel",
                    id, name.trim(), input.typePartenaire() == null ? existing.getOrDefault("typePartenaire", "") : input.typePartenaire(), input.contactTel() == null ? existing.getOrDefault("contactTel", "") : input.contactTel());
        }
        if ("ETUDIANT".equals(role)) store.update("INSERT INTO etudiant(utilisateur_id) VALUES (?) ON CONFLICT DO NOTHING", id);
        if ("ADMINISTRATEUR".equals(role)) store.update("INSERT INTO administrateur(utilisateur_id) VALUES (?) ON CONFLICT DO NOTHING", id);
        store.update("UPDATE utilisateur SET role = ?, actif = COALESCE(?, actif) WHERE id = ?", role, input.actif(), id);
    }

    public static String universityEmail(String address) {
        String email = address.trim().toLowerCase(Locale.ROOT);
        if (!email.matches("[^@\\s]+@usms\\.ma")) throw new ApiException(422, "UNIVERSITY_EMAIL_REQUIRED", "Utilisez votre adresse universitaire @usms.ma.");
        return email;
    }

    public static void validateImage(String image) {
        if (!image.isEmpty() && !image.matches("(?s)(https?://[^\\s]+|/api/v1/media/[a-f0-9-]{36}\\.(png|jpg)|data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)")) {
            throw new ApiException(422, "IMAGE_INVALID", "Utilisez une image PNG, JPEG ou WebP, ou une URL HTTP(S).");
        }
    }

}
