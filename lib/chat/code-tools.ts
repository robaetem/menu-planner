// READ-ONLY code tools: browse the app's repo (main branch) through GitHub.
import { tool } from "ai";
import { z } from "zod";
import { gunzipSync } from "node:zlib";
import { gh, repo } from "@/lib/change/github";

const MAX_FILE_CHARS = 30_000;

/** Reject traversal, secrets and noise. Returns the cleaned path or null. */
export function safePath(input: string): string | null {
  const p = input.replace(/^\/+|\/+$/g, "");
  const parts = p.split("/").filter(Boolean);
  for (const seg of parts) {
    if (seg === ".." || seg === "." || seg === ".git" || seg === "node_modules") return null;
    if (/^\.env/i.test(seg) || /\.(pem|key|p12|pfx)$/i.test(seg)) return null;
  }
  return parts.join("/");
}

const q = (path: string) => `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=main`;

// searchCode: the whole main branch as one tarball (about 1 MB), unpacked in
// memory and kept for 10 minutes, so a search is one download at most.
type CodeFile = { path: string; text: string };
let codeCache: { at: number; files: CodeFile[] } | null = null;
const CODE_TTL_MS = 10 * 60_000;
const SKIP_FILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$|\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|mp4|zip|gz)$/i;

/** Minimal ustar reader (GitHub tarballs: pax headers for long names). */
export function untar(buf: Buffer): CodeFile[] {
  const out: CodeFile[] = [];
  let pax: string | null = null;
  for (let off = 0; off + 512 <= buf.length; ) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a: number, b: number) => h.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      pax = body.toString("utf8").match(/\d+ path=([^\n]*)\n/)?.[1] ?? null;
      continue;
    }
    if (type === "g") continue;
    const full = pax ?? (str(345, 500) ? `${str(345, 500)}/${str(0, 100)}` : str(0, 100));
    pax = null;
    if (type !== "0" && type !== "\0") continue;
    const path = full.split("/").slice(1).join("/"); // drop "<owner>-<repo>-<sha>/"
    if (!path || safePath(path) === null || SKIP_FILE.test(path) || size > 300_000) continue;
    const text = body.toString("utf8");
    if (!text.includes("\u0000")) out.push({ path, text });
  }
  return out;
}

async function codeFiles(): Promise<CodeFile[]> {
  if (codeCache && Date.now() - codeCache.at < CODE_TTL_MS) return codeCache.files;
  const token = process.env.GITHUB_REPO_TOKEN;
  if (!token) throw new Error("no token");
  const res = await fetch(`https://api.github.com/repos/${repo()}/tarball/main`, {
    headers: { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const files = untar(gunzipSync(Buffer.from(await res.arrayBuffer())));
  codeCache = { at: Date.now(), files };
  return files;
}

export function grep(files: CodeFile[], query: string, under = "", max = 40) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scope = files.filter((f) => f.path.startsWith(under));
  const pathHits = scope.filter((f) => terms.every((t) => f.path.toLowerCase().includes(t))).map((f) => f.path).slice(0, 20);
  const lines: { path: string; line: number; text: string }[] = [];
  let total = 0;
  for (const f of scope) {
    f.text.split("\n").forEach((l, i) => {
      const low = l.toLowerCase();
      if (!terms.every((t) => low.includes(t))) return;
      total++;
      if (lines.length < max) lines.push({ path: f.path, line: i + 1, text: l.trim().slice(0, 200) });
    });
  }
  return { files: pathHits, matches: lines, totalMatches: total, truncated: total > lines.length };
}

export const codeTools = {
  searchCode: tool({
    description:
      "Zoek in ALLE app-code (hoofdbranch) naar tekst: een woord uit het scherm, een functienaam, een tabelnaam. Geeft bestanden waarvan het pad overeenkomt en regels met pad + regelnummer. Alle woorden moeten op één regel staan (hoofdletters maken niet uit). Gebruik dit in plaats van veel listFiles; lees daarna het juiste bestand met readFile. Alleen als appGuide het antwoord niet heeft.",
    inputSchema: z.object({
      query: z.string().trim().min(2).max(100),
      under: z.string().max(200).default("").describe("Optioneel: alleen in deze map, bv. app/(protected)/planning"),
    }),
    execute: async ({ query, under }) => {
      const dir = safePath(under);
      if (dir === null) return { error: "Deze map mag ik niet doorzoeken" };
      try {
        return grep(await codeFiles(), query, dir);
      } catch {
        return { error: "De code kon niet doorzocht worden" };
      }
    },
  }),

  listFiles: tool({
    description:
      "Lijst de bestanden en mappen in een map van de app-code (hoofdbranch). Leeg pad = hoofdmap. Alleen nodig als appGuide een vraag over de app niet beantwoordt. Belangrijke mappen: app/(protected)/planning, app/(protected)/recepten, app/(protected)/diepvries, app/(protected)/boodschappenlijstje, lib/freezer, lib/shopping.",
    inputSchema: z.object({ path: z.string().max(200).default("") }),
    execute: async ({ path }) => {
      const p = safePath(path);
      if (p === null) return { error: "Dit pad mag ik niet openen" };
      try {
        const data = await gh<any>(q(p));
        if (!Array.isArray(data)) return { error: "Dat is een bestand, geen map" };
        return {
          entries: data
            .filter((e) => !/^\.env/i.test(e.name))
            .map((e) => ({ name: e.name, type: e.type, size: e.size })),
        };
      } catch {
        return { error: "Map niet gevonden" };
      }
    },
  }),

  readFile: tool({
    description: "Lees één bestand uit de app-code (hoofdbranch). Grote bestanden worden afgekapt. Alleen als appGuide het antwoord niet heeft.",
    inputSchema: z.object({ path: z.string().min(1).max(200) }),
    execute: async ({ path }) => {
      const p = safePath(path);
      if (!p) return { error: "Dit bestand mag ik niet openen" };
      try {
        const data = await gh<any>(q(p));
        if (Array.isArray(data) || data.type !== "file") return { error: "Dat is geen bestand" };
        if (data.encoding !== "base64" || !data.content) return { error: "Bestand te groot of niet leesbaar" };
        const text = Buffer.from(data.content, "base64").toString("utf8");
        if (text.includes("\u0000")) return { error: "Binair bestand" };
        return text.length > MAX_FILE_CHARS
          ? { path: p, truncated: true, content: text.slice(0, MAX_FILE_CHARS) }
          : { path: p, truncated: false, content: text };
      } catch {
        return { error: "Bestand niet gevonden" };
      }
    },
  }),
};
