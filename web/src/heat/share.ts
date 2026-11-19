// The heat advisory as something to pass on: a WhatsApp-ready message and a 1080 x 1350 image card.
import type { HeatAdvisory } from "../types";

/** Level colours: background and text, from Low to Extreme. Also used by heat.css (keep in step). */
export const LEVEL_COLOURS: [bg: string, ink: string][] = [
  ["#2f8f3a", "#ffffff"], ["#e0a526", "#1b1b1f"], ["#eb6834", "#ffffff"], ["#c23434", "#ffffff"], ["#6b1d5c", "#ffffff"],
];

const ICON: Record<HeatAdvisory["advice"][number]["key"], string> = { workers: "👷", vendors: "🛒", children: "🏫", elderly: "👵" };

/** "12-15 h, 16-18 h" -> "12:00 to 18:00" */
export function hoursText(window: string): string {
  const all = [...window.matchAll(/(\d{2})-(\d{2}) h/g)];
  if (!all.length) return "";
  return `${all[0]![1]}:00 to ${all[all.length - 1]![2]}:00`;
}

export const SIGNS =
  "Signs of heat illness: dizziness, headache, feeling sick, confusion, very hot skin. Move the person into the shade, cool them with water, give sips of water if they are awake, and get medical help.";

/** The message to paste into WhatsApp or send by SMS, for today or a later day. */
export function shareText(h: HeatAdvisory, place: string, day: string, url: string, today = true): string {
  const lines = [today ? `🌡️ Heat today in ${place} (${day})` : `🌡️ Heat forecast for ${place}, ${day}`];
  if (h.level === 0) {
    lines.push("Low heat stress: a normal day. Drink water and use shade at midday.");
  } else {
    lines.push(`${h.name.toUpperCase()} heat ${hoursText(h.window)}${h.peak_wbgt !== null ? ` (heat stress up to ${Math.round(h.peak_wbgt)} °C WBGT)` : ""}.`, "");
    for (const a of h.advice) lines.push(`${ICON[a.key]} ${a.who}: ${a.text}`);
    lines.push("", SIGNS);
  }
  lines.push("", `Advice from a weather forecast, not an official warning. More: ${url}`);
  return lines.join("\n");
}

/** First sentence of an advice text, for the image card. */
export const firstSentence = (s: string) => (/^.*?[.;:](?=\s|$)/.exec(s)?.[0] ?? s).replace(/[;:]$/, ".");

/** Split text into lines that fit `width` px with the context's current font. */
export function wrap(measure: (s: string) => number, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** Draw the advisory as a 1080 x 1350 card (a WhatsApp or social post) and return it as a PNG. */
export async function cardImage(h: HeatAdvisory, place: string, day: string, site: string, today = true): Promise<Blob> {
  const W = 1080, H = 1350, P = 72;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("no canvas");
  const [bg, ink] = LEVEL_COLOURS[h.level]!;
  const font = (w: number, px: number) => `${w} ${px}px "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = "#fbfaf7";
  g.fillRect(0, 0, W, H);
  // band with the level
  g.fillStyle = bg;
  g.fillRect(0, 0, W, 520);
  g.fillStyle = ink;
  g.font = font(600, 34);
  g.fillText(`${today ? "HEAT TODAY" : "HEAT FORECAST"} · ${place.toUpperCase()}`, P, 104);
  g.font = font(400, 32);
  g.fillText(day, P, 150);
  g.font = font(800, h.name.length > 8 ? 150 : 180);
  g.fillText(h.name, P - 6, 340);
  g.font = font(500, 40);
  g.fillText(h.level === 0 ? "A normal day" : `${hoursText(h.window)}${h.peak_wbgt !== null ? ` · up to ${Math.round(h.peak_wbgt)} °C WBGT` : ""}`, P, 430);
  // the day, hour by hour
  const cells = h.hours, cw = (W - 2 * P) / Math.max(1, cells.length);
  cells.forEach(([hour, lv], i) => {
    g.fillStyle = LEVEL_COLOURS[lv]![0];
    g.fillRect(P + i * cw + 3, 570, cw - 6, 54);
    if (hour % 3 === 0) {
      g.fillStyle = "#55555a";
      g.font = font(500, 26);
      g.fillText(`${String(hour).padStart(2, "0")}`, P + i * cw + 6, 662);
    }
  });
  // what to do
  let y = 740;
  const items = h.level === 0 ? [{ who: "Everyone", text: "Drink water and use shade at midday." }] : h.advice.map((a) => ({ who: a.who, text: firstSentence(a.text) }));
  // four groups of at most two lines each fit above the footer (last line by about y = 1230)
  for (const a of items) {
    g.fillStyle = "#1b1b1f";
    g.font = font(700, 30);
    g.fillText(a.who, P, y);
    g.font = font(400, 30);
    g.fillStyle = "#3a3a3e";
    for (const line of wrap((s) => g.measureText(s).width, a.text, W - 2 * P).slice(0, 2)) {
      y += 39;
      g.fillText(line, P, y);
    }
    y += 54;
  }
  g.fillStyle = "#e1e0d9";
  g.fillRect(P, H - 112, W - 2 * P, 2);
  g.fillStyle = "#55555a";
  g.font = font(400, 25);
  g.fillText("Forecast advice, not an official warning.", P, H - 70);
  g.fillText(site, P, H - 34);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("could not draw the card"))), "image/png"));
}
