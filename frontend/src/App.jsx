import { useEffect, useState } from "react";
import { api } from "./api.js";
import { useLocation } from "./hooks.js";
import { Layout } from "./ui/Layout.jsx";
import { AuthLayout } from "./ui/AuthLayout.jsx";
import { Home } from "./pages/Home.jsx";
import { EventCreation } from "./pages/EventWizard.jsx";
import { OrganizerDashboard } from "./pages/OrganizerDashboard.jsx";
import {
  Catalogue,
  ClubDetail,
  ClubDirectory,
  EventDetail,
} from "./pages/PublicPages.jsx";
import {
  AuthPage,
  Memberships,
  Planning,
  StudentProfile,
} from "./pages/AccountPages.jsx";
import {
  Accounts,
  AdminClubs,
  ManagedEvents,
  Members,
} from "./pages/ManagementPages.jsx";
import "./App.css";
import "./ui/Premium.css";

export default function App() {
  const location = useLocation();
  const path = location.split("?")[0];
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    let active = true;
    api("/me").then(
      (account) => {
        if (active) setUser(account);
      },
      () => {
        if (active) setUser(null);
      },
    );
    const expire = () => setUser(null);
    window.addEventListener("campus360:session-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("campus360:session-expired", expire);
    };
  }, [path]);

  const student = user?.role === "ETUDIANT";
  const admin = user?.role === "ADMINISTRATEUR";
  const manager =
    student && user.clubs.some((club) => club.roleDansClub === "RESPONSABLE");
  const organizer = manager || user?.role === "ANNONCEUR";
  const detail = path.match(/^\/(events|clubs)\/([0-9a-f-]{36})$/i);
  const publicPage = ["/home", "/", "/events", "/clubs"].includes(path) || detail;
  const authMode = ["/login", "/register", "/verify"].includes(path)
    ? path.slice(1)
    : null;

  if (authMode || (user === null && !publicPage))
    return (
      <AuthPage
        mode={authMode || "login"}
        onAuthenticated={setUser}
        returnTo={authMode ? undefined : path}
      />
    );

  if (!publicPage && user === undefined)
    return (
      <AuthLayout>
        <p role="status">Chargement du compte…</p>
      </AuthLayout>
    );

  function page() {
    if (path === "/home" || path === "/") return <Home />;
    if (path === "/events") return <Catalogue key={location} />;
    if (path === "/clubs") return <ClubDirectory />;
    if (detail)
      return detail[1] === "events" ? (
        <EventDetail key={detail[2]} id={detail[2]} user={user} />
      ) : (
        <ClubDetail key={detail[2]} id={detail[2]} user={user} />
      );
    if (user === undefined) return <p role="status">Chargement du compte…</p>;
    if ((path === "/planning" || path === "/registrations") && student)
      return (
        <Planning key={path} registrationsOnly={path === "/registrations"} />
      );
    if (path === "/memberships" && student) return <Memberships />;
    if (path === "/profile" && student)
      return <StudentProfile user={user} onChanged={setUser} />;
    if (path === "/manage" && organizer)
      return <OrganizerDashboard user={user} />;
    if (path === "/manage/events/new" && organizer)
      return <EventCreation user={user} />;
    if (path === "/manage/events" && organizer)
      return <ManagedEvents key={location} user={user} />;
    if (path === "/manage/members" && manager) return <Members user={user} />;
    if (path === "/admin/events" && admin)
      return <ManagedEvents user={user} admin />;
    if (path === "/admin/clubs" && admin) return <AdminClubs />;
    if (path === "/admin/users" && admin) return <Accounts />;
    return (
      <>
        <h1>Page indisponible</h1>
        <p>
          Cette page est introuvable ou votre compte ne dispose pas des droits
          nécessaires.
        </p>
        <a href="#/events">Retour aux événements</a>
      </>
    );
  }

  return (
    <Layout user={user} path={path} onLogout={() => setUser(null)}>
      {page()}
    </Layout>
  );
}
