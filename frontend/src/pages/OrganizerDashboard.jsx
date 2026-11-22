import { useResource } from "../hooks.js";
import { ResourceState, Badge } from "../components.jsx";
import { Artwork } from "../ui/Artwork.jsx";
import { Icon } from "../ui/Icons.jsx";
import { eventDate } from "../ui/presentation.js";

export function OrganizerDashboard({ user }) {
  const resource = useResource("/managed/events");
  const events = resource.data || [];
  const recent = events
    .filter((event) => event.statut !== "ANNULE" && !event.passe)
    .sort((a, b) => new Date(a.dateHeureDebut) - new Date(b.dateHeureDebut))
    .slice(0, 5);
  return (
    <>
      <header className="page-heading row dashboard-heading">
        <div>
          <h1>Tableau de bord – Organisateur</h1>
          <p>
            <strong>Bonjour, {user.prenom} !</strong>
            <br />
            Gérez vos événements et animez la vie de votre campus.
          </p>
        </div>
        <a className="button primary" href="#/manage/events/new">
          <Icon name="plus" size={18} /> Créer un événement
        </a>
      </header>
      <ResourceState resource={resource}>
        <div className="event-counters">
          {[
            ["PUBLIE", "Événements publiés", "calendar"],
            ["BROUILLON", "Brouillons à préparer", "edit"],
            ["SUSPENDU", "Événements suspendus", "shield"],
          ].map(([status, label, icon]) => (
            <div className="counter-card" key={status}>
              <span className="counter-icon">
                <Icon name={icon} size={27} />
              </span>
              <div>
                <strong>
                  {events.filter((e) => e.statut === status).length}
                </strong>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
        <header className="section-heading">
          <h2>Mes événements à venir</h2>
          <a className="text-link" href="#/manage/events">
            Voir tout <Icon name="arrow" size={16} />
          </a>
        </header>
        {recent.length > 0 ? (
          <div className="table-wrap organizer-table">
            <table>
              <caption className="sr-only">
                Événements organisés et inscriptions confirmées
              </caption>
              <thead className="sr-only">
                <tr>
                  <th>Événement</th>
                  <th>Date</th>
                  <th>Inscriptions</th>
                  <th>Statut</th>
                  <th>Gestion</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="event-table-title">
                        <div className="event-thumbnail">
                          <Artwork category={e.categorie} title={e.titre} organizer={e.organisateur} />
                        </div>
                        <strong>{e.titre}</strong>
                      </div>
                    </td>
                    <td>{eventDate(e)}</td>
                    <td>
                      {e.capaciteMax - e.placesRestantes} inscrit
                      {e.capaciteMax - e.placesRestantes > 1 ? "s" : ""}
                    </td>
                    <td>
                      <Badge>{e.statut}</Badge>
                    </td>
                    <td>
                      <a
                        className="button compact"
                        href={`#/manage/events?edit=${e.id}`}
                        aria-label={`Gérer ${e.titre}`}
                      >
                        <Icon name="edit" size={16} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <Icon name="calendar" size={32} />
            <h3>Votre prochain événement commence ici</h3>
            <p>Créez un brouillon, puis publiez-le lorsque tout est prêt.</p>
            <a className="button primary" href="#/manage/events/new">
              Créer un événement
            </a>
          </div>
        )}
      </ResourceState>
    </>
  );
}
