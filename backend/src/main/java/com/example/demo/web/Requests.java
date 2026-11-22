package com.example.demo.web;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class Requests {
    private Requests() {}

    public record Signup(@NotBlank @Size(max=120) String nom, @NotBlank @Size(max=120) String prenom,
                         @NotBlank @Email @Size(max=254) String email,
                         @NotBlank @Size(min=8, max=72) String motDePasse,
                         @Size(max=100) String cneApogee) {}
    public record Verification(@NotBlank @Email String email, @NotBlank @Pattern(regexp="[0-9]{6}") String code) {}
    public record EmailInput(@NotBlank @Email String email) {}
    public record Login(@NotBlank @Email String email, @NotBlank String motDePasse) {}
    public record Profile(@NotNull @Size(max=200) String filiere,
                          @NotNull @Size(max=100) String niveau,
                          @NotNull @Size(max=30) List<@NotBlank @Size(max=100) String> centresInteret,
                          @Size(max=2000) String photoProfil) {}
    public record Account(@Pattern(regexp="ETUDIANT|ANNONCEUR|ADMINISTRATEUR") String role,
                          Boolean actif, @Size(max=200) String nomOrganisation,
                          @Size(max=120) String typePartenaire, @Size(max=50) String contactTel) {}
    public record Responsible(@NotNull UUID etudiantId) {}
    public record Membership(@NotBlank @Pattern(regexp="ACCEPTE|REFUSE") String statut) {}
    public record Club(@NotBlank @Size(max=200) String nomClub, @NotBlank @Size(max=20000) String description,
                       @NotBlank @Size(max=120) String categorie, @NotNull @Size(max=2800000) String logoUrl,
                       @Size(max=500) String contact, @Size(max=1000) String bureau,
                       @NotNull Boolean statutActif, UUID responsableId) {}
    public record Event(@NotBlank @Size(max=200) String titre, @NotNull @Size(max=20000) String description,
                        @NotBlank @Size(max=120) String categorie, @NotNull OffsetDateTime dateHeureDebut,
                        @NotNull OffsetDateTime dateHeureFin, @NotBlank @Size(max=300) String lieu,
                        @NotNull @Positive Integer capaciteMax,
                        @NotBlank @Pattern(regexp="BROUILLON|PUBLIE|ANNULE|SUSPENDU") String statut, UUID clubId) {}
}
