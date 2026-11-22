import { useRef, useState } from "react";
import { dateTime } from "./api.js";
import { Artwork } from "./ui/Artwork.jsx";
import { Icon } from "./ui/Icons.jsx";
import { ClubAvatar } from "./ui/ClubAvatar.jsx";

export function ResourceState({
  resource,
  children,
  loadingLabel = "Chargement…",
  errorLabel = "",
}) {
  if (resource.loading)
    return (
      <div role="status" className="resource-loading">
        <span className="loading-dot" />
        {loadingLabel}
      </div>
    );
  if (resource.error)
    return (
      <div role="alert" className="error">
        {errorLabel && <strong>{errorLabel} </strong>}
        {resource.error} <button onClick={resource.reload}>Réessayer</button>
      </div>
    );
  return children;
}

export function Form({
  onSubmit,
  submitLabel = "Enregistrer",
  children,
  className = "",
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const feedback = useRef(null);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const feedback = await onSubmit(values);
      setMessage(
        typeof feedback === "string" ? feedback : "Enregistrement effectué.",
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }
  return (
    <form className={`form ${className}`} onSubmit={submit}>
      {children}
      {error && (
        <p className="error" role="alert" tabIndex={-1} ref={feedback}>
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status" tabIndex={-1} ref={feedback}>
          {message}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "En cours…" : submitLabel}
      </button>
    </form>
  );
}

export function Field({ label, name, type = "text", ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} {...props} />
    </label>
  );
}

export function Action({
  onClick,
  children,
  className = "",
  disabled = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act() {
    setBusy(true);
    setError("");
    try {
      await onClick();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="action">
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={act}
      >
        {busy ? "En cours…" : children}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export function Badge({ children }) {
  const labels = {
    BROUILLON: "Brouillon",
    PUBLIE: "Publié",
    ANNULE: "Annulé",
    SUSPENDU: "Suspendu",
    CONFIRMEE: "Confirmée",
    ANNULEE: "Annulée",
    EN_ATTENTE: "En attente",
    ACCEPTE: "Membre",
    REFUSE: "Refusée",
  };
  return (
    <span className={`badge badge-${String(children).toLowerCase()}`}>
      {labels[children] || children}
    </span>
  );
}

export function EventCard({ event }) {
  return (
    <article className="card event-card discovery-card">
      <div className="event-art" aria-hidden="true">
        <Artwork category={event.categorie} title={event.titre} organizer={event.organisateur} />
        <Badge>{event.categorie}</Badge>
      </div>
      <div className="event-card-body">
        <h2>
          <a className="discovery-link" href={`#/events/${event.id}`}>{event.titre}</a>
        </h2>
        <p className="icon-line">
          <Icon name="clock" size={17} />
          {dateTime(event.dateHeureDebut, event.dateHeureDebutCampus)}
        </p>
        <p className="icon-line">
          <Icon name="pin" size={17} />
          {event.lieu}
        </p>
        <div className="event-card-footer">
          <small>{event.organisateur}</small>
          <span className={event.placesRestantes === 0 ? "full-label" : ""}>
            {event.placesRestantes === 0
              ? "Complet"
              : `${event.placesRestantes} places`}
          </span>
        </div>
        <span className="text-link event-details-hint" aria-hidden="true">
          Voir les détails <Icon name="arrow" size={15} />
        </span>
      </div>
    </article>
  );
}

export function ClubCard({ club, heading = "h2" }) {
  const Title = heading;
  return (
    <article className="card club-card discovery-card">
      <div className="row">
        <span className="club-monogram"><ClubAvatar club={club} /></span>
        <Badge>{club.categorie}</Badge>
      </div>
      <Title className="club-card-title">
        <a className="discovery-link" href={`#/clubs/${club.id}`}>{club.nomClub}</a>
      </Title>
      <p className="club-excerpt">{club.description}</p>
      <div className="club-card-bottom">
        <span className="icon-line">
          <Icon name="users" size={16} /> {club.nombreMembres} membres
        </span>
        <span className="text-link" aria-hidden="true">
          Découvrir le club <Icon name="arrow" size={15} />
        </span>
      </div>
    </article>
  );
}

export function EventList({ events = [] }) {
  if (events.length === 0)
    return <p className="empty">Aucun événement ne correspond.</p>;
  return (
    <div className="grid">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
