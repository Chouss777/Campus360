# Jeu de démonstration FPK — 20 novembre 2026

Le profil Spring `demo` contient sept identités approuvées et trois comptes prédéfinis. Il ne limite pas les inscriptions ordinaires des utilisateurs. Le rôle de responsable reste une adhésion `ACCEPTE` avec `roleDansClub=RESPONSABLE` d’un compte global `ETUDIANT`.

| Nom exact | Catégorie | Logo original dans `backend/src/main/resources/demo/clubs/` | Provenance |
| --- | --- | --- | --- |
| Beelite Club | Culture | beelite.png | [Site du club](https://beeliters.wixsite.com/home), emblème original 153 × 138 px |
| JLM | Entrepreneuriat social | jlm-fpk.png | [Site FPK historique, ©2018](https://jlmfpk2018.wixsite.com/jlmfpkfr), emblème du réseau JLM |
| ENACTUS FPK | Entrepreneuriat social | enactus-fpk.png | [Site FPK historique, ©2017](https://enactus-fpk.wixsite.com/fpkhouribga), logo portant « FP Khouribga » |
| CLUB THE ARTS | Arts | CLUB THE ARTS.png | Fichier fourni et approuvé par l’utilisateur ; catégorie appuyée par son nom et son logo |
| AL KHAWARIZMI IT | Technologie | Alkhawarizmi_logo.jpg | Fichier fourni et approuvé ; informatique et robotique indiquées sur le logo |
| نادي من أجل الطالب | Culture | نادي من أجل الطالب.jpg | Fichier fourni ; [activité littéraire documentée en 2023](https://communpress.info/category/%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%D9%8A%D8%A9/page/34/) |
| نادي الخشبة للفنون والمسرح الجامعي | Théâtre | نادي الخشبة للفنون والمسرح الجامعي.jpg | Fichier fourni ; arts et théâtre explicités par son nom |

Les noms AL KHAWARIZMI IT, ENACTUS FPK et JLM remplacent les anciennes appellations selon la demande du 20 novembre 2026. Les autres noms approuvés et tous les fichiers de logos sont conservés. Aucun logo n’est généré, redessiné, recadré ou remplacé par une création fictive. Les fichiers originaux sont empaquetés avec le backend, puis copiés sans modification dans le volume existant. L’API média et ses permissions restent inchangées.

L’[annuaire USMS](https://www.usms.ac.ma/ar/node/187) documente plusieurs de ces identités à la FPK. L’activité actuelle des clubs n’a pas été certifiée. JLM et Enactus sont explicitement présentés comme identités historiques ; leur activation dans la démonstration ne constitue pas une accréditation actuelle. Les logos supplémentaires sont attribués à la fourniture et à l’approbation de l’utilisateur.

## Mise à jour des anciennes fixtures

- Seulement sous le profil `demo`, les deux anciennes fixtures sont reconnues par leur nom, description et catégorie. Une collision, un club actif sans lien ou un thème d’événement publié incompatible impose une revue et annule la transaction.
- `Club Informatique — Démo` devient `AL KHAWARIZMI IT` et `Club Culture — Démo` devient `Beelite Club`, en conservant leurs UUID, dates et références. Les cinq autres clubs sont ajoutés.
- Le compte `etudiant@usms.ma` reçoit les sept responsabilités approuvées. Les anciens comptes seed `responsable`, `responsable2` et `etudiant2` sont désactivés, sans suppression de leurs lignes ni de leurs historiques. Les deux anciennes responsabilités sur les clubs actifs sont transférées, les adhésions restant conservées.
- Les comptes réels ou non reconnus, les clubs de tests déjà archivés et les événements existants sont conservés. Il n’y a aucune suppression SQL ni modification de Flyway.
- Les redémarrages ne réinitialisent pas les modifications ultérieures de l’administrateur, les suspensions, les mots de passe, les responsabilités ou les adhésions.

## Événements conservés

Les quatre événements du manifeste `demo/published-events.tsv` proviennent de l’inventaire local sauvegardé le 20 novembre 2026. Le seed ne les reproduit que sur une base entièrement vide. Il ne crée aucun événement supplémentaire sur une base existante.

| Événement publié existant | Organisateur |
| --- | --- |
| Atelier informatique | AL KHAWARIZMI IT |
| Atelier web | AL KHAWARIZMI IT |
| Rencontre culturelle | Beelite Club |
| Rencontre institutionnelle | Annonceur universitaire existant, sans club |

Les dates, statuts, propriétaires et inscriptions restent inchangés. Le nettoyage approuvé modifie seulement les titres, les lieux illustratifs, les capacités et deux descriptions pour en retirer le mot « démonstration ». Le nom de l’annonceur devient « Service universitaire », sans changement d’identité ni de rôle. Le brouillon existant et les événements annulés/suspendus restent dans leur état initial. Le manifeste ne contient aucun nouveau brouillon ni date glissante.

## Comptes et décision en attente

Les comptes actifs prédéfinis sont `admin@usms.ma` (ADMINISTRATEUR), `etudiant@usms.ma` (ETUDIANT) et `annonceur@usms.ma` (ANNONCEUR). **Le renommage de l’annonceur en `announcer@usms.ma` est en attente**, conformément à la réponse de l’utilisateur. Aucun changement d’adresse, d’UUID, de mot de passe ou de propriétaire d’événement annonceur n’est effectué.

Sur l’ancienne base, les lignes désactivées restent présentes pour conserver les historiques. Une base nouvellement initialisée contient uniquement les trois comptes prédéfinis. Les tests supplémentaires utilisent la pile jetable `tests/compose.acceptance.yaml`, ses ports 18080/18081/18025/25432 et sa base tmpfs, jamais la base de démonstration.

## Nettoyage éditorial ciblé — 20 novembre 2026

Les quatre événements restent des **scénarios fictifs de recette**, et non des annonces officielles de la FPK. Les noms de lieux ci-dessous sont des types de salles illustratifs, sans vérification de leur existence, de leur dénomination officielle ou de leur capacité réelle. Aucune réservation de salle n’est affirmée.

| Événement | Lieu illustratif | Capacité de recette |
| --- | --- | --- |
| Atelier informatique (passé) | Salle informatique — FPK Khouribga | 30 |
| Atelier web | Salle informatique — FPK Khouribga | 30 |
| Rencontre culturelle | Espace polyvalent — FPK Khouribga | 60 |
| Rencontre institutionnelle | Amphithéâtre — FPK Khouribga | 75 |

Les anciens champs exacts sont conservés dans `demo/previous-published-events.tsv` et les colonnes `previousName` / `previousDescription` du manifeste des clubs. La mise à jour ne cible que ces fixtures reconnues. Les événements sont verrouillés pendant le contrôle du nombre d’inscriptions CONFIRMEE et la mise à jour ; une capacité inférieure à ce nombre provoque un refus (D09). Les modifications ultérieures de l’organisateur ou de l’administrateur ne sont pas réinitialisées.

### Fondement des descriptions françaises

| Club | Informations établies / limites éditoriales | Source |
| --- | --- | --- |
| Beelite Club | Culture, créativité, diversité et engagement communautaire décrits par le club. | [Présentation du club](https://beeliters.wixsite.com/home) |
| JLM | Entrepreneuriat social, solidarité et environnement ; source historique de l’équipe FPK. Aucune activité actuelle précise n’est affirmée. | [Site JLM FPK, ©2018](https://jlmfpk2018.wixsite.com/jlmfpkfr) |
| ENACTUS FPK | Action entrepreneuriale à finalité sociale, économique et environnementale ; source historique de l’équipe FPK. Aucun projet actuel n’est inventé. | [Site Enactus FPK, ©2017](https://enactus-fpk.wixsite.com/fpkhouribga), [projets historiques](https://enactus-fpk.wixsite.com/fpkhouribga/mentoring-programs) |
| AL KHAWARIZMI IT | Informatique et robotique attestées par le nom dans l’annuaire et le logo fourni. La découverte de la programmation et le travail en équipe sont une présentation éditoriale de cette orientation, pas un programme d’ateliers vérifié. | [Annuaire USMS, rubrique FP-K](https://www.usms.ac.ma/ar/node/187) |
| CLUB THE ARTS | Identité artistique rapprochée de « Club The Art » dans l’annuaire. La création visuelle est proposée au conditionnel comme orientation possible, sans activités ou palmarès inventés. | [Annuaire USMS, rubrique FP-K](https://www.usms.ac.ma/ar/node/187) |
| نادي من أجل الطالب | Rencontre littéraire à la FPK le 21 novembre 2023 et présentation d’un roman ; aucun programme actuel n’est déduit de ce seul événement. | [Compte rendu de presse](https://communpress.info/category/%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%D9%8A%D8%A9/page/34/), [annuaire USMS](https://www.usms.ac.ma/ar/node/187) |
| نادي الخشبة للفنون والمسرح الجامعي | Arts et théâtre universitaire attestés par le nom et l’annuaire. Jeu et écriture dramatique sont des pistes présentées comme possibles, sans affirmer des activités effectivement organisées. | [Annuaire USMS, rubrique FP-K](https://www.usms.ac.ma/ar/node/187) |

Ces textes sont des reformulations originales. L’annuaire établit une présence institutionnelle ; il ne certifie pas un calendrier actuel, une équipe dirigeante ou l’accréditation en cours. Les qualificatifs historiques et les limites de vérification restent dans cette documentation.
