import { lazy, Suspense } from "react";
import { AtlasPage } from "./atlas/AtlasPage";
import { Shell } from "./components/Shell";
import { useRoute } from "./router";
import { SiteList } from "./sites/SiteList";
import { SitePage } from "./sites/SitePage";

// deck.gl is large: load the 3D viewer only when someone opens it
const Viewer3D = lazy(() => import("./viewer3d/Viewer3D").then((m) => ({ default: m.Viewer3D })));

export function App() {
  const route = useRoute();
  return (
    <Shell route={route}>
      {route.page === "atlas" && <AtlasPage section={route.section} />}
      {route.page === "3d" && <Suspense fallback={<p className="state">Loading the 3D model…</p>}><Viewer3D /></Suspense>}
      {route.page === "sites" && <SiteList />}
      {route.page === "site" && <SitePage key={route.slug} slug={route.slug} />}
      {route.page === "missing" && (
        <div className="page">
          <h1>Page not found</h1>
          <p className="chips"><a className="btn" href="#/atlas">The atlas</a><a className="btn" href="#/site-weather">Site weather</a></p>
        </div>
      )}
    </Shell>
  );
}
