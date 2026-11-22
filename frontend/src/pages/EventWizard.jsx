import { useEffect, useRef, useState } from "react";
import { api, localDateTime, navigate } from "../api.js";
import { useResource } from "../hooks.js";
import { Icon } from "../ui/Icons.jsx";
import { Badge } from "../components.jsx";
import { revealSurface } from "../ui/motion.js";

export function EventWizard({ event = {}, user, onSaved, onCancel }) {
  const clubs = user.clubs.filter((c) => c.roleDansClub === "RESPONSABLE");
  const categories = useResource("/events");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef(null);
  const alert = useRef(null);
  useEffect(() => {
    const entrance = revealSurface(heading.current?.closest(".wizard-card"), {
      distance: 4,
      duration: 180,
    });
    return () => entrance?.cancel();
  }, [step]);
  const [values, setValues] = useState(() => ({
    titre: event.titre || "",
    categorie: event.categorie || "",
    description: event.description || "",
    lieu: event.lieu || "",
    dateHeureDebut: event.dateHeureDebut
      ? localDateTime(event.dateHeureDebut)
      : "",
    dateHeureFin: event.dateHeureFin ? localDateTime(event.dateHeureFin) : "",
    capaciteMax: event.capaciteMax || 30,
    clubId: event.clubId || clubs[0]?.id || "",
    statut: event.statut || "BROUILLON",
  }));
  const change = (e) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
  const input = (name) => ({ name, value: values[name], onChange: change });
  function move(next) {
    setError("");
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function fail(message) {
    setError(message);
    requestAnimationFrame(() => alert.current?.focus());
  }
  async function submit(e) {
    e.preventDefault();
    if (
      step === 1 &&
      new Date(values.dateHeureFin) <= new Date(values.dateHeureDebut)
    )
      return fail("La fin de l’événement doit être postérieure au début.");
    if (step < 2) return move(step + 1);
    setBusy(true);
    setError("");
    try {
      const result = await api(event.id ? `/events/${event.id}` : "/events", {
        method: event.id ? "PUT" : "POST",
        body: {
          ...values,
          capaciteMax: Number(values.capaciteMax),
          clubId: user.role === "ETUDIANT" ? values.clubId : null,
          dateHeureDebut: new Date(values.dateHeureDebut).toISOString(),
          dateHeureFin: new Date(values.dateHeureFin).toISOString(),
        },
      });
      onSaved(result);
    } catch (failure) {
      fail(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="event-wizard">
      <h1>{event.id ? "Modifier l’événement" : "Créer un événement"}</h1>
      <ol className="stepper" aria-label="Étapes de création">
        {["Informations", "Détails", "Publication"].map((label, index) => (
          <li
            key={label}
            className={
              index === step ? "current" : index < step ? "complete" : ""
            }
            aria-current={index === step ? "step" : undefined}
          >
            <button
              type="button"
              onClick={() => move(index)}
              disabled={index > step || busy}
            >
              <span>
                {index < step ? <Icon name="check" size={15} /> : index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="wizard-form">
        <section className="card wizard-card" aria-labelledby="wizard-heading">
          <h2 id="wizard-heading" ref={heading} tabIndex={-1}>
            {
              [
                "Informations de base",
                "Détails de l’événement",
                "Prêt à publier ?",
              ][step]
            }
          </h2>
          {step === 0 && (
            <>
              <div className="wizard-basic-grid">
                <label>
                  Titre de l’événement{" "}
                  <span className="required" aria-hidden="true">
                    *
                  </span>
                  <input
                    {...input("titre")}
                    required
                    maxLength={200}
                    placeholder="Ex. : Atelier React.js"
                  />
                </label>
                <label>
                  Catégorie{" "}
                  <span className="required" aria-hidden="true">
                    *
                  </span>
                  <input
                    aria-label="Catégorie"
                    {...input("categorie")}
                    list="event-categories"
                    required
                    maxLength={120}
                    placeholder="Sélectionner une catégorie"
                  />
                  <datalist id="event-categories">
                    {[
                      ...new Set(
                        (categories.data || []).map((c) => c.categorie),
                      ),
                    ].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
              </div>
              <label>
                Description{" "}
                <span className="required" aria-hidden="true">
                  *
                </span>
                <textarea
                  aria-label="Description"
                  {...input("description")}
                  required
                  maxLength={20000}
                  rows={5}
                  placeholder="Décrivez votre événement…"
                />
              </label>
            </>
          )}
          {step === 1 && (
            <div className="form-grid">
              <label className="full-width">
                Lieu{" "}
                <span className="required" aria-hidden="true">
                  *
                </span>
                <input
                  aria-label="Lieu"
                  {...input("lieu")}
                  required
                  maxLength={300}
                  placeholder="Ex. : Amphi A, campus USMS"
                />
              </label>
              <label>
                Début (heure locale de votre appareil){" "}
                <span className="required" aria-hidden="true">
                  *
                </span>
                <input
                  aria-label="Début (heure locale de votre appareil)"
                  {...input("dateHeureDebut")}
                  type="datetime-local"
                  required
                />
              </label>
              <label>
                Fin (heure locale de votre appareil){" "}
                <span className="required" aria-hidden="true">
                  *
                </span>
                <input
                  aria-label="Fin (heure locale de votre appareil)"
                  {...input("dateHeureFin")}
                  type="datetime-local"
                  required
                />
              </label>
              <label>
                Capacité maximale{" "}
                <span className="required" aria-hidden="true">
                  *
                </span>
                <input
                  {...input("capaciteMax")}
                  type="number"
                  required
                  min={1}
                  max={2147483647}
                />
              </label>
              {user.role === "ETUDIANT" && (
                <label>
                  Club organisateur{" "}
                  <span className="required" aria-hidden="true">
                    *
                  </span>
                  <select
                    {...input("clubId")}
                    required
                    disabled={Boolean(event.id)}
                  >
                    {clubs.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.nomClub}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {step === 2 && (
            <>
              <div className="publication-summary">
                <Badge>{values.categorie}</Badge>
                <h3>{values.titre}</h3>
                <p className="preserve-lines">{values.description}</p>
                <dl className="information-grid">
                  <div>
                    <dt>Lieu</dt>
                    <dd>{values.lieu}</dd>
                  </div>
                  <div>
                    <dt>Capacité</dt>
                    <dd>{values.capaciteMax} places</dd>
                  </div>
                  <div>
                    <dt>Début (heure de votre appareil)</dt>
                    <dd>{values.dateHeureDebut.replace("T", " · ")}</dd>
                  </div>
                  <div>
                    <dt>Fin (heure de votre appareil)</dt>
                    <dd>{values.dateHeureFin.replace("T", " · ")}</dd>
                  </div>
                </dl>
              </div>
              <label>
                Statut de publication
                <select
                  {...input("statut")}
                  disabled={event.statut === "SUSPENDU"}
                >
                  {event.statut === "SUSPENDU" ? (
                    <option value="SUSPENDU">
                      Suspendu par l’administration
                    </option>
                  ) : (
                    <>
                      <option value="BROUILLON">
                        Brouillon — préparer sans publier
                      </option>
                      <option value="PUBLIE">
                        Publié — visible dans le catalogue
                      </option>
                      {event.id && <option value="ANNULE">Annulé</option>}
                    </>
                  )}
                </select>
              </label>
              <p className="field-hint">
                {event.statut === "SUSPENDU"
                  ? "Seule l’administration peut rétablir cet événement. Vos modifications conservent la suspension."
                  : values.statut === "PUBLIE"
                    ? "Votre événement sera visible sur Campus360. Les étudiants pourront s’y inscrire selon les places disponibles."
                    : values.statut === "ANNULE"
                      ? "L’événement sera retiré du catalogue. Les inscriptions existantes seront conservées."
                      : "Un brouillon reste dans votre espace organisateur. Vous pourrez le publier plus tard."}
              </p>
            </>
          )}
        </section>
        {error && (
          <p className="error" role="alert" tabIndex={-1} ref={alert}>
            {error}
          </p>
        )}
        <footer className="wizard-actions">
          {step > 0 && (
            <button
              type="button"
              onClick={() => move(step - 1)}
              disabled={busy}
            >
              <Icon name="back" size={16} /> Précédent
            </button>
          )}
          <button type="button" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy
              ? "Enregistrement…"
              : step < 2
                ? "Suivant"
                : event.id
                  ? "Enregistrer les modifications"
                  : values.statut === "PUBLIE"
                    ? "Publier l’événement"
                    : "Enregistrer le brouillon"}
            {step < 2 && <Icon name="arrow" size={17} />}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function EventCreation({ user }) {
  return (
    <EventWizard
      user={user}
      onCancel={() => navigate("/manage/events")}
      onSaved={() => navigate("/manage/events")}
    />
  );
}
