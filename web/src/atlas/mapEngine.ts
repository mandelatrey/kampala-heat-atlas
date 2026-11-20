// The atlas map behind one small interface, with two engines:
//  - MapLibre (WebGL 2): vector street map, smooth zoom. Used wherever the browser can run it.
//  - Leaflet (no WebGL): raster street map tiles. Used on browsers with WebGL off or unsupported: older and
//    budget phones whose graphics chips stop at OpenGL ES 2, privacy-hardened browsers, blocklisted drivers.
// Both draw the same research layer, relief, focus circle and popups, so the page does not care which runs.

/** A picture for the data layer: painted pixels, or a ready-coloured image file. */
export type DataSource = { image: ImageData } | { url: string };

export interface LatLon {
  lat: number;
  lon: number;
}

export interface MapEngine {
  /** "maplibre" or "leaflet" (the no-WebGL map) */
  readonly kind: "maplibre" | "leaflet";
  /** The research layer: shown (swapped in place, no flash), or removed with null. */
  setData(src: DataSource | null): void;
  setOpacity(opacity: number): void;
  /** Hill shading under the data layer, or none. */
  setRelief(url: string | null): void;
  /** The dashed circle around a searched place or tapped spot, or none. */
  setFocus(focus: { lat: number; lon: number; radiusM: number } | null): void;
  /** Light or dark street map. */
  setDark(dark: boolean): void;
  /** Fly to a point, zooming in to at least `minZoom` (MapLibre zoom levels), keeping `padRight` px clear on the right. */
  flyTo(to: LatLon, opts: { minZoom: number; padRight: number; duration: number }): void;
  /** The point under a pixel of the map's container. */
  unproject(x: number, y: number): LatLon;
  /** Called while the map pans or zooms; returns an unsubscribe function. */
  onMove(fn: () => void): () => void;
  /** Cursor over the map, cursor leaving it, and a click or tap; returns an unsubscribe function. */
  onPointer(handlers: { move: (p: LatLon) => void; out: () => void; click: (p: LatLon) => void }): () => void;
  /** A popup with this content at a point (replacing any other). */
  popup(at: LatLon, content: HTMLElement): void;
  closePopup(): void;
  remove(): void;
}

export interface EngineOptions {
  /** [[south, west], [north, east]] of the study area, in degrees */
  bounds: [[number, number], [number, number]];
  /** [lon, lat] of the data's top-left, top-right, bottom-right and bottom-left corners */
  corners: [[number, number], [number, number], [number, number], [number, number]];
  dark: boolean;
  opacity: number;
  /** The street map is missing: why, and what may help. The research layer still shows. */
  onBasemapMissing: (why: string, hint: string) => void;
}

/** Whether this browser can start WebGL 2, which MapLibre and deck.gl need. */
export function canUseWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

/**
 * The best map this browser can run: MapLibre with WebGL 2, else Leaflet. Each loads with the map, not the page.
 * Resolves to null when `signal` aborts first (the map was taken down while its code loaded), having made nothing.
 */
export async function createMapEngine(el: HTMLElement, opts: EngineOptions, signal: AbortSignal): Promise<MapEngine | null> {
  if (canUseWebGL2()) {
    try {
      const { createMaplibre } = await import("./mapMaplibre");
      if (signal.aborted) return null;
      return createMaplibre(el, opts);
    } catch (err) {
      // a context the probe got but MapLibre could not use (driver trouble, too many contexts): fall through
      console.warn("map: MapLibre could not start, using the map without WebGL:", err);
      el.replaceChildren();
    }
  }
  const { createLeaflet } = await import("./mapLeaflet");
  if (signal.aborted) return null;
  return createLeaflet(el, opts);
}
