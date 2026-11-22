# Documentation API Campus360

Ce dossier rassemble la documentation de conception de l’API REST du MVP 1. Il sert de référence commune pour relier chaque opération à une User Story, préciser les permissions, convenir des données échangées et définir les cas d’erreur à tester.

## Références fonctionnelles

- [Backlog produit · US01 à US23](../backlog/Backlog_Produit_Campus360.pdf)
- [Rapport fonctionnel corrigé · révision D01 version 1.2](../backlog/Rapport_Fonctionnel_MVP1_Campus360.pdf)
- [Diagramme des cas d’utilisation](../uml/diagramme_cas_utilisation.jpeg)
- [Diagramme de classes](../uml/diagramme_classes.jpeg)
- [Extension UML D01 approuvée](../uml/README.md)

## État du contrat

L’implémentation expose les parcours MVP 1 sous `/api/v1`, avec échanges JSON et horodatages ISO 8601. Les contrôleurs `AccountController`, `ClubController`, `EventController` et `MediaController` constituent la référence des routes réalisées. Les tests HTTP de `tests/mvp1.test.mjs` exercent ces parcours avec PostgreSQL et les courriels capturés par Mailpit.

Les sessions utilisent un cookie HttpOnly et une protection CSRF. Le client obtient le jeton par `GET /api/v1/auth/csrf` et le transmet dans `X-XSRF-TOKEN` lors des mutations. Les permissions sont vérifiées côté serveur pour le compte et la ressource concernés. Les erreurs métier utilisent `application/problem+json`. Les décisions D01-D09 sont approuvées et consignées ci-dessous. La recette finale de l’équipe précède la stabilisation du contrat OpenAPI.

`GET /api/v1/admin/clubs` ajoute, pour chaque club, `responsables: [{id, nom, prenom, email}]`, les affectations RESPONSABLE avec adhésion ACCEPTE. Ce champ en lecture seule est réservé à la liste administrative ; les réponses publiques des clubs ne le contiennent pas. Il n’ajoute aucun droit de gestion des adhésions à l’administrateur.

## Décisions du rapport corrigé

| Décision | État et incidence |
| --- | --- |
| D01 · Modération | Extension SUSPENDU approuvée. L’administrateur suspend un événement publié et le rétablit à PUBLIE. La validation administrative publie un brouillon. Les organisateurs conservent la publication directe. La suspension masque les vues publiques, bloque les nouvelles inscriptions et conserve les inscriptions existantes. |
| D02 · Photo étudiante | Ajout de photoProfil approuvé, avec URL et fichiers importés conservés dans un volume Docker. |
| D03 · Contact et bureau du club | Deux champs texte facultatifs, contact et bureau, approuvés et persistés. |
| D04 · Annonceur partenaire | Le demandeur a confirmé @usms.ma pour tous les annonceurs, avec attribution du rôle par l’administration. |
| D05 · Présentation annonceur | Nom, type d’organisme et contact approuvés. Lien club uniquement pour un événement de club. |
| D06 · Fiche officielle du club | Gestion officielle réservée à l’administration, approuvée. Le responsable gère membres et événements de son club. |
| D07 · Délai d’annulation | Annulation sans limite horaire approuvée. |
| D08 · Flag actif | Initialement true, avec estVerifie=false. OTP bascule uniquement estVerifie. La suspension administrative utilise actif et révoque les sessions. Approuvé. |
| D09 · Réduction de capacité | Refus sous le nombre d’inscriptions confirmées approuvé. Inscription, annulation et modification utilisent le verrou de la même ligne événement. |

Le rapport corrigé remplace l’ancien rapport au même chemin documentaire. Le statut d’une inscription reste CONFIRMEE ou ANNULEE. Les groupes passé/à venir dépendent des dates. Les informations techniques de vérification et la file de courriels servent la livraison et le contrôle des OTP et confirmations du MVP 1.

Les migrations Flyway matérialisent les tables et contraintes du modèle relationnel. Le dépôt réutilise les dépendances Spring existantes et réalise ses requêtes préparées avec JdbcTemplate. Les sous-profils conservent la clé utilisateur partagée, y compris lors d’un changement de rôle, afin de préserver les relations historiques. La migration V2 contient les ajouts approuvés pour photoProfil, contact et bureau.

Les fichiers de profil requièrent la session de leur propriétaire. Les logos importés par l’administration sont accessibles pour les fiches publiques. La migration V3 ajoute les métadonnées techniques nécessaires à ce contrôle d’accès.

Les dates d’événement restent des instants ISO 8601. Les réponses ajoutent dateHeureDebutCampus et dateHeureFinCampus, valeurs locales calculées en Africa/Casablanca pour l’affichage. Le filtre de date utilise cette même référence serveur, ce qui garde un jour de catalogue cohérent lorsque les bases de fuseaux horaires du navigateur et du serveur diffèrent.

## Actions D01 réalisées

Les routes suivantes sont réservées à l’administrateur et renvoient 204 en cas de succès.

| Méthode | Route | Effet |
| --- | --- | --- |
| POST | /api/v1/admin/events/{id}/suspend | PUBLIE vers SUSPENDU |
| POST | /api/v1/admin/events/{id}/restore | SUSPENDU vers PUBLIE |
| POST | /api/v1/admin/events/{id}/validate | BROUILLON vers PUBLIE |

Un appel visant l’état déjà obtenu est idempotent. Une transition incompatible renvoie 409. Les appels d’un autre rôle et les tentatives d’un organisateur de changer l’état de suspension renvoient 403. Les modifications de contenu d’un événement suspendu restent possibles avec statut=SUSPENDU. La restauration d’un événement plein conserve PUBLIE avec disponibilité COMPLET.
