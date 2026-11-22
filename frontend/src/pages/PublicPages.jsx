import { useState } from "react";
import { api, dateTime, navigate } from "../api.js";
import { useResource } from "../hooks.js";
import { Action, Badge, ClubCard, EventList, ResourceState } from "../components.jsx";
import { Artwork } from "../ui/Artwork.jsx";
import { ClubAvatar } from "../ui/ClubAvatar.jsx";
import { Icon } from "../ui/Icons.jsx";
import { eventDate } from "../ui/presentation.js";

export function Catalogue() {
  const empty = {
    q: "",
    categorie: "",
    date: "",
    clubId: "",
    disponibles: false,
  };
  const [filters, setFilters] = useState(() => ({
    ...empty,
    q:
      new URLSearchParams(window.location.hash.split("?")[1] || "").get("q") ||
      "",
  }));
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const resource = useResource(`/events?${query}`);
  const all = useResource("/events");
  const clubs = useResource("/clubs");
  const change = (event) =>
    setFilters({
      ...filters,
      [event.target.name]:
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value,
    });
  const categories = [
    ...new Set((all.data || []).map((event) => event.categorie)),
  ];

  return (
    <>
      <header className="page-heading">
        <h1>Événements du campus</h1>
        <p>Découvrez les activités et rencontres de l’USMS.</p>
      </header>
      <section className="filters" aria-label="Filtrer les événements">
        <label>
          Rechercher
          <input
            name="q"
            value={filters.q}
            onChange={change}
            placeholder="Titre ou mot-clé"
          />
        </label>
        <label>
          Catégorie
          <select
            aria-label="Catégorie"
            name="categorie"
            value={filters.categorie}
            onChange={change}
          >
            <option value="">Toutes les catégories</option>
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            name="date"
            value={filters.date}
            onChange={change}
          />
        </label>
        <label>
          Club
          <select
            aria-label="Club"
            name="clubId"
            value={filters.clubId}
            onChange={change}
          >
            <option value="">Tous les clubs</option>
            {clubs.data?.map((club) => (
              <option value={club.id} key={club.id}>
                {club.nomClub}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="disponibles"
            checked={filters.disponibles}
            onChange={change}
          />
          Places disponibles
        </label>
        <button onClick={() => setFilters(empty)}>Réinitialiser</button>
      </section>
      <ResourceState resource={resource}>
        <EventList events={resource.data || []} />
      </ResourceState>
    </>
  );
}

function authenticateReturn(path) {
  sessionStorage.setItem("campus360:returnTo", path);
  navigate("/login");
}

export function EventDetail({ id, user }) {
  const resource = useResource("/events/" + id);
  const registrations = useResource(
    user?.role === "ETUDIANT" ? "/me/registrations" : null,
  );
  const [confirmation, setConfirmation] = useState(null);
  const [tab, setTab] = useState("description");
  const event = resource.data;
  const registration = registrations.data?.find(
    (item) => item.evenementId === id && item.statut === "CONFIRMEE",
  );
  async function register() {
    if (!user) return authenticateReturn("/events/" + id);
    const result = await api("/events/" + id + "/registrations", {
      method: "POST",
    });
    setConfirmation(result.evenement);
    registrations.reload();
    resource.reload();
  }
  return (
    <ResourceState resource={resource}>
      {event && (
        <>
          <a className="back-link" href="#/events">
            <Icon name="back" size={17} /> Retour aux événements
          </a>
          <div className="event-detail-layout">
            <article className="event-detail-main">
              <div className="event-cover">
                <Artwork category={event.categorie} title={event.titre} organizer={event.organisateur} />
                <Badge>{event.categorie}</Badge>
              </div>
              <h1>{event.titre}</h1>
              <div className="event-meta">
                <span>
                  <Icon name="calendar" />
                  {eventDate(event, "date")}
                </span>
                <span>
                  <Icon name="clock" />
                  {eventDate(event, "time")} – {eventDate(event, "time", true)}
                </span>
                <span>
                  <Icon name="pin" />
                  {event.lieu}
                </span>
              </div>
              <div
                className="detail-tabs"
                role="tablist"
                aria-label="Détails de l’événement"
              >
                {[
                  ["description", "Description"],
                  ["informations", "Informations"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    id={"tab-" + key}
                    role="tab"
                    aria-selected={tab === key}
                    aria-controls={"panel-" + key}
                    tabIndex={tab === key ? 0 : -1}
                    onClick={() => setTab(key)}
                    onKeyDown={(e) => {
                      if (
                        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          e.key,
                        )
                      ) {
                        e.preventDefault();
                        const next =
                          e.key === "Home"
                            ? "description"
                            : e.key === "End"
                              ? "informations"
                              : key === "description"
                                ? "informations"
                                : "description";
                        setTab(next);
                        document.getElementById("tab-" + next).focus();
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "description" ? (
                <div
                  id="panel-description"
                  role="tabpanel"
                  aria-labelledby="tab-description"
                  tabIndex={0}
                >
                  <p className="preserve-lines">
                    {event.description || "Aucune description renseignée."}
                  </p>
                </div>
              ) : (
                <div
                  id="panel-informations"
                  role="tabpanel"
                  aria-labelledby="tab-informations"
                  tabIndex={0}
                >
                  <dl className="information-grid">
                    <div>
                      <dt>Début</dt>
                      <dd>
                        {dateTime(
                          event.dateHeureDebut,
                          event.dateHeureDebutCampus,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Fin</dt>
                      <dd>
                        {dateTime(event.dateHeureFin, event.dateHeureFinCampus)}
                      </dd>
                    </div>
                    <div>
                      <dt>Lieu</dt>
                      <dd>{event.lieu}</dd>
                    </div>
                    <div>
                      <dt>Places restantes</dt>
                      <dd>
                        {event.placesRestantes} / {event.capaciteMax}
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
                </div>
              )}
            </article>
            <aside className="event-booking">
              <section className="organizer-panel">
                <h2>Organisé par</h2>
                <div className="organizer-identity">
                  <span className="organizer-symbol">
                    <Icon name={event.clubId ? "spark" : "users"} />
                  </span>
                  <div>
                    {event.clubId && event.clubActif ? (
                      <a href={"#/clubs/" + event.clubId}>
                        {event.organisateur}
                      </a>
                    ) : (
                      <strong>{event.organisateur}</strong>
                    )}
                    <small>
                      {event.clubId
                        ? "Club universitaire"
                        : event.typePartenaire || "Organisme partenaire"}
                    </small>
                  </div>
                </div>
                <hr />
                <h2>Participants</h2>
                <div className="participant-count">
                  <Icon name="users" />
                  <strong>{event.capaciteMax - event.placesRestantes}</strong>
                  <span>
                    inscription
                    {event.capaciteMax - event.placesRestantes > 1 ? "s" : ""}{" "}
                    confirmée
                    {event.capaciteMax - event.placesRestantes > 1 ? "s" : ""}
                  </span>
                </div>
                <p className="availability">
                  {event.placesRestantes === 0
                    ? "Toutes les places sont réservées."
                    : event.placesRestantes +
                      " places disponibles sur " +
                      event.capaciteMax}
                </p>
              </section>
              <div className="booking-action">
                <ResourceState
                  resource={registrations}
                  loadingLabel="Vérification de votre inscription…"
                  errorLabel="Impossible de vérifier votre inscription."
                >
                  {registration ? (
                    <>
                      <p className="confirmed-note">
                        <Icon name="check" size={17} /> Inscription confirmée
                      </p>
                      <Action
                        onClick={async () => {
                          await api("/me/registrations/" + registration.id, {
                            method: "DELETE",
                          });
                          setConfirmation(null);
                          registrations.reload();
                          resource.reload();
                        }}
                      >
                        Annuler mon inscription
                      </Action>
                    </>
                  ) : !user || user.role === "ETUDIANT" ? (
                    <Action
                      className="primary"
                      disabled={event.placesRestantes === 0 || event.passe}
                      onClick={register}
                    >
                      <Icon name="users" size={17} />
                      {event.passe
                        ? "Événement terminé"
                        : event.placesRestantes === 0
                          ? "Complet"
                          : "S’inscrire"}
                    </Action>
                  ) : (
                    <p>Les inscriptions sont réservées aux étudiants.</p>
                  )}
                </ResourceState>
                {!user && (
                  <small>Connectez-vous avec votre compte universitaire.</small>
                )}
              </div>
            </aside>
          </div>
          {confirmation && (
            <section className="success" role="status">
              <h2>Votre inscription est confirmée</h2>
              <p>
                {confirmation.titre} ·{" "}
                {dateTime(
                  confirmation.dateHeureDebut,
                  confirmation.dateHeureDebutCampus,
                )}{" "}
                · {confirmation.lieu}
              </p>
              <p>Un courriel récapitulatif vous est envoyé.</p>
              <a href="#/registrations">Voir mes inscriptions</a>
            </section>
          )}
        </>
      )}
    </ResourceState>
  );
}

export function ClubDirectory() {
  const resource = useResource("/clubs");
  const [query, setQuery] = useState("");
  const clubs = (resource.data || []).filter((c) =>
    (c.nomClub + " " + c.description + " " + c.categorie)
      .toLocaleLowerCase("fr")
      .includes(query.toLocaleLowerCase("fr")),
  );
  return (
    <>
      <header className="page-heading">
        <h1>Clubs universitaires</h1>
        <p>Rencontrez votre communauté et faites vivre vos passions.</p>
      </header>
      <section className="directory-banner">
        <div>
          <span className="eyebrow">LA VIE ASSOCIATIVE À L’USMS</span>
          <h2>
            Un campus. Des passions.
            <br />
            Votre communauté.
          </h2>
          <p>Découvrez les clubs et demandez à les rejoindre.</p>
        </div>
        <Icon name="users" size={100} />
      </section>
      <div className="directory-search">
        <Icon name="search" size={19} />
        <input
          type="search"
          aria-label="Rechercher un club"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un club, une activité…"
        />
      </div>
      <ResourceState resource={resource}>
        <div className="grid">
          {clubs.map((club) => (
            <ClubCard key={club.id} club={club} />
          ))}
        </div>
        {clubs.length === 0 && (
          <p className="empty">Aucun club ne correspond à votre recherche.</p>
        )}
      </ResourceState>
    </>
  );
}

export function ClubDetail({ id, user }) {
  const resource = useResource("/clubs/" + id);
  const memberships = useResource(
    user?.role === "ETUDIANT" ? "/me/memberships" : null,
  );
  const [past, setPast] = useState(false);
  const club = resource.data;
  const membership = memberships.data?.find((item) => item.clubId === id);
  const pending = membership?.statut === "EN_ATTENTE";
  const member = membership?.statut === "ACCEPTE";
  return (
    <ResourceState resource={resource}>
      {club && (
        <>
          <a className="back-link" href="#/clubs">
            <Icon name="back" size={17} /> Annuaire des clubs
          </a>
          <header className="club-detail-header">
            <span className="club-monogram large">
              <ClubAvatar club={club} size={40} />
            </span>
            <div>
              <Badge>{club.categorie}</Badge>
              <h1>{club.nomClub}</h1>
              <p className="icon-line">
                <Icon name="users" size={17} />
                {club.nombreMembres} membres
              </p>
            </div>
          </header>
          <div className="detail-layout club-detail-layout">
            <article className="card">
              <h2>À propos du club</h2>
              <p className="preserve-lines">{club.description}</p>
              {club.bureau && (
                <>
                  <h3>Bureau du club</h3>
                  <p className="preserve-lines">{club.bureau}</p>
                </>
              )}
            </article>
            <aside className="card club-join">
              <span className="auth-symbol">
                <Icon name="users" size={25} />
              </span>
              <h2>Faites partie de l’aventure</h2>
              <p>
                Rejoignez la communauté et participez aux activités du club.
              </p>
              {club.contact && (
                <p className="club-contact">
                  <strong>Contact</strong>
                  <br />
                  {club.contact}
                </p>
              )}
              <ResourceState
                resource={memberships}
                loadingLabel="Vérification de votre adhésion…"
                errorLabel="Impossible de vérifier votre adhésion."
              >
                {(!user || user.role === "ETUDIANT") && (
                  <Action
                    className="primary"
                    disabled={pending || member}
                    onClick={async () => {
                      if (!user) return authenticateReturn("/clubs/" + id);
                      await api("/clubs/" + id + "/memberships", {
                        method: "POST",
                      });
                      memberships.reload();
                    }}
                  >
                    {member
                      ? "Membre"
                      : pending
                        ? "En attente"
                        : "Rejoindre le club"}
                  </Action>
                )}
                {pending && (
                  <small>
                    Votre demande sera examinée par un responsable du club.
                  </small>
                )}
              </ResourceState>
            </aside>
          </div>
          <header className="section-heading">
            <h2>Les événements du club</h2>
          </header>
          <div
            className="category-tabs"
            aria-label="Période des événements du club"
          >
            <button
              className={!past ? "selected" : ""}
              aria-pressed={!past}
              onClick={() => setPast(false)}
            >
              À venir
            </button>
            <button
              className={past ? "selected" : ""}
              aria-pressed={past}
              onClick={() => setPast(true)}
            >
              Passés
            </button>
          </div>
          <EventList
            events={club.evenements.filter(
              (event) => Boolean(event.passe) === past,
            )}
          />
        </>
      )}
    </ResourceState>
  );
}
