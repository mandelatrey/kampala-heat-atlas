import { useEffect, useState } from "react";

// Hash routes (#/site-weather/kampala) work on GitHub Pages without any server rewrites.
export type Route = { page: "sites" } | { page: "site"; slug: string } | { page: "missing"; path: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "site-weather")) return { page: "sites" };
  if (parts.length === 2 && parts[0] === "site-weather" && /^[a-z0-9-]+$/.test(parts[1] ?? "")) {
    return { page: "site", slug: parts[1] ?? "" };
  }
  return { page: "missing", path: hash };
}

export const siteHref = (slug: string) => `#/site-weather/${slug}`;

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
