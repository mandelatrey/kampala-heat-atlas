import { AtlasPage } from "./atlas/AtlasPage";
import { Shell } from "./components/Shell";
import { useRoute } from "./router";
import { SiteList } from "./sites/SiteList";
import { SitePage } from "./sites/SitePage";

export function App() {
  const route = useRoute();
  return (
    <Shell route={route}>
      {route.page === "atlas" && <AtlasPage section={route.section} />}
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
