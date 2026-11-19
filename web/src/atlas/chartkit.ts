// Small helpers for the atlas charts (drawn as SVG at the size they are shown, so text stays legible on phones).
import { useEffect, useRef, useState } from "react";

/** About `count` round tick values (1, 2, 2.5 or 5 × 10^k apart) covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) {
    if (v >= min - step * 1e-9) out.push(Number(v.toFixed(10)));
  }
  return out;
}

/** The tick-aligned domain around [min, max]: the first tick at or below min and at or above max. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  const t = niceTicks(min, max, count);
  const step = t.length > 1 ? t[1]! - t[0]! : 1;
  return [Math.min(t[0]!, Math.floor(min / step) * step), Math.max(t[t.length - 1]!, Math.ceil(max / step) * step)];
}

/** Linear map from [d0, d1] to [r0, r1]. */
export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/**
 * Nudge label positions apart so none are closer than `gap`, keeping their order and staying inside [lo, hi].
 * Returns positions in the input order.
 */
export function spreadLabels(ys: number[], gap: number, lo = -Infinity, hi = Infinity): number[] {
  const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
  const pos = order.map(([y]) => Math.min(hi, Math.max(lo, y)));
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i]!, pos[i - 1]! + gap);
  if (pos.length && pos[pos.length - 1]! > hi) {
    pos[pos.length - 1] = hi;
    for (let i = pos.length - 2; i >= 0; i--) pos[i] = Math.min(pos[i]!, pos[i + 1]! - gap);
  }
  const out = new Array<number>(ys.length);
  order.forEach(([, i], k) => (out[i] = pos[k]!));
  return out;
}

/** Rough width of a label in px (system sans at `size` px). */
export const textWidth = (s: string, size = 12) => s.length * size * 0.56;

/** Width of an element, kept up to date. */
export function useWidth<T extends HTMLElement>(initial = 640): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
