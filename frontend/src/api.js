export async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...options.headers };

  if (method !== "GET") {
    const response = await fetch("/api/v1/auth/csrf", {
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new Error("Impossible de sécuriser la requête. Réessayez.");
    headers["X-XSRF-TOKEN"] = (await response.json()).token;
  }

  let body = options.body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    method,
    headers,
    body,
    credentials: "same-origin",
  });
  if (response.status === 204 || response.status === 202) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("campus360:session-expired"));
    const message =
      data.errors?.join(" · ") ||
      data.detail ||
      (response.status === 401
        ? "Connectez-vous pour continuer."
        : "Cette action est indisponible.");
    throw new Error(message);
  }
  return data;
}

export function navigate(path) {
  window.location.hash = path;
  window.scrollTo(0, 0);
}

export async function uploadImage(file, currentUrl = "") {
  if (!file || file.size === 0) return currentUrl;
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Choisissez une image de 2 Mo maximum.");
  const form = new FormData();
  form.append("image", file);
  return (await api("/media", { method: "POST", body: form })).url;
}

export function dateTime(value, campusDateTime) {
  return new Intl.DateTimeFormat("fr-MA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: campusDateTime ? "UTC" : "Africa/Casablanca",
  }).format(new Date(campusDateTime ? `${campusDateTime}Z` : value));
}

export function localDateTime(value) {
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
