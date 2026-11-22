import { useState } from "react";
import { api, dateTime, uploadImage } from "../api.js";
import { useResource } from "../hooks.js";
import { Action, Badge, Field, Form, ResourceState } from "../components.jsx";
import { EventWizard } from "./EventWizard.jsx";
import { Artwork } from "../ui/Artwork.jsx";
import { ClubAvatar } from "../ui/ClubAvatar.jsx";
import { Icon } from "../ui/Icons.jsx";

function AdminEventPreview({ event, onClose }) {
  return (
    <section
      id={"event-preview-" + event.id}
      className="admin-event-preview"
      aria-label={"Détails de « " + event.titre + " »"}
      tabIndex={-1}
    >
      <header className="row">
        <div>
          <span className="eyebrow">Aperçu en lecture seule</span>
          <h2>{event.titre}</h2>
        </div>
        <div className="row">
          <Badge>{event.statut}</Badge>
          <button type="button" onClick={onClose}>
            Fermer l’aperçu
          </button>
        </div>
      </header>
      <dl className="information-grid">
        <div>
          <dt>Organisateur</dt>
          <dd>{event.organisateur}</dd>
        </div>
        <div>
          <dt>Origine</dt>
          <dd>{event.clubId ? "Club universitaire" : "Annonceur"}</dd>
        </div>
        <div>
          <dt>Catégorie</dt>
          <dd>{event.categorie}</dd>
        </div>
        <div>
          <dt>Lieu</dt>
          <dd>{event.lieu}</dd>
        </div>
        <div>
          <dt>Début</dt>
          <dd>{dateTime(event.dateHeureDebut, event.dateHeureDebutCampus)}</dd>
        </div>
        <div>
          <dt>Fin</dt>
          <dd>{dateTime(event.dateHeureFin, event.dateHeureFinCampus)}</dd>
        </div>
        <div>
          <dt>Capacité et inscriptions</dt>
          <dd>
            {event.capaciteMax} places · {event.capaciteMax - event.placesRestantes}{" "}
            inscriptions confirmées
          </dd>
        </div>
        <div>
          <dt>Places restantes</dt>
          <dd>
            {event.placesRestantes}
            {event.disponibilite &&
              (event.disponibilite === "COMPLET" ? " · Complet" : " · Ouvert")}
          </dd>
        </div>
        {event.typePartenaire && (
          <div>
            <dt>Type d’organisme</dt>
            <dd>{event.typePartenaire}</dd>
          </div>
        )}
        {event.contactTel && (
          <div>
            <dt>Contact</dt>
            <dd>{event.contactTel}</dd>
          </div>
        )}
      </dl>
      <h3>Description</h3>
      <p className="preserve-lines">
        {event.description || "Aucune description renseignée."}
      </p>
    </section>
  );
}

export function ManagedEvents({ user, admin = false }) {
  const resource = useResource(admin ? "/admin/events" : "/managed/events");
  const [editing, setEditing] = useState(
    () =>
      new URLSearchParams(window.location.hash.split("?")[1] || "").get(
        "edit",
      ) || null,
  );
  const [status, setStatus] = useState("");
  const [previewId, setPreviewId] = useState(null);
  const editingEvent =
    typeof editing === "string"
      ? resource.data?.find((e) => e.id === editing)
      : editing;
  const moderationActions = {
    BROUILLON: [
      ["validate", "Valider"],
      ["withdraw", "Retirer du catalogue"],
    ],
    PUBLIE: [
      ["suspend", "Suspendre"],
      ["withdraw", "Retirer du catalogue"],
    ],
    SUSPENDU: [
      ["restore", "Rétablir"],
      ["withdraw", "Retirer du catalogue"],
    ],
  };
  const events = (resource.data || []).filter(
    (e) => !status || e.statut === status,
  );
  const previewEvent = admin && events.find((event) => event.id === previewId);
  return (
    <>
      <header className="page-heading row">
        <div>
          <h1>{admin ? "Modération des événements" : "Mes événements"}</h1>
          <p>
            {admin
              ? "Supervisez les publications et leur visibilité sur le campus."
              : "Préparez, publiez et gérez les événements de votre organisation."}
          </p>
        </div>
        {!admin && (
          <a className="button primary" href="#/manage/events/new">
            <Icon name="plus" size={17} /> Créer un événement
          </a>
        )}
      </header>
      {editingEvent && !admin && (
        <EventWizard
          key={editingEvent.id}
          event={editingEvent}
          user={user}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            resource.reload();
          }}
        />
      )}
      <div className="management-toolbar">
        <button onClick={resource.reload}>Actualiser</button>
        <label>
          Statut
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les événements</option>
            <option value="BROUILLON">Brouillons</option>
            <option value="PUBLIE">Publiés</option>
            <option value="SUSPENDU">Suspendus</option>
            <option value="ANNULE">Annulés</option>
          </select>
        </label>
      </div>
      <ResourceState resource={resource}>
        {previewEvent && (
          <AdminEventPreview
            event={previewEvent}
            onClose={() => {
              setPreviewId(null);
              document.getElementById("event-preview-toggle-" + previewId)?.focus();
            }}
          />
        )}
        {events.length > 0 ? (
          <div className="table-wrap organizer-table">
            <table>
              <thead>
                <tr>
                  <th>Événement</th>
                  <th>Date et lieu</th>
                  <th>Places</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <div className="event-table-title">
                        <div className="event-thumbnail">
                          <Artwork category={event.categorie} title={event.titre} organizer={event.organisateur} />
                        </div>
                        <div>
                          <strong>{event.titre}</strong>
                          <small>{event.organisateur}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {dateTime(
                        event.dateHeureDebut,
                        event.dateHeureDebutCampus,
                      )}
                      <small>{event.lieu}</small>
                    </td>
                    <td>
                      {event.placesRestantes} / {event.capaciteMax}
                      <small>disponibles</small>
                    </td>
                    <td>
                      <Badge>{event.statut}</Badge>
                    </td>
                    <td className="management-actions">
                      {admin && (
                        <button
                          id={"event-preview-toggle-" + event.id}
                          type="button"
                          aria-expanded={previewId === event.id}
                          aria-controls={"event-preview-" + event.id}
                          onClick={() => {
                            const next = previewId === event.id ? null : event.id;
                            setPreviewId(next);
                            if (next)
                              requestAnimationFrame(() =>
                                document.getElementById("event-preview-" + next)?.focus(),
                              );
                          }}
                        >
                          {previewId === event.id
                            ? "Masquer les détails"
                            : "Consulter les détails"}
                        </button>
                      )}
                      {event.statut === "PUBLIE" && (
                        <a href={"#/events/" + event.id}>Voir la fiche</a>
                      )}
                      {admin ? (
                        (moderationActions[event.statut] || []).map(
                          ([action, label]) => (
                            <Action
                              key={action}
                              onClick={async () => {
                                await api(
                                  "/admin/events/" + event.id + "/" + action,
                                  { method: "POST" },
                                );
                                resource.reload();
                              }}
                            >
                              {label}
                            </Action>
                          ),
                        )
                      ) : (
                        <button
                          onClick={() => {
                            setEditing(event);
                            window.scrollTo(0, 0);
                          }}
                        >
                          <Icon name="edit" size={15} /> Modifier
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Aucun événement à gérer pour ce statut.</p>
        )}
      </ResourceState>
    </>
  );
}

export function Members({ user }) {
  const clubs = user.clubs.filter(
    (club) => club.roleDansClub === "RESPONSABLE",
  );
  const [selected, setSelected] = useState(clubs[0]?.id || "");
  const resource = useResource(
    selected ? `/clubs/${selected}/memberships` : null,
  );
  const labels = {
    EN_ATTENTE: "En attente",
    ACCEPTE: "Membre",
    REFUSE: "Refusée",
  };
  return (
    <>
      <header className="page-heading">
        <h1>Adhésions et membres</h1>
        <p>
          Accueillez les nouveaux membres et suivez les demandes de votre club.
        </p>
      </header>
      <label className="member-selector">
        Mon club
        <select
          aria-label="Mon club"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {clubs.map((club) => (
            <option value={club.id} key={club.id}>
              {club.nomClub}
            </option>
          ))}
        </select>
      </label>
      <ResourceState resource={resource}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Étudiant</th>
                <th>État</th>
                <th>Rôle dans le club</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resource.data?.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="member-name">
                      <span className="avatar">
                        {member.prenom[0]}
                        {member.nom[0]}
                      </span>
                      <div>
                        {member.prenom} {member.nom}
                        <small>{member.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge>{labels[member.statut]}</Badge>
                  </td>
                  <td>
                    {member.roleDansClub === "RESPONSABLE"
                      ? "Responsable"
                      : "Membre"}
                  </td>
                  <td className="actions">
                    {member.statut === "EN_ATTENTE" &&
                      ["ACCEPTE", "REFUSE"].map((statut) => (
                        <Action
                          key={statut}
                          onClick={async () => {
                            await api(
                              `/clubs/${selected}/memberships/${member.id}`,
                              { method: "PATCH", body: { statut } },
                            );
                            resource.reload();
                          }}
                        >
                          {statut === "ACCEPTE" ? "Accepter" : "Refuser"}
                        </Action>
                      ))}
                    {member.statut === "ACCEPTE" && (
                      <Action
                        onClick={async () => {
                          await api(
                            `/clubs/${selected}/memberships/${member.id}`,
                            { method: "DELETE" },
                          );
                          resource.reload();
                        }}
                      >
                        Retirer
                      </Action>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {resource.data?.length === 0 && (
          <p className="empty">Aucune demande ni adhésion.</p>
        )}
      </ResourceState>
    </>
  );
}

export function Accounts() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState("");
  const [editing, setEditing] = useState(null);
  const params = new URLSearchParams({ q: query });
  if (role) params.set("role", role);
  if (active) params.set("actif", active);
  const resource = useResource(`/admin/users?${params}`);
  return (
    <>
      <header className="page-heading">
        <h1>Comptes et rôles</h1>
        <p>Gérez les accès à la communauté universitaire Campus360.</p>
      </header>
      <div className="filters">
        <label>
          Rechercher
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom ou e-mail"
          />
        </label>
        <label>
          Rôle
          <select
            aria-label="Rôle"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">Tous</option>
            {["ETUDIANT", "ANNONCEUR", "ADMINISTRATEUR"].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Accès
          <select
            aria-label="Accès"
            value={active}
            onChange={(event) => setActive(event.target.value)}
          >
            <option value="">Tous</option>
            <option value="true">Actifs</option>
            <option value="false">Suspendus</option>
          </select>
        </label>
      </div>
      {editing && (
        <section className="card admin-editor">
          <div className="row">
            <h2>{editing.email}</h2>
            <button onClick={() => setEditing(null)}>Fermer</button>
          </div>
          <Form
            key={editing.id}
            onSubmit={async (values) => {
              const body = Object.fromEntries(values);
              body.actif = values.get("actif") === "true";
              await api(`/admin/users/${editing.id}`, {
                method: "PATCH",
                body,
              });
              setEditing(null);
              resource.reload();
            }}
          >
            <label>
              Rôle global
              <select
                aria-label="Rôle global"
                name="role"
                defaultValue={editing.role}
              >
                {["ETUDIANT", "ANNONCEUR", "ADMINISTRATEUR"].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Accès
              <select
                aria-label="Accès"
                name="actif"
                defaultValue={String(editing.actif)}
              >
                <option value="true">Actif</option>
                <option value="false">Suspendu</option>
              </select>
            </label>
            <Field
              name="nomOrganisation"
              label="Organisme (requis pour un annonceur)"
              defaultValue={editing.nomOrganisation || ""}
              maxLength={200}
            />
            <Field
              name="typePartenaire"
              label="Type de partenaire"
              defaultValue={editing.typePartenaire || ""}
              maxLength={120}
            />
            <Field
              name="contactTel"
              label="Téléphone de l’organisme"
              defaultValue={editing.contactTel || ""}
              maxLength={50}
            />
          </Form>
        </section>
      )}
      <ResourceState resource={resource}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Vérification</th>
                <th>Accès</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {resource.data?.map((account) => (
                <tr key={account.id}>
                  <td>
                    {account.prenom} {account.nom}
                    <small>{account.email}</small>
                  </td>
                  <td>{account.role}</td>
                  <td>
                    <Badge>
                      {account.estVerifie ? "Vérifié" : "En attente"}
                    </Badge>
                  </td>
                  <td>
                    <Badge>{account.actif ? "Actif" : "Suspendu"}</Badge>
                  </td>
                  <td>
                    <button onClick={() => setEditing(account)}>Gérer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {resource.data?.length === 0 && (
          <p className="empty">Aucun compte ne correspond à ces filtres.</p>
        )}
      </ResourceState>
    </>
  );
}

function ClubManagers({ club }) {
  return (
    <section className="club-managers" aria-label="Responsables actuels">
      <h3>Responsables actuels</h3>
      {club.responsables === undefined ? (
        <p>Les affectations ne sont pas disponibles.</p>
      ) : club.responsables.length > 0 ? (
        <ul>
          {club.responsables.map((manager) => (
            <li key={manager.id}>
              <strong>{manager.prenom} {manager.nom}</strong>
              <span>{manager.email}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Aucun responsable affecté.</p>
      )}
    </section>
  );
}

export function AdminClubs() {
  const resource = useResource("/admin/clubs");
  const students = useResource("/admin/users?role=ETUDIANT&actif=true");
  const [editing, setEditing] = useState(null);
  return (
    <>
      <div className="page-heading row">
        <div>
          <h1>Administration des clubs</h1>
          <p>Créez les clubs officiels et désignez leurs responsables.</p>
        </div>
        <button className="primary" onClick={() => setEditing({})}>
          Créer un club
        </button>
      </div>
      {editing && (
        <section className="card admin-editor">
          <div className="row">
            <h2>{editing.id ? "Modifier le club" : "Nouveau club"}</h2>
            <button onClick={() => setEditing(null)}>Fermer</button>
          </div>
          {editing.id && <ClubManagers club={editing} />}
          <Form
            key={editing.id || "new"}
            onSubmit={async (values) => {
              const body = Object.fromEntries(values);
              body.logoUrl = await uploadImage(
                values.get("logoFile"),
                body.logoUrl,
              );
              delete body.logoFile;
              body.statutActif = values.get("statutActif") === "true";
              body.responsableId = body.responsableId || null;
              await api(
                editing.id ? `/admin/clubs/${editing.id}` : "/admin/clubs",
                { method: editing.id ? "PUT" : "POST", body },
              );
              setEditing(null);
              resource.reload();
            }}
          >
            <Field
              name="nomClub"
              label="Nom du club"
              required
              maxLength={200}
              defaultValue={editing.nomClub || ""}
            />
            <label>
              Description
              <textarea
                name="description"
                rows={5}
                required
                maxLength={20000}
                defaultValue={editing.description || ""}
              />
            </label>
            <Field
              name="categorie"
              label="Catégorie"
              required
              maxLength={120}
              defaultValue={editing.categorie || ""}
            />
            <Field
              name="logoUrl"
              label="URL du logo (facultative)"
              defaultValue={editing.logoUrl || ""}
            />
            <Field
              name="logoFile"
              label="Importer un logo · PNG ou JPEG, 2 Mo maximum"
              type="file"
              accept="image/png,image/jpeg"
            />
            <Field
              name="contact"
              label="Contact du club"
              maxLength={500}
              defaultValue={editing.contact || ""}
            />
            <label>
              Bureau du club
              <textarea
                name="bureau"
                maxLength={1000}
                defaultValue={editing.bureau || ""}
              />
            </label>
            <label>
              Visibilité
              <select
                aria-label="Visibilité"
                name="statutActif"
                defaultValue={String(editing.statutActif ?? true)}
              >
                <option value="true">Actif</option>
                <option value="false">Archivé</option>
              </select>
            </label>
            <label>
              {editing.id
                ? "Nommer un responsable (facultatif)"
                : "Étudiant responsable"}
              <select
                aria-label="Étudiant responsable"
                name="responsableId"
                required={!editing.id}
                defaultValue=""
              >
                <option value="">Choisir un étudiant vérifié</option>
                {students.data
                  ?.filter((student) => student.estVerifie)
                  .map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.prenom} {student.nom} · {student.email}
                    </option>
                  ))}
              </select>
            </label>
          </Form>
        </section>
      )}
      <ResourceState resource={resource}>
        <div className="grid">
          {resource.data?.map((club) => (
            <article className="card admin-club-card" key={club.id}>
              <span className="club-monogram">
                <ClubAvatar club={club} size={26} />
              </span>
              <Badge>{club.statutActif ? "Actif" : "Archivé"}</Badge>
              <h2>{club.nomClub}</h2>
              <p>{club.nombreMembres} membres</p>
              <ClubManagers club={club} />
              <button onClick={() => setEditing(club)}>
                Modifier / nommer un responsable
              </button>
            </article>
          ))}
        </div>
      </ResourceState>
    </>
  );
}
