import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { DataSource, EngineOptions, LatLon, MapEngine } from "./mapEngine";

// The map for browsers without WebGL: Leaflet over Esri's grey canvas raster tiles (no key), which come as a base
// without names and the names alone, so the names sit on top of the research layer as in the WebGL map.
const TILES = (dark: boolean, part: "Base" | "Reference") =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? "Dark" : "Light"}_Gray_${part}/MapServer/tile/{z}/{y}/{x}`;
const ATTRIBUTION = "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community";
const HINT_BLOCKED = "An ad or privacy blocker, or the network, may be stopping server.arcgisonline.com.";
const NATIVE_MAX = 16;                   // the canvas maps have detail to about here; beyond, tiles are enlarged
// Leaflet counts zoom in 256 px tiles, MapLibre in 512 px ones: the same view is one level higher here
const ZOOM_OFFSET = 1;

/** Leaflet over raster tiles: works in any browser, WebGL or not. */
export function createLeaflet(el: HTMLElement, opts: EngineOptions): MapEngine {
  const [[s, w], [n, e]] = opts.bounds;
  const pad = 0.3 * Math.max(n - s, e - w);
  const bounds = L.latLngBounds([s, w], [n, e]);
  // on a touch screen one finger scrolls the page and two move the map (pinch), as in the WebGL map
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const m = L.map(el, {
    minZoom: 8 + ZOOM_OFFSET, maxZoom: 17.5 + ZOOM_OFFSET, zoomSnap: 0.25, zoomDelta: 0.5,
    maxBounds: L.latLngBounds([s - pad, w - pad], [n + pad, e + pad]),
    zoomControl: false, attributionControl: false,
    dragging: !touch,
    scrollWheelZoom: false,          // page scroll stays page scroll; Ctrl + scroll zooms (below)
  });
  m.fitBounds(bounds, { padding: [16, 16] });
  L.control.zoom({ position: "topright" }).addTo(m);
  L.control.scale({ position: "topleft", imperial: false, maxWidth: 110 }).addTo(m);
  L.control.attribution({ prefix: false, position: "bottomright" }).addTo(m);
  const wheel = (ev: WheelEvent) => {
    if (ev.ctrlKey || ev.metaKey) m.scrollWheelZoom.enable();
    else m.scrollWheelZoom.disable();
  };
  el.addEventListener("wheel", wheel, { capture: true });
  const resize = new ResizeObserver(() => m.invalidateSize());
  resize.observe(el);

  // layers, bottom to top: street map, relief, research layer, focus circle, names
  const pane = (name: string, z: number) => {
    const p = m.createPane(name);
    p.style.zIndex = String(z);
    p.style.pointerEvents = "none";
    return name;
  };
  const reliefPane = pane("atlas-relief", 300);
  const dataPane = pane("atlas-data", 310);
  const focusPane = pane("atlas-focus", 320);
  const namesPane = pane("atlas-names", 330);
  const focusRenderer = L.svg({ pane: focusPane });

  let dark = opts.dark;
  let streets: L.TileLayer[] = [];
  let tilesLoaded = false;
  let missing = false;
  const addStreets = () => {
    for (const t of streets) t.remove();
    const base = L.tileLayer(TILES(dark, "Base"), { maxNativeZoom: NATIVE_MAX, maxZoom: 20, attribution: ATTRIBUTION });
    const names = L.tileLayer(TILES(dark, "Reference"), { maxNativeZoom: NATIVE_MAX, maxZoom: 20, pane: namesPane });
    base.on("tileload", () => {
      tilesLoaded = true;
    });
    base.on("tileerror", () => {
      // every tile failing before any loads: blocked or offline; the research layer still shows on the background
      if (tilesLoaded || missing) return;
      missing = true;
      opts.onBasemapMissing("its tiles could not be fetched", HINT_BLOCKED);
    });
    streets = [base.addTo(m), names.addTo(m)];
  };
  addStreets();

  // the research layer: a canvas pinned to the study area, repainted in place (no flash between years)
  const canvas = document.createElement("canvas");
  canvas.className = "atlas-data-canvas";
  const ctx = canvas.getContext("2d")!;
  const data = L.svgOverlay(canvas as unknown as SVGElement, bounds, { pane: dataPane, opacity: opts.opacity, interactive: false });
  let dataOn = false;
  let wanted: DataSource | null = null;
  const draw = (img: ImageData | HTMLImageElement) => {
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width;
      canvas.height = img.height;
    }
    if (img instanceof ImageData) ctx.putImageData(img, 0, 0);
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    }
    if (!dataOn) {
      data.addTo(m);
      dataOn = true;
    }
  };

  let relief: L.ImageOverlay | null = null;
  let focus: L.Circle | null = null;
  let focusAt: { lat: number; lon: number; radiusM: number } | null = null;
  const drawFocus = () => {
    focus?.remove();
    focus = focusAt && L.circle([focusAt.lat, focusAt.lon], {
      radius: focusAt.radiusM, renderer: focusRenderer, interactive: false,
      color: dark ? "#ffffff" : "#14161a", weight: 2.5, dashArray: "6 4", fillColor: "#ffffff", fillOpacity: 0.12,
    }).addTo(m);
  };

  const toLatLon = (ll: L.LatLng): LatLon => ({ lat: ll.lat, lon: ll.lng });

  return {
    kind: "leaflet",
    setData(src) {
      wanted = src;
      if (!src) {
        data.remove();
        dataOn = false;
      } else if ("image" in src) draw(src.image);
      else {
        const img = new Image();
        img.onload = () => wanted === src && draw(img);
        img.onerror = () => console.warn("map: could not load", src.url);
        img.src = src.url;
      }
    },
    setOpacity(o) {
      data.setOpacity(o);
    },
    setRelief(url) {
      relief?.remove();
      relief = url ? L.imageOverlay(url, bounds, { pane: reliefPane, opacity: 0.4, interactive: false }).addTo(m) : null;
    },
    setFocus(f) {
      focusAt = f;
      drawFocus();
    },
    setDark(d) {
      if (d === dark) return;
      dark = d;
      addStreets();
      drawFocus();
    },
    flyTo(to, o) {
      const zoom = Math.max(m.getZoom(), o.minZoom + ZOOM_OFFSET);
      // Leaflet has no padding here: aim right of the place by half the padding, so it lands in the clear part
      const centre = m.unproject(m.project([to.lat, to.lon], zoom).add([o.padRight / 2, 0]), zoom);
      if (o.duration > 0) m.flyTo(centre, zoom, { duration: o.duration / 1000 });
      else m.setView(centre, zoom, { animate: false });
    },
    unproject(x, y) {
      return toLatLon(m.containerPointToLatLng([x, y]));
    },
    onMove(fn) {
      m.on("move", fn);
      return () => void m.off("move", fn);
    },
    onPointer({ move, out, click }) {
      const mv = (ev: L.LeafletMouseEvent) => move(toLatLon(ev.latlng));
      const ck = (ev: L.LeafletMouseEvent) => click(toLatLon(ev.latlng));
      m.on("mousemove", mv);
      m.on("mouseout", out);
      m.on("click", ck);
      return () => {
        m.off("mousemove", mv);
        m.off("mouseout", out);
        m.off("click", ck);
      };
    },
    popup(at, content) {
      L.popup({ maxWidth: 260, autoPanPadding: [16, 16] }).setLatLng([at.lat, at.lon]).setContent(content).openOn(m);
    },
    closePopup() {
      m.closePopup();
    },
    remove() {
      el.removeEventListener("wheel", wheel, { capture: true });
      resize.disconnect();
      m.remove();
    },
  };
}
