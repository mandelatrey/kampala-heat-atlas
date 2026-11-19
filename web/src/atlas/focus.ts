// Ask the atlas map to show a place (fly there and open its summary card) from anywhere on the page.
import type { Focus } from "./PlaceCard";

const EVENT = "atlas:focus";

export function focusOnMap(f: Focus): void {
  window.dispatchEvent(new CustomEvent<Focus>(EVENT, { detail: f }));
}

/** Listen for requests; returns the unsubscribe function. */
export function onFocusRequest(cb: (f: Focus) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<Focus>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
