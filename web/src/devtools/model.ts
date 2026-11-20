// Browser half of the style editor: finds the app's rules in the live stylesheets, works out which
// ones apply to an element (and which declarations win), and keeps unsaved edits, previewed live.
import {
  compareSpec, normCondition, normSelector, ruleKey, sameDecls, serializeDecls, specificity, splitTop,
  type Decl, type RuleRef, type SourceRule, type Spec,
} from "./shared";

const API = "/__style-editor";
const HEADERS = { "x-style-editor": "1", "Content-Type": "application/json" };

/** A rule as the page has it: the live CSSOM rule plus where it is in the source. */
export type LiveRule = {
  key: string;
  ref: RuleRef;
  rule: CSSStyleRule;
  order: number; // position in the whole document's cascade order
  conds: CSSRule[]; // the @media/@supports blocks around it
  source?: SourceRule;
};

export type Match = {
  live: LiveRule;
  spec: Spec;
  active: boolean; // its @media etc. currently apply
  state: string | null; // ":hover", "::before"... when it only applies in that state
  part: string; // the part of a selector list that matched
};

export type Cascade = {
  matches: Match[]; // highest priority first
  applied: Set<string>; // `${key}#${declIndex}` of declarations that win at least one longhand
  winner: Map<string, string>; // longhand -> rule key that sets it (or "inline")
  inline: Decl[];
};

// interaction states and pseudo-elements: rules using them style the element only sometimes (the
// mouse is over it while picking, so :hover would otherwise always "match")
const STATES = /::?(hover|focus-visible|focus-within|focus|active|visited|before|after|placeholder|marker|selection|first-line|first-letter)\b/gi;

// ---------- longhands a declaration sets (to tell which declarations are overridden)

const probe = typeof document !== "undefined" ? document.createElement("div").style : null;
const SHORT: Record<string, string[]> = {
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  gap: ["row-gap", "column-gap"],
  font: ["font-style", "font-weight", "font-size", "line-height", "font-family"],
};
const longhandCache = new Map<string, string[]>();
export function longhands(prop: string, value: string): string[] {
  if (prop.startsWith("--") || !probe) return [prop];
  const k = `${prop}:${value}`;
  let out = longhandCache.get(k);
  if (!out) {
    probe.cssText = "";
    probe.setProperty(prop, value);
    out = Array.from(probe);
    if (out.length === 0) out = SHORT[prop] ?? [prop];
    longhandCache.set(k, out);
  }
  return out;
}

// ---------- the store

type Listener = () => void;

class Store {
  version = 0;
  files: string[] = [];
  sources = new Map<string, SourceRule>();
  edits = new Map<string, Decl[]>(); // rule key -> its declarations as edited (unsaved)
  live: LiveRule[] = [];
  selected: Element | null = null;
  hovered: Element | null = null;
  highlight: string | null = null; // rule key whose elements to outline
  picking = false;
  target: string | null = null; // rule key the quick controls write to
  message: { kind: "ok" | "error"; text: string } | null = null;
  private listeners = new Set<Listener>();

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  async load() {
    try {
      const r = await fetch(`${API}/rules`, { headers: HEADERS });
      if (!r.ok) throw new Error(`the dev server answered ${r.status}`);
      const data = (await r.json()) as { files: string[]; rules: SourceRule[] };
      this.files = data.files;
      this.sources = new Map(data.rules.map((s) => [ruleKey(s), s]));
    } catch (e) {
      this.message = { kind: "error", text: `Could not read the stylesheets: ${(e as Error).message}` };
    }
    this.reindex();
    this.emit();
  }

  /** Walk the page's stylesheets; call after Vite swaps a stylesheet. Re-applies unsaved edits. */
  reindex() {
    const files = new Set(this.files);
    const out: LiveRule[] = [];
    let order = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      const file = (sheet.ownerNode as Element | null)?.getAttribute?.("data-vite-dev-id");
      if (!file || !files.has(file)) continue;
      const seen = new Map<string, number>();
      const walk = (list: CSSRuleList, context: string[], conds: CSSRule[]) => {
        for (const r of Array.from(list)) {
          if (r instanceof CSSStyleRule) {
            const selector = normSelector(r.selectorText);
            const k = JSON.stringify([context, selector]);
            const occurrence = seen.get(k) ?? 0;
            seen.set(k, occurrence + 1);
            const ref = { file, context, selector, occurrence };
            const key = ruleKey(ref);
            out.push({ key, ref, rule: r, order: order++, conds, source: this.sources.get(key) });
            if (r.cssRules?.length) walk(r.cssRules, [...context, `rule ${selector}`], conds);
          } else if (r instanceof CSSMediaRule) walk(r.cssRules, [...context, `media ${normCondition(r.media.mediaText)}`], [...conds, r]);
          else if (r instanceof CSSSupportsRule) walk(r.cssRules, [...context, `supports ${normCondition(r.conditionText)}`], [...conds, r]);
          else if (typeof CSSContainerRule !== "undefined" && r instanceof CSSContainerRule) {
            walk(r.cssRules, [...context, `container ${normCondition(r.containerName + r.containerQuery)}`], [...conds, r]);
          } else if (typeof CSSLayerBlockRule !== "undefined" && r instanceof CSSLayerBlockRule) {
            walk(r.cssRules, [...context, `layer ${normCondition(r.name)}`], [...conds, r]);
          }
        }
      };
      try {
        walk(sheet.cssRules, [], []);
      } catch {
        /* a sheet still loading */
      }
    }
    this.live = out;
    for (const [key, decls] of this.edits) this.preview(key, decls);
  }

  declsOf(key: string): Decl[] {
    return this.edits.get(key) ?? this.sources.get(key)?.decls ?? [];
  }

  private preview(key: string, decls: Decl[]) {
    for (const l of this.live) if (l.key === key) l.rule.style.cssText = serializeDecls(decls);
  }

  /** Change a rule's declarations: shown at once, written to the file on save. */
  setDecls(key: string, decls: Decl[]) {
    const src = this.sources.get(key);
    if (!src) return;
    if (sameDecls(decls, src.decls)) this.edits.delete(key);
    else this.edits.set(key, decls);
    this.preview(key, decls);
    this.message = null;
    this.emit();
  }

  revert(key: string) {
    const src = this.sources.get(key);
    if (src) this.setDecls(key, src.decls);
  }
  discardAll() {
    for (const key of [...this.edits.keys()]) this.revert(key);
  }

  async save() {
    if (this.edits.size === 0) return;
    const edits = [...this.edits].map(([key, after]) => {
      const s = this.sources.get(key)!;
      return { ref: { file: s.file, context: s.context, selector: s.selector, occurrence: s.occurrence }, before: s.decls, after };
    });
    const r = await post({ edits });
    if (!r.ok) return this.fail(r.error);
    for (const [key, after] of this.edits) {
      const s = this.sources.get(key);
      if (s) this.sources.set(key, { ...s, decls: after });
    }
    this.edits.clear();
    this.message = { kind: "ok", text: `Saved to ${r.files.map(shortFile).join(", ")}` };
    this.emit();
  }

  async createRule(file: string, selector: string) {
    const r = await post({ create: { file, selector, decls: [] } });
    if (!r.ok) return this.fail(r.error);
    this.message = { kind: "ok", text: `Added ${selector} to ${shortFile(file)}` };
    await this.load(); // Vite reloads the sheet; the afterUpdate hook re-indexes again once it lands
  }

  private fail(text: string) {
    this.message = { kind: "error", text };
    this.emit();
  }

  select(el: Element | null) {
    this.selected = el;
    this.target = null;
    this.picking = false;
    this.emit();
  }
}

async function post(payload: unknown): Promise<{ ok: true; files: string[] } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${API}/save`, { method: "POST", headers: HEADERS, body: JSON.stringify(payload) });
    const data = (await r.json()) as { files?: string[]; error?: string };
    return r.ok ? { ok: true, files: data.files ?? [] } : { ok: false, error: data.error ?? `error ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const store = new Store();

export const shortFile = (f: string) => f.replace(/^.*\/src\//, "");

export function isActive(l: LiveRule): boolean {
  return l.conds.every((c) =>
    c instanceof CSSMediaRule ? matchMedia(c.media.mediaText).matches
    : c instanceof CSSSupportsRule ? CSS.supports(c.conditionText)
    : true);
}

export const conditionLabel = (l: LiveRule) =>
  l.conds.map((c) => (c instanceof CSSMediaRule ? `@media ${c.media.mediaText}` : c.cssText.split("{")[0]!.trim())).join(" ");

const safeMatches = (el: Element, sel: string) => {
  try {
    return el.matches(sel);
  } catch {
    return false;
  }
};

/** The rules that apply to an element (or would, in a state like :hover), best first, and which declarations win. */
export function cascade(el: Element): Cascade {
  const matches: Match[] = [];
  for (const live of store.live) {
    let best: Match | null = null;
    for (const part of splitTop(live.rule.selectorText)) {
      const states = part.match(STATES);
      const state = states ? states.join("") : null;
      const bare = states ? part.replace(STATES, "").replace(/\(\s*\)/g, "") || "*" : part;
      if (!safeMatches(el, bare)) continue;
      const m: Match = { live, spec: specificity(part), active: isActive(live), state, part };
      if (!best || (best.state && !state) || (!!best.state === !!state && compareSpec(m.spec, best.spec) > 0)) best = m;
    }
    if (best) matches.push(best);
  }
  // priority: rules that apply now before conditional ones, then specificity, then source order
  const now = (m: Match) => (!m.state && m.active ? 1 : 0);
  matches.sort((a, b) => now(b) - now(a) || compareSpec(b.spec, a.spec) || b.live.order - a.live.order);

  const inline: Decl[] = [];
  const style = (el as HTMLElement).style;
  if (style) for (const p of Array.from(style)) inline.push({ prop: p, value: style.getPropertyValue(p), important: style.getPropertyPriority(p) === "important" });

  // candidates in the order the cascade resolves them: !important first, inline beats rules at equal importance
  type Cand = { id: string; key: string; decl: Decl; tier: number };
  const cands: Cand[] = [];
  inline.forEach((d) => cands.push({ id: `inline#${d.prop}`, key: "inline", decl: d, tier: d.important ? 4 : 2 }));
  for (const m of matches) {
    if (m.state || !m.active) continue;
    store.declsOf(m.live.key).forEach((d, i) => cands.push({ id: `${m.live.key}#${i}`, key: m.live.key, decl: d, tier: d.important ? 3 : 1 }));
  }
  const rank = new Map(matches.map((m, i) => [m.live.key, i]));
  // within one rule a later declaration beats an earlier one, so each rule's declarations go last-first
  cands.sort((a, b) => b.tier - a.tier || (rank.get(a.key) ?? -1) - (rank.get(b.key) ?? -1) || declIndex(b) - declIndex(a));

  const winner = new Map<string, string>();
  const applied = new Set<string>();
  for (const c of cands) {
    let wins = false;
    for (const lh of longhands(c.decl.prop, c.decl.value)) {
      if (!winner.has(lh)) { winner.set(lh, c.key); wins = true; }
    }
    if (wins) applied.add(c.id);
  }
  return { matches, applied, winner, inline };
}

/** The rule the quick controls edit by default: the element's own class rule (`.fact`, `.btn.primary`)
 *  rather than a narrower one like `.fact:first-child`; failing that, the strongest rule that applies. */
export function defaultTarget(el: Element, matches: Match[]): Match | null {
  const usable = matches.filter((m) => !m.state && m.active && m.live.source);
  const own = usable.find((m) => {
    const sel = /^([a-z][\w-]*)?((\.[\w-]+)+)$/i.exec(m.part.trim());
    return !!sel && (!sel[1] || sel[1].toLowerCase() === el.tagName.toLowerCase())
      && sel[2]!.slice(1).split(".").every((c) => el.classList.contains(c));
  });
  return own ?? usable[0] ?? null;
}

const declIndex = (c: { id: string }) => Number(c.id.split("#").at(-1)) || 0;

/** For inherited properties the element's own rules do not set: the nearest ancestor whose rules do, and that rule. */
export function inheritedFrom(el: Element, props: string[]): Map<string, { el: Element; key: string }> {
  const out = new Map<string, { el: Element; key: string }>();
  let todo = props.filter((p) => !cascade(el).winner.has(p));
  for (let p = el.parentElement; p && todo.length; p = p.parentElement) {
    const { winner } = cascade(p);
    for (const prop of todo) {
      const w = winner.get(prop);
      if (w) out.set(prop, { el: p, key: w });
    }
    todo = todo.filter((t) => !out.has(t));
  }
  return out;
}

/** A readable label for an element: tag#id.class.class */
export function label(el: Element): string {
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean) : [];
  return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + cls.map((c) => `.${c}`).join("");
}

/** A selector to suggest for a new rule targeting this element. */
export function suggestSelector(el: Element): string {
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean) : [];
  if (cls.length) return `.${cls[0]}`;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const pc = typeof p.className === "string" ? p.className.trim().split(/\s+/).filter(Boolean)[0] : undefined;
    if (pc) return `.${pc} ${el.tagName.toLowerCase()}`;
  }
  return el.tagName.toLowerCase();
}
