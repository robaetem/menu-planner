// READ-ONLY code tools: browse the app's repo (main branch) through GitHub.
import { tool } from "ai";
import { z } from "zod";
import { gh } from "@/lib/change/github";

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

export const codeTools = {
  listFiles: tool({
    description: "Lijst de bestanden en mappen in een map van de app-code (hoofdbranch). Leeg pad = hoofdmap.",
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
    description: "Lees één bestand uit de app-code (hoofdbranch). Grote bestanden worden afgekapt.",
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
