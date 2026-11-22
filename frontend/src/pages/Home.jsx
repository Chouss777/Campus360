import { useState } from "react";
import { useResource } from "../hooks.js";
import { ClubCard, EventList, ResourceState } from "../components.jsx";
import facultyImage from "../assets/visuals/faculty-campus.jpg";
import { Icon } from "../ui/Icons.jsx";

export function Home() {
  const resource = useResource("/events");
  const clubs = useResource("/clubs");
  const [category, setCategory] = useState("");
  const upcoming = (resource.data || [])
    .filter((e) => !e.passe)
    .sort((a, b) => new Date(a.dateHeureDebut) - new Date(b.dateHeureDebut));
  const categories = [...new Set(upcoming.map((e) => e.categorie))].slice(0, 3);
  return (
    <>
      <section className="campus-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <Icon name="spark" size={12} /> CAMPUS360 · VOTRE CAMPUS, VOS
            ÉVÉNEMENTS
          </p>
          <h1 id="hero-title">
            Vivez pleinement
            <br />
            la vie de votre campus.
          </h1>
          <p>
            Conférences, ateliers et activités associatives.
            <br />
            Découvrez les événements qui vous ressemblent.
          </p>
          <a className="button hero-button" href="#/events">
            Explorer les événements <Icon name="arrow" size={16} />
          </a>
        </div>
        <img
          className="artwork faculty-photo"
          src={facultyImage}
          alt="Vue de la Faculté Polydisciplinaire de Khouribga"
          fetchPriority="high"
        />
      </section>
      <section aria-labelledby="upcoming-title">
        <header className="section-heading">
          <div>
            <h2 id="upcoming-title">Événements à venir</h2>
            <p>Découvrez les rendez-vous incontournables de votre campus.</p>
          </div>
          <a className="text-link" href="#/events">
            Voir tous les événements <Icon name="arrow" size={16} />
          </a>
        </header>
        <div className="category-tabs" aria-label="Catégories d’événements">
          {["", ...categories].map((c) => (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c || "Tous"}
            </button>
          ))}
        </div>
        <ResourceState resource={resource}>
          <EventList
            events={upcoming
              .filter((e) => !category || e.categorie === category)
              .slice(0, 3)}
          />
        </ResourceState>
      </section>
      <section className="home-clubs" aria-labelledby="home-clubs-title">
        <header className="section-heading">
          <div>
            <h2 id="home-clubs-title">Découvrez nos clubs</h2>
            <p>Des passions à partager, une communauté à rencontrer.</p>
          </div>
          <a className="text-link" href="#/clubs">
            Voir tous les clubs <Icon name="arrow" size={16} />
          </a>
        </header>
        <ResourceState resource={clubs} loadingLabel="Chargement des clubs…" errorLabel="Impossible de charger les clubs.">
          {clubs.data?.length ? (
            <div className="grid home-club-grid">
              {clubs.data.slice(0, 4).map((club) => (
                <ClubCard key={club.id} club={club} heading="h3" />
              ))}
            </div>
          ) : <p className="empty">Aucun club actif pour le moment.</p>}
        </ResourceState>
      </section>
    </>
  );
}
