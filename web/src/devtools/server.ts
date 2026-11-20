// Dev-server half of the style editor: lists the rules in the app's .css files and writes edits
// made in the browser back into them. Only runs under `npm run dev` (apply: "serve").
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve, sep } from "node:path";
import postcss, { type AtRule, type Declaration, type Rule } from "postcss";
import type { Plugin } from "vite";
import { normCondition, normSelector, sameDecls, type Decl, type RuleRef, type SourceRule } from "./shared";

export class EditError extends Error {}

function contextOf(rule: Rule): string[] | null {
  const ctx: string[] = [];
  for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
    if (p.type === "atrule") {
      const a = p as AtRule;
      if (/keyframes$/i.test(a.name)) return null; // keyframe steps are not selectors
      ctx.unshift(`${a.name.toLowerCase()} ${normCondition(a.params)}`);
    } else if (p.type === "rule") ctx.unshift(`rule ${normSelector((p as Rule).selector)}`);
  }
  return ctx;
}

const declsOf = (rule: Rule): Declaration[] => (rule.nodes ?? []).filter((n): n is Declaration => n.type === "decl");

/** Every style rule in a stylesheet, with the reference the browser side uses to find it. */
export function sourceRules(css: string, file: string) {
  const root = postcss.parse(css, { from: file });
  const seen = new Map<string, number>();
  const rules: { rule: Rule; ref: SourceRule }[] = [];
  root.walkRules((rule) => {
    const context = contextOf(rule);
    if (!context) return;
    const selector = normSelector(rule.selector);
    const k = JSON.stringify([context, selector]);
    const occurrence = seen.get(k) ?? 0;
    seen.set(k, occurrence + 1);
    const decls = declsOf(rule).map((d) => ({ prop: d.prop, value: d.value, important: !!d.important }));
    rules.push({ rule, ref: { file, context, selector, occurrence, line: rule.source?.start?.line ?? 0, decls } });
  });
  return { root, rules };
}

/** Make a rule's declarations equal `after`, touching only what changed so the file keeps its formatting. */
function patchRule(rule: Rule, after: readonly Decl[]) {
  const existing = declsOf(rule);
  const kept = new Set<Declaration>();
  const seen = new Map<string, number>();
  const added: Decl[] = [];
  for (const d of after) {
    const n = seen.get(d.prop) ?? 0;
    seen.set(d.prop, n + 1);
    const node = existing.filter((e) => e.prop === d.prop)[n];
    if (!node) { added.push(d); continue; }
    kept.add(node);
    if (node.value !== d.value) node.value = d.value;
    if (!!node.important !== d.important) node.important = d.important;
  }
  for (const node of existing) if (!kept.has(node)) node.remove();
  const oneLine = !/\n/.test(rule.toString());
  for (const d of added) {
    const last = declsOf(rule).at(-1);
    const node = postcss.decl({ prop: d.prop, value: d.value, important: d.important });
    node.raws.before = last?.raws.before ?? (oneLine ? " " : "\n  ");
    node.raws.between = last?.raws.between ?? ": ";
    rule.append(node);
    if (oneLine && !rule.raws.after) rule.raws.after = " ";
  }
  rule.raws.semicolon = true;
}

const sameRef = (a: RuleRef, b: RuleRef) =>
  a.selector === b.selector && a.occurrence === b.occurrence && JSON.stringify(a.context) === JSON.stringify(b.context);

/** Apply one rule edit to a stylesheet's text. Refuses if the rule changed on disk since the browser read it. */
export function applyRuleEdit(css: string, edit: { ref: RuleRef; before: Decl[]; after: Decl[] }): string {
  const { root, rules } = sourceRules(css, edit.ref.file);
  const hit = rules.find((r) => sameRef(r.ref, edit.ref));
  if (!hit) throw new EditError(`${edit.ref.selector} is no longer in the file`);
  if (!sameDecls(hit.ref.decls, edit.before)) throw new EditError(`${edit.ref.selector} was changed in the file since the editor read it; reload and try again`);
  patchRule(hit.rule, edit.after);
  return root.toString();
}

/** Add a new rule at the end of a stylesheet, in the one-line style the app's CSS uses. */
export function appendRule(css: string, selector: string, decls: Decl[]): string {
  if (!selector.trim() || /[{}]/.test(selector)) throw new EditError("not a valid selector");
  try {
    postcss.parse(`${selector} {}`);
  } catch {
    throw new EditError("not a valid selector");
  }
  const body = decls.length ? ` ${decls.map((d) => `${d.prop}: ${d.value}${d.important ? " !important" : ""};`).join(" ")} ` : " ";
  return `${css.replace(/\s*$/, "\n")}${selector.trim()} {${body}}\n`;
}

// ---------- the endpoint

function cssFiles(dir: string, skip: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return p === skip || e.name === "node_modules" ? [] : cssFiles(p, skip);
    return e.name.endsWith(".css") ? [p] : [];
  });
}

async function body(req: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 1_000_000) throw new EditError("request too large");
  }
  return JSON.parse(text);
}

type SaveRequest = {
  edits?: { ref: RuleRef; before: Decl[]; after: Decl[] }[];
  create?: { file: string; selector: string; decls: Decl[] };
};

/** Vite plugin: GET /__style-editor/rules lists rules; POST /__style-editor/save writes edits. */
export function styleEditor(srcDir: string): Plugin {
  const root = resolve(srcDir);
  const own = resolve(root, "devtools");
  const allowed = (file: string) => {
    const f = resolve(file);
    return f.startsWith(root + sep) && !f.startsWith(own + sep) && f.endsWith(".css") && cssFiles(root, own).includes(f);
  };
  const send = (res: ServerResponse, status: number, data: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };

  return {
    name: "style-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__style-editor", async (req, res) => {
        // only the editor's own page may call this: a custom header forces a CORS preflight on other sites
        const origin = req.headers.origin;
        if (req.headers["x-style-editor"] !== "1" || (origin && new URL(origin).host !== req.headers.host)) {
          return send(res, 403, { error: "forbidden" });
        }
        try {
          if (req.method === "GET" && req.url?.startsWith("/rules")) {
            const files = cssFiles(root, own);
            const rules = files.flatMap((f) => sourceRules(readFileSync(f, "utf8"), f).rules.map((r) => r.ref));
            return send(res, 200, { files, rules });
          }
          if (req.method === "POST" && req.url?.startsWith("/save")) {
            const { edits = [], create } = (await body(req)) as SaveRequest;
            const byFile = new Map<string, string>();
            const text = (f: string) => {
              if (!allowed(f)) throw new EditError(`not an editable stylesheet: ${f}`);
              return byFile.get(f) ?? readFileSync(f, "utf8");
            };
            for (const e of edits) byFile.set(e.ref.file, applyRuleEdit(text(e.ref.file), e));
            if (create) byFile.set(create.file, appendRule(text(create.file), create.selector, create.decls));
            // every edit applied cleanly: only now write, so a refused edit leaves all files untouched
            for (const [f, css] of byFile) writeFileSync(f, css);
            return send(res, 200, { ok: true, files: [...byFile.keys()] });
          }
          send(res, 404, { error: "not found" });
        } catch (err) {
          send(res, err instanceof EditError ? 409 : 400, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
