import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icons.jsx";
import { Artwork } from "../ui/Artwork.jsx";
import { AuthLayout } from "../ui/AuthLayout.jsx";
import { AuthField } from "../ui/AuthField.jsx";
import { api, dateTime, navigate, uploadImage } from "../api.js";
import { useResource } from "../hooks.js";
import { Action, Badge, Field, Form, ResourceState } from "../components.jsx";

export function AuthPage({ mode = "login", onAuthenticated, returnTo }) {
  const email = sessionStorage.getItem("campus360:verificationEmail") || "";
  // Drafts live only while this authentication view is mounted, never in storage.
  const [drafts, setDrafts] = useState({});
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [mode]);
  function draft(name, fallback = "") {
    return {
      value: drafts[mode]?.[name] ?? fallback,
      onChange: (event) => {
        const value = event.target.value;
        setDrafts((current) => ({
          ...current,
          [mode]: { ...current[mode], [name]: value },
        }));
      },
    };
  }
  async function submit(values) {
    const body = Object.fromEntries(values);
    if (mode === "register") {
      await api("/auth/register", { method: "POST", body });
      sessionStorage.setItem("campus360:verificationEmail", body.email);
      navigate("/verify");
      return;
    }
    if (mode === "verify") {
      await api("/auth/verify", { method: "POST", body });
      navigate("/login");
      return;
    }
    const user = await api("/auth/session", { method: "POST", body });
    onAuthenticated(user);
    const target =
      returnTo ||
      sessionStorage.getItem("campus360:returnTo") ||
      (user.role === "ADMINISTRATEUR"
        ? "/admin/events"
        : user.role === "ANNONCEUR"
          ? "/manage"
          : "/home");
    sessionStorage.removeItem("campus360:returnTo");
    navigate(
      target.startsWith("/") && !target.startsWith("//") ? target : "/events",
    );
  }
  const titles = {
    login: "Connexion",
    register: "Créer mon compte",
    verify: "Vérifier mon adresse",
  };
  return (
    <AuthLayout>
      <section className="auth-card card">
        <span className="auth-kicker">
          <span aria-hidden="true" /> VOTRE ESPACE UNIVERSITAIRE
        </span>
        <h1 ref={heading} tabIndex={-1}>
          {mode === "login" ? "Bienvenue sur Campus360" : titles[mode]}
        </h1>
        {mode === "login" && (
          <p className="auth-description">
            Connectez-vous à votre espace universitaire.
          </p>
        )}
        {mode === "register" && (
          <p>Utilisez votre adresse universitaire @usms.ma.</p>
        )}
        {mode === "verify" && (
          <p>
            Saisissez le code à six chiffres reçu sur votre adresse
            universitaire.
          </p>
        )}
        <Form key={mode} onSubmit={submit} submitLabel={titles[mode]}>
          {mode === "register" && (
            <>
              <Field
                name="prenom"
                label="Prénom"
                {...draft("prenom")}
                required
                maxLength={120}
                autoComplete="given-name"
              />
              <Field
                name="nom"
                label="Nom"
                {...draft("nom")}
                required
                maxLength={120}
                autoComplete="family-name"
              />
              <Field
                name="cneApogee"
                label="CNE / Apogée (facultatif)"
                {...draft("cneApogee")}
                maxLength={100}
              />
            </>
          )}
          <AuthField
            name="email"
            label="Adresse universitaire"
            icon="mail"
            type="email"
            {...draft("email", email)}
            placeholder="prenom.nom@usms.ma"
            required
            autoComplete="email"
            maxLength={254}
          />
          {mode === "verify" ? (
            <AuthField
              name="code"
              label="Code de vérification"
              icon="shield"
              {...draft("code")}
              placeholder="000000"
              required
              pattern="[0-9]{6}"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          ) : (
            <AuthField
              name="motDePasse"
              label="Mot de passe"
              icon="lock"
              type="password"
              {...draft("motDePasse")}
              placeholder={
                mode === "register" ? "8 caractères minimum" : "Votre mot de passe"
              }
              required
              minLength={mode === "register" ? 8 : undefined}
              maxLength={72}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
            />
          )}
        </Form>
        {mode === "login" && (
          <div className="auth-links">
            <p>
              Nouveau sur Campus360 ?<br />
              <a href="#/register">Créer un compte universitaire</a>
            </p>
            <a href="#/verify">Vérifier mon adresse e-mail</a>
          </div>
        )}
        {mode === "register" && (
          <p>
            <a href="#/login">J’ai déjà un compte</a>
          </p>
        )}
        {mode === "verify" && (
          <Form
            key="resend"
            className="auth-resend"
            submitLabel="Renvoyer un code"
            onSubmit={async (values) => {
              await api("/auth/verification/resend", {
                method: "POST",
                body: Object.fromEntries(values),
              });
              return "Si le compte attend une vérification, un nouveau code sera envoyé.";
            }}
          >
            <AuthField
              name="email"
              label="Adresse pour le renvoi"
              icon="mail"
              type="email"
              {...draft("resendEmail", email)}
              required
            />
          </Form>
        )}
        <p className="auth-security">
          <Icon name="lock" size={14} /> Réservé aux adresses universitaires @usms.ma
        </p>
      </section>
    </AuthLayout>
  );
}

export function StudentProfile({ user, onChanged }) {
  return (
    <>
      <header className="page-heading">
        <h1>Mon profil</h1>
        <p>Personnalisez votre profil et retrouvez vos clubs universitaires.</p>
      </header>
      <div className="detail-layout profile-layout">
        <section className="card profile-editor">
          <div className="profile-identity">
            {!user.profile.photoProfil && (
              <span className="profile-initials">
                {user.prenom[0]}
                {user.nom[0]}
              </span>
            )}
            {user.profile.photoProfil && (
              <img
                className="profile-photo"
                src={user.profile.photoProfil}
                alt="Ma photo de profil"
              />
            )}
            <h2>
              {user.prenom} {user.nom}
            </h2>
            <p>{user.email}</p>
            <p>CNE / Apogée · {user.profile.cneApogee || "Non renseigné"}</p>
          </div>
          <h3>Informations académiques</h3>
          <Form
            key={user.id}
            onSubmit={async (values) => {
              const photoProfil = values.get("removePhoto")
                ? ""
                : await uploadImage(
                    values.get("photoFile"),
                    user.profile.photoProfil,
                  );
              const updated = await api("/me/profile", {
                method: "PATCH",
                body: {
                  filiere: values.get("filiere"),
                  niveau: values.get("niveau"),
                  centresInteret: values
                    .get("centresInteret")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  photoProfil,
                },
              });
              onChanged(updated);
            }}
          >
            <Field
              label="Filière"
              name="filiere"
              defaultValue={user.profile.filiere}
              maxLength={200}
            />
            <Field
              label="Niveau"
              name="niveau"
              defaultValue={user.profile.niveau}
              maxLength={100}
            />
            <Field
              label="Centres d’intérêt (séparés par des virgules)"
              name="centresInteret"
              defaultValue={user.profile.centresInteret.join(", ")}
            />
            <Field
              label="Photo de profil · PNG ou JPEG, 2 Mo maximum"
              name="photoFile"
              type="file"
              accept="image/png,image/jpeg"
            />
            {user.profile.photoProfil && (
              <label className="checkbox">
                <input name="removePhoto" type="checkbox" />
                Supprimer ma photo
              </label>
            )}
          </Form>
        </section>
        <section className="card">
          <h2>Mes clubs</h2>
          {user.clubs.length === 0 ? (
            <p>Vous n’avez pas encore rejoint de club.</p>
          ) : (
            user.clubs.map((club) => (
              <p key={club.id}>
                {club.statutActif ? (
                  <a href={`#/clubs/${club.id}`}>{club.nomClub}</a>
                ) : (
                  club.nomClub
                )}{" "}
                <Badge>
                  {club.roleDansClub === "RESPONSABLE"
                    ? "Responsable"
                    : "Membre"}
                </Badge>
              </p>
            ))
          )}
        </section>
      </div>
    </>
  );
}

export function Memberships() {
  const resource = useResource("/me/memberships");
  const labels = {
    EN_ATTENTE: "En attente",
    ACCEPTE: "Membre",
    REFUSE: "Refusée",
  };
  return (
    <>
      <header className="page-heading row">
        <div>
          <h1>Mes adhésions</h1>
          <p>Suivez vos demandes et retrouvez la communauté de vos clubs.</p>
        </div>
        <a className="button primary" href="#/clubs">
          <Icon name="plus" size={16} /> Découvrir les clubs
        </a>
      </header>
      <ResourceState resource={resource}>
        <div className="grid">
          {resource.data?.map((membership) => (
            <article className="card membership-card" key={membership.id}>
              <span className="club-monogram">
                <Icon name="users" size={25} />
              </span>
              <h2>
                {membership.statutActif ? (
                  <a href={`#/clubs/${membership.clubId}`}>
                    {membership.nomClub}
                  </a>
                ) : (
                  membership.nomClub
                )}
              </h2>
              <Badge>{labels[membership.statut]}</Badge>
              <p>Demande du {dateTime(membership.dateDemande)}</p>
            </article>
          ))}
        </div>
        {resource.data?.length === 0 && (
          <p className="empty">
            Aucune demande d’adhésion. <a href="#/clubs">Découvrir les clubs</a>
          </p>
        )}
      </ResourceState>
    </>
  );
}

export function Planning({ registrationsOnly = false }) {
  const resource = useResource("/me/registrations");
  const [period, setPeriod] = useState(registrationsOnly ? "all" : "upcoming");
  const rows = (resource.data || [])
    .filter(
      (r) =>
        period === "all" ||
        (period === "past" ? r.evenement.passe : !r.evenement.passe),
    )
    .sort(
      (a, b) =>
        new Date(a.evenement.dateHeureDebut) -
        new Date(b.evenement.dateHeureDebut),
    );
  return (
    <>
      <header className="page-heading row">
        <div>
          <h1>{registrationsOnly ? "Mes inscriptions" : "Mon planning"}</h1>
          <p>
            {registrationsOnly
              ? "Retrouvez vos réservations et gérez vos inscriptions."
              : "Gardez un œil sur les prochains rendez-vous de votre campus."}
          </p>
        </div>
        <a className="button" href="#/events">
          <Icon name="calendar" size={16} /> Explorer les événements
        </a>
      </header>
      <div className="category-tabs" aria-label="Période des inscriptions">
        {[
          ["upcoming", "À venir"],
          ["past", "Passés"],
          ["all", "Toutes"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={period === key ? "selected" : ""}
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <ResourceState resource={resource}>
        <div className="registration-list">
          {rows.map((registration) => {
            const event = registration.evenement;
            return (
              <article className="card registration-card" key={registration.id}>
                <div className="registration-art">
                  <Artwork category={event.categorie} title={event.titre} organizer={event.organisateur} />
                </div>
                <div className="registration-content">
                  <div className="row">
                    <Badge>
                      {registration.statut === "CONFIRMEE"
                        ? event.passe
                          ? "Terminée"
                          : "Confirmée"
                        : "Annulée"}
                    </Badge>
                    <small>{event.categorie}</small>
                  </div>
                  <h2>
                    {event.statut === "PUBLIE" ? (
                      <a href={"#/events/" + registration.evenementId}>
                        {event.titre}
                      </a>
                    ) : (
                      event.titre
                    )}
                  </h2>
                  <p className="icon-line">
                    <Icon name="clock" size={16} />
                    {dateTime(event.dateHeureDebut, event.dateHeureDebutCampus)}
                  </p>
                  <p className="icon-line">
                    <Icon name="pin" size={16} />
                    {event.lieu}
                  </p>
                  {event.statut === "ANNULE" && (
                    <p className="status-note">
                      Événement annulé par l’organisation.
                    </p>
                  )}
                  {event.statut === "SUSPENDU" && (
                    <p className="status-note">
                      Événement temporairement suspendu. Votre inscription est
                      conservée.
                    </p>
                  )}
                  {registration.statut === "CONFIRMEE" && (
                    <Action
                      onClick={async () => {
                        await api("/me/registrations/" + registration.id, {
                          method: "DELETE",
                        });
                        resource.reload();
                      }}
                    >
                      Annuler mon inscription
                    </Action>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {rows.length === 0 && (
          <div className="empty">
            <Icon name="calendar" size={32} />
            <h3>Aucune inscription dans cette période</h3>
            <p>Découvrez les événements du campus et réservez votre place.</p>
            <a href="#/events" className="text-link">
              Parcourir les événements <Icon name="arrow" size={16} />
            </a>
          </div>
        )}
      </ResourceState>
    </>
  );
}
