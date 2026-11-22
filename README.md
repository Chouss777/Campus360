# Campus360

Campus360 est un projet académique de l’Université Sultan Moulay Slimane (USMS). La plateforme vise à centraliser les événements du campus et la vie associative, avec un catalogue public, un espace étudiant et des outils de gestion pour les clubs, les annonceurs et l’administration universitaire.

## Stack et répartition du travail

| Domaine | Technologies | Responsabilité |
| --- | --- | --- |
| Design et frontend | Figma, HTML5, CSS3, JavaScript, React.js, Vite | Développeur frontend · UI/UX, maquettes et interface React |
| Backend et données | Java, Spring Boot, API REST, PostgreSQL | Développeur backend · services, sécurité de l’API et base de données |
| Conteneurisation et collaboration | Docker, Git, GitHub | Équipe · environnement de développement et collaboration |

## Structure du dépôt

```text
Campus360/
├── README.md
├── frontend/                     Interface React et configuration Vite
│   ├── src/
│   └── public/
├── backend/                      Projet Spring Boot et Maven Wrapper
│   ├── pom.xml
│   └── src/
│       ├── main/
│       └── test/
└── docs/
    ├── backlog/                  Backlog produit officiel
    ├── uml/                      Diagrammes UML officiels
    └── api/                      Documentation de conception API
```

## Documents officiels

- [Backlog produit Campus360](docs/backlog/Backlog_Produit_Campus360.pdf)
- [Rapport fonctionnel corrigé MVP 1 · révision D01 version 1.2](docs/backlog/Rapport_Fonctionnel_MVP1_Campus360.pdf)
- [Diagramme des cas d’utilisation](docs/uml/diagramme_cas_utilisation.jpeg)
- [Diagramme de classes](docs/uml/diagramme_classes.jpeg)
- [Extension UML D01 approuvée](docs/uml/README.md)
- [Documentation de conception API](docs/api/README.md)

Le périmètre de travail couvre les stories US01 à US23 du MVP 1, telles qu’elles sont énumérées dans le backlog.

## Démarrage local du frontend

Avec une version de Node.js compatible avec Vite et les dépendances de `frontend/` déjà disponibles, lancer depuis la racine du dépôt sous PowerShell.

```powershell
cd frontend
npm.cmd run dev
```

Vite affiche l’adresse du serveur dans le terminal. `frontend/package.json` déclare aussi les scripts `build`, `lint` et `preview`.

## État actuel

- **Fonctionnalités réalisées** · catalogue et détail publics, recherche et filtres, comptes universitaires et OTP, sessions, profil avec photo, annuaire et fiches clubs, adhésions et membres, administration des comptes et clubs, gestion des événements par organisateur, retrait administratif, inscriptions, annulations, planning et confirmations par courriel.
- **Décisions approuvées** · les choix D01-D09 sont enregistrés dans la documentation API. SUSPENDU matérialise la suspension administrative temporaire. L’administrateur peut rétablir un événement ou valider un brouillon à PUBLIE. Les organisateurs publient directement leurs événements. Les inscriptions conservent CONFIRMEE ou ANNULEE, avec regroupement passé/à venir selon les dates. La disponibilité OUVERT/COMPLET est calculée.
- **Interface MVP 1** · les captures officielles servent de référence au logo, à Inter, au violet #6A4CFF, aux surfaces lavande, aux cartes et aux navigations par rôle. Les quatre écrans de référence et les écrans complémentaires partagent le même habillage responsive.

## Navigation et interface

- Accueil dédié `/#/home`, catalogue conservé à `/#/events` et fiches à `/#/events/:id`. La recherche de l’en-tête ouvre le catalogue filtré.
- Étudiant · clubs, adhésions, profil, planning et inscriptions séparées à `/#/registrations`. Le libellé « Terminée » est calculé pour une inscription confirmée à un événement passé.
- Organisateur · tableau de bord à `/#/manage`, gestion à `/#/manage/events`, création en trois étapes à `/#/manage/events/new`. Les responsables de club disposent aussi de la gestion des adhésions.
- Administration · événements, clubs et comptes à `/#/admin/events`, `/#/admin/clubs` et `/#/admin/users`.

Le logo officiel et la police Inter sont servis localement depuis `frontend/src/assets`. Les illustrations de catégories sont génériques et dessinées dans le navigateur. L’API actuelle ne fournit pas de photos d’événement ni de liste d’intervenants. Les participants affichés correspondent au nombre réel d’inscriptions confirmées. Le tableau de bord présente les états réels des événements et les prochains rendez-vous, sans indicateurs analytiques.

Les parcours React ont été vérifiés dans Chromium avec les API et PostgreSQL réels, notamment inscription et OTP, connexion avec retour, réservation et annulation, profil, adhésions et approbation, création en trois étapes par responsable et annonceur, modération et changement de rôle. La version Docker passe 135 vérifications de route et de viewport entre 320 et 1440 pixels, avec contrôles de libellés et de navigation au clavier.

## Exécution Docker

Avec Docker Desktop démarré, copier d'abord le modèle d'environnement. Les deux
mots de passe doivent être des valeurs fortes, différentes et propres à votre
machine ; aucune valeur secrète n'est fournie ou suivie par Git.

```powershell
Copy-Item .env.example .env
# Éditer .env et renseigner POSTGRES_PASSWORD et DEMO_ACCOUNT_PASSWORD.
```

Lancer ensuite depuis la racine.

```powershell
docker compose up --build -d
```

Le frontend est exposé sur `http://localhost:8080`, le backend sur `http://localhost:8081` et PostgreSQL sur `localhost:15432`. Le frontend transmet `/api/` au backend. Le point de contrôle `/api/v1/health` vérifie aussi la disponibilité de PostgreSQL. La première construction télécharge les images et dépendances.

Mailpit reçoit les courriels du mode démonstration. Ouvrir `http://localhost:8025` pour lire les OTP et confirmations. Les photos et logos sont conservés dans le volume `uploaded_images`. Le profil `demo` initialise les sept clubs FPK et les trois comptes prédéfinis. Sur une base vide uniquement, il reproduit les quatre événements déjà publiés du jeu validé, avec leurs dates fixes. Il ne publie jamais les brouillons et ne recalcule pas les dates au redémarrage. Voir [le jeu FPK et ses sources](docs/demo-fpk.md).

`.env.example` décrit uniquement les variables attendues avec des valeurs
vides. Le fichier `.env`, ignoré par Git, fournit les secrets à Docker Compose.
Le volume `postgres_data` conserve les données entre les redémarrages. Le mot
de passe des comptes prédéfinis est la valeur choisie pour
`DEMO_ACCOUNT_PASSWORD` lors de la première initialisation de la base.

```powershell
docker compose logs --tail=100
docker compose down
```

## Tests backend

Avec Java 21 et Maven Wrapper, démarrer d’abord PostgreSQL. Le backend reprend
les variables du fichier `.env` lorsqu'il est lancé par Docker. Pour un
lancement Maven direct, définir `DB_PASSWORD` et, pour les tests du seed,
`CAMPUS360_TEST_PASSWORD` dans la session du terminal.

```powershell
docker compose up -d database
cd backend
.\mvnw.cmd test
```

Le test de contexte utilise la vraie base PostgreSQL. Les tests unitaires du contrôleur de disponibilité simulent ses réponses et ses pannes.

Les tests de recette HTTP utilisent Node.js et une pile jetable séparée. Ne pas exécuter les tests créant des objets sur la base de démonstration.

```powershell
docker compose build backend frontend
$env:ACCEPTANCE_DB_PASSWORD='<mot-de-passe-jetable-fort>'
$env:CAMPUS360_TEST_PASSWORD='<mot-de-passe-test-fort>'
docker compose -f tests/compose.acceptance.yaml -p campus360-acceptance-local up -d --wait
$env:CAMPUS360_ISOLATED_ACCEPTANCE='1'
$env:CAMPUS360_URL='http://127.0.0.1:18080'
$env:MAILPIT_URL='http://127.0.0.1:18025'
node --test tests/mvp1.test.mjs
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
docker compose -f tests/compose.acceptance.yaml -p campus360-acceptance-local down --volumes
```

La recette crée des comptes et objets temporaires dans PostgreSQL jetable et capture les courriels dans le Mailpit isolé. Les comptes nécessaires aux tests de plusieurs responsables sont créés par inscription et OTP dans cette pile ; ils ne font pas partie du seed permanent. Les vérifications visuelles en lecture seule peuvent cibler la démonstration normale.

## Comptes de démonstration

Les trois comptes prédéfinis sont vérifiés et actifs uniquement dans le profil
`demo`. Sur une base neuve, ils partagent le mot de passe local choisi dans
`DEMO_ACCOUNT_PASSWORD` ; ce secret n'est jamais stocké dans le dépôt.

| Compte | Usage |
| --- | --- |
| admin@usms.ma | Administration des comptes, clubs et événements |
| etudiant@usms.ma | Profil étudiant, planning et responsable contextuel des sept clubs FPK |
| annonceur@usms.ma | Publication pour l’organisme universitaire existant ; renommage en `announcer@usms.ma` en attente |

Les comptes créés depuis l’interface doivent vérifier leur adresse par OTP. L’administration peut ensuite leur attribuer un rôle global. Le rôle de responsable est attribué au niveau d’un club.

## Vérifications réalisées

Les 27 tests Java passent, dont 7 scénarios D01 et 8 scénarios du seed FPK avec PostgreSQL et restauration des données de test par transaction. La recette HTTP passe dans Docker à travers Nginx, avec PostgreSQL et Mailpit. Elle couvre notamment OTP, permissions, propriété des clubs et événements, filtres, images, concurrence sur la dernière place, annulation, changement de rôle et suspension des sessions. Les parcours React de connexion avec retour, inscription/annulation, profil, création d’événements et administration des clubs ont été vérifiés dans le navigateur, ainsi que le catalogue sur mobile. La persistance des logos FPK est contrôlée après recréation des conteneurs.
