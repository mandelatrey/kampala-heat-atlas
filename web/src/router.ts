import { useEffect, useState } from "react";

// Hash routes (#/site-weather/kampala) work on GitHub Pages without any server rewrites.
export type Route =
  | { page: "atlas"; section?: string }
  | { page: "sites" }
  | { page: "site"; slug: string }
  | { page: "missing"; path: string };

const NAME = /^[a-z0-9-]+$/;

export function parseRoute(hash: string): Route {
  const [first, second, ...rest] = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (rest.length === 0) {
    if (first === undefined) return { page: "atlas" };
    if (first === "atlas") return second === undefined ? { page: "atlas" } : NAME.test(second) ? { page: "atlas", section: second } : { page: "missing", path: hash };
    if (first === "site-weather") return second === undefined ? { page: "sites" } : NAME.test(second) ? { page: "site", slug: second } : { page: "missing", path: hash };
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
