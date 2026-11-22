import { useEffect, useRef } from "react";
import { Icon } from "./Icons.jsx";
import logo from "../assets/branding/campus360-logo.png";
import "./Auth.css";

export function AuthLayout({ children }) {
  const main = useRef(null);
  const form = useRef(null);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main
      ref={main}
      className="auth-layout"
      aria-label="Authentification Campus360"
      tabIndex={-1}
    >
      <div className="auth-atmosphere" aria-hidden="true">
        <i />
        <i />
      </div>
      <a
        className="skip-link"
        href="#auth-form"
        onClick={(event) => {
          event.preventDefault();
          form.current?.focus();
        }}
      >
        Aller au formulaire
      </a>
      <div className="auth-form-header">
        <a className="auth-home-link" href="#/home">
          <Icon name="back" size={17} /> Retour à l’accueil
        </a>
        <span className="auth-university">UNIVERSITÉ SULTAN MOULAY SLIMANE</span>
      </div>
      <aside className="auth-intro" aria-label="Bienvenue sur Campus360">
        <div className="auth-logo-stage">
          <div className="auth-logo-halo" aria-hidden="true" />
          <svg
            className="auth-orbits"
            viewBox="0 0 400 300"
            fill="none"
            aria-hidden="true"
          >
            <ellipse cx="200" cy="150" rx="183" ry="107" />
            <ellipse cx="200" cy="150" rx="162" ry="135" transform="rotate(-24 200 150)" />
            <circle cx="383" cy="150" r="3" />
            <circle cx="68" cy="85" r="2.5" />
          </svg>
          <a className="auth-brand" href="#/home">
            <img src={logo} alt="Campus360 — Accueil" />
          </a>
          <span className="auth-logo-shadow" aria-hidden="true" />
        </div>
        <div className="auth-welcome-copy">
          <h2>
            <span>Votre campus.</span>
            <span>Votre univers.</span>
          </h2>
          <span className="auth-heading-accent" aria-hidden="true" />
          <p>
            Explorez les événements, rejoignez les clubs et vivez pleinement votre
            expérience universitaire.
          </p>
          <div className="auth-promise">
            <Icon name="shield" size={17} />
            <span>Votre communauté universitaire, au même endroit.</span>
          </div>
        </div>
      </aside>
      <div className="auth-form-panel">
        <div ref={form} id="auth-form" className="auth-form-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </main>
  );
}
