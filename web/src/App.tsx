import type { ReactNode } from "react";
import { AtlasPage } from "./atlas/AtlasPage";
import { SiteList } from "./components/SiteList";
import { SiteNav } from "./components/SiteNav";
import { SitePage } from "./components/SitePage";
import { useRoute } from "./router";

/** Frame of the site-weather pages: nav, page, disclaimer. */
function SiteWeather({ children }: { children: ReactNode }) {
  return (
    <div className="sw-page">
      <main>
        <SiteNav current="site-weather" />
        {children}
        <p className="lede" style={{ fontSize: 13 }}>
          Screening guidance from a weather forecast, not an instruction. The contract specification, crane manufacturer's
          limits and site health-and-safety plan take precedence. Forecast and ERA5 data: Open-Meteo (open-meteo.com, CC BY 4.0).
        </p>
        <p className="byline">By Gava Charles · <span>Kampala Heat Atlas</span></p>
      </main>
    </div>
  );
}

export function App() {
  const route = useRoute();
  switch (route.page) {
    case "atlas":
      return <AtlasPage section={route.section} />;
    case "sites":
      return <SiteWeather><SiteList /></SiteWeather>;
    case "site":
      return <SiteWeather><SitePage key={route.slug} slug={route.slug} /></SiteWeather>;
    case "missing":
      return (
        <SiteWeather>
          <section>
            <h1>Page not found</h1>
            <p className="lede"><a href="#/atlas">The atlas</a> · <a href="#/site-weather">Site weather</a></p>
          </section>
        </SiteWeather>
      );
  }
}
