import { useEffect, useRef, useState } from "react";
import { api, navigate } from "../api.js";
import { Action } from "../components.jsx";
import { Icon } from "./Icons.jsx";
import logo from "../assets/branding/campus360-logo.png";
import { revealSurface } from "./motion.js";

export function Layout({ user, path, onLogout, children }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width:900px)").matches,
  );
  const menu = useRef(null);
  const trigger = useRef(null);
  const accountMenu = useRef(null);
  function closeNavigation() {
    setOpen(false);
    if (mobile)
      requestAnimationFrame(() =>
        document.getElementById("main-content")?.focus(),
      );
  }
  useEffect(() => {
    const content = document.getElementById("main-content");
    content?.focus({ preventScroll: true });
    const entrance = revealSurface(content);
    return () => entrance?.cancel();
  }, [path]);
  const student = user?.role === "ETUDIANT";
  const manager =
    student && user.clubs.some((c) => c.roleDansClub === "RESPONSABLE");
  const organizer = manager || user?.role === "ANNONCEUR";
  const admin = user?.role === "ADMINISTRATEUR";
  const organizing =
    organizer && (path.startsWith("/manage") || user?.role === "ANNONCEUR");
  const administering = admin && path.startsWith("/admin");
  useEffect(() => {
    const media = window.matchMedia("(max-width:900px)");
    const update = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const campusLinks = [
    ["/home", "Accueil", "home"],
    ["/events", "Événements", "calendar"],
    ["/clubs", "Clubs universitaires", "users"],
  ];
  const links = administering
    ? [
        ["/admin/events", "Modération des événements", "shield"],
        ["/admin/clubs", "Gestion des clubs", "users"],
        ["/admin/users", "Comptes et rôles", "user"],
        ...campusLinks,
      ]
    : organizing
      ? [
          ["/manage", "Tableau de bord", "grid"],
          ["/manage/events", "Mes événements", "calendar"],
          ["/manage/events/new", "Créer un événement", "plus"],
          ...(manager
            ? [["/manage/members", "Adhésions et membres", "users"]]
            : []),
          ...campusLinks,
        ]
      : [
          ...campusLinks,
          ...(student
            ? [
                ["/planning", "Mon planning", "calendar"],
                ["/registrations", "Mes inscriptions", "check"],
                ["/memberships", "Mes adhésions", "users"],
                ["/profile", "Profil", "user"],
              ]
            : []),
          ...(organizer ? [["/manage", "Espace organisateur", "grid"]] : []),
          ...(admin ? [["/admin/events", "Administration", "shield"]] : []),
        ];
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = menu.current?.querySelector("button, a");
    first?.focus();
    function keydown(e) {
      if (e.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => trigger.current?.focus());
      }
      if (e.key === "Tab") {
        const nodes = [...menu.current.querySelectorAll("button, a")];
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", keydown);
    };
  }, [open]);
  const initials = user
    ? `${user.prenom?.[0] || ""}${user.nom?.[0] || ""}`
    : "";
  function rememberPublicDetail() {
    if (/^\/(events|clubs)\/[0-9a-f-]{36}$/i.test(path)) {
      sessionStorage.setItem("campus360:returnTo", path);
    }
  }
  return (
    <div
      className={`app-layout ${!user ? "guest-layout" : ""} ${organizing ? "organizer-layout" : ""} ${administering ? "admin-layout" : ""} ${path === "/home" ? "home-layout" : ""}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content").focus();
        }}
      >
        Aller au contenu
      </a>
      {open && (
        <button
          className="menu-backdrop"
          aria-label="Fermer le menu"
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
          tabIndex={-1}
        />
      )}
      <aside
        ref={menu}
        className={`sidebar ${open ? "is-open" : ""}`}
        aria-label="Menu Campus360"
        inert={mobile && !open ? true : undefined}
        aria-hidden={mobile && !open ? true : undefined}
      >
        <button
          className="mobile-close icon-button"
          onClick={() => {
            setOpen(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
          aria-label="Fermer le menu"
        >
          <Icon name="close" />
        </button>
        <a className="brand" href="#/home" onClick={closeNavigation}>
          <img src={logo} alt="Campus360 — La plateforme de la vie étudiante" />
        </a>
        <p className="nav-label">
          {organizing
            ? "ESPACE ORGANISATEUR"
            : admin
              ? "CAMPUS360 · USMS"
              : "MENU PRINCIPAL"}
        </p>
        <nav aria-label="Navigation principale">
          {links.map(([href, label, icon]) => {
            const active =
              href === path ||
              (href === "/events" && path.startsWith("/events/")) ||
              (href === "/clubs" && path.startsWith("/clubs/"));
            return (
              <a
                key={href}
                href={`#${href}`}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                onClick={closeNavigation}
              >
                <Icon name={icon} />
                <span>{label}</span>
              </a>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <strong>
            {organizing
              ? "Campus360 · Organisateur"
              : "Votre campus, en un seul endroit"}
          </strong>
          <p>
            {organizing
              ? "Préparez vos événements et animez la vie du campus."
              : "Retrouvez vos activités, vos clubs et vos inscriptions."}
          </p>
          <a href="#/events" onClick={closeNavigation}>
            Explorer le campus <Icon name="arrow" size={14} />
          </a>
        </div>
      </aside>
      <div className="workspace" inert={open ? true : undefined}>
        <header className="topbar">
          <button
            ref={trigger}
            className="mobile-menu icon-button"
            aria-label="Ouvrir le menu"
            aria-expanded={open}
            onClick={() => {
              accountMenu.current?.removeAttribute("open");
              setOpen(true);
            }}
          >
            <Icon name="menu" />
          </button>
          {path === "/home" && (
            <div className="greeting">
              <strong>
                {user ? `Bonjour, ${user.prenom}` : "Bienvenue sur Campus360"}{" "}
                <span aria-hidden="true">👋</span>
              </strong>
              <span>
                {user
                  ? "Explorez ce qui se passe sur votre campus."
                  : "Découvrez la vie étudiante à l'USMS."}
              </span>
            </div>
          )}
          <form
            className="global-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q").trim();
              navigate(`/events${q ? `?q=${encodeURIComponent(q)}` : ""}`);
            }}
          >
            <Icon name="search" size={18} />
            <input
              name="q"
              aria-label="Rechercher un événement"
              placeholder="Rechercher un événement…"
              type="search"
            />
            <button type="submit" className="sr-only">
              Rechercher
            </button>
          </form>
          {user ? (
            <details
              ref={accountMenu}
              className="account-menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.currentTarget.removeAttribute("open");
                  e.currentTarget.querySelector("summary").focus();
                }
              }}
            >
              <summary aria-label={`Compte de ${user.prenom} ${user.nom}`}>
                <span className="avatar">
                  {user.profile?.photoProfil ? (
                    <img src={user.profile.photoProfil} alt="" />
                  ) : (
                    initials
                  )}
                </span>
              </summary>
              <div className="account-popover">
                <strong>
                  {user.prenom} {user.nom}
                </strong>
                <small>{user.email}</small>
                {student && (
                  <a
                    href="#/profile"
                    onClick={(e) =>
                      e.currentTarget.closest("details").removeAttribute("open")
                    }
                  >
                    Mon profil
                  </a>
                )}
                <Action
                  onClick={async () => {
                    await api("/auth/session", { method: "DELETE" });
                    onLogout();
                    navigate("/home");
                  }}
                >
                  <Icon name="logout" size={16} /> Se déconnecter
                </Action>
              </div>
            </details>
          ) : (
            <nav className="guest-actions" aria-label="Accès au compte">
              <a className="button primary login-link" href="#/login" onClick={rememberPublicDetail}>
                Se connecter
              </a>
              <a className="button register-link" href="#/register" onClick={rememberPublicDetail}>
                Créer un compte
              </a>
            </nav>
          )}
        </header>
        <main id="main-content" data-page={path} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
