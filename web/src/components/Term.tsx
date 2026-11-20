import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type TermId } from "../glossary";

/**
 * A word with a meaning behind it: dotted underline; tap, click or focus + Enter shows the definition
 * in a small bubble (Escape or a tap elsewhere closes it).
 */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const tip = useId();
  // keep the bubble on screen: it opens under the word and slides left or right if it would spill over an edge
  useLayoutEffect(() => {
    if (!open || !bubble.current) return setShift(0);
    const r = bubble.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, pad = 8;
    setShift(r.right > vw - pad ? vw - pad - r.right : r.left < pad ? pad - r.left : 0);
  }, [open]);
  const g = GLOSSARY[id];
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="term" ref={wrap}>
      <button type="button" className="term-word" aria-expanded={open} aria-describedby={open ? tip : undefined} onClick={() => setOpen((o) => !o)}>
        {children ?? g.term}
      </button>
      {open && (
        <span className="term-tip" role="tooltip" id={tip} ref={bubble} style={shift ? { transform: `translateX(${shift}px)` } : undefined}>
          <b>{g.term}</b> {g.short}
        </span>
      )}
    </span>
  );
}

/** Every term, as a definition list (for the bottom of the atlas page). */
export function GlossaryList({ ids }: { ids?: TermId[] }) {
  const list = (ids ?? (Object.keys(GLOSSARY) as TermId[])).map((id) => [id, GLOSSARY[id]] as const);
  return (
    <dl className="glossary">
      {[...list].sort((a, b) => a[1].term.localeCompare(b[1].term)).map(([id, g]) => (
        <div key={id} id={`term-${id}`}>
          <dt>{g.term}</dt>
          <dd>{g.short}</dd>
        </div>
      ))}
    </dl>
  );
}
