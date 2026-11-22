import { useId, useState } from "react";
import { Icon } from "./Icons.jsx";

export function AuthField({ label, name, type = "text", icon, ...props }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  return (
    <div className="field auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-wrap">
        {icon && <Icon name={icon} size={18} />}
        <input
          id={id}
          name={name}
          type={password && visible ? "text" : type}
          {...props}
        />
        {password && (
          <button
            className="password-toggle"
            type="button"
            aria-label={
              visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
            }
            aria-pressed={visible}
            aria-controls={id}
            onClick={() => setVisible((current) => !current)}
          >
            <Icon name={visible ? "eyeOff" : "eye"} size={19} />
          </button>
        )}
      </div>
    </div>
  );
}
