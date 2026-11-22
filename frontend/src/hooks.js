import { useEffect, useState } from "react";
import { api } from "./api.js";

export function useResource(path) {
  const [result, setResult] = useState({
    path: null,
    revision: -1,
    data: null,
    error: "",
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!path) return;
    let active = true;
    api(path).then(
      (data) => {
        if (active) setResult({ path, revision, data, error: "" });
      },
      (error) => {
        if (active)
          setResult({ path, revision, data: null, error: error.message });
      },
    );
    return () => {
      active = false;
    };
  }, [path, revision]);

  const current = result.path === path && result.revision === revision;
  return {
    data: current ? result.data : null,
    error: current ? result.error : "",
    loading: Boolean(path) && !current,
    reload: () => setRevision((value) => value + 1),
  };
}

export function useLocation() {
  const [location, setLocation] = useState(
    window.location.hash.slice(1) || "/home",
  );
  useEffect(() => {
    const update = () => setLocation(window.location.hash.slice(1) || "/home");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return location;
}
