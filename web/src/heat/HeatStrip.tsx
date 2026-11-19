// One line on the atlas home page: today's heat level in Kampala, linking to the full advisory.
import { Icon } from "../components/ui";
import { useSite } from "../data";
import { DEFAULT_TOWN } from "./HeatPage";
import { hoursText } from "./share";

export function HeatStrip() {
  const site = useSite(DEFAULT_TOWN);
  const h = site.state === "ready" ? site.data.briefing.days[0]?.heat : undefined;
  if (!h) return null;                                  // no advisory yet (older briefing) or not loaded: say nothing
  return (
    <a className={`heat-strip lv-${h.level}`} href={`#/heat/${DEFAULT_TOWN}`}>
      <span className="eyebrow">Heat today · Kampala</span>
      <span className="pill-lv">{h.name}</span>
      <span className="txt">{h.level > 0 ? `${hoursText(h.window)}. ` : ""}What to do, and a message to share</span>
      <Icon.arrowRight />
    </a>
  );
}
