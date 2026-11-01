/* Reserve freezer stock (vleesjes, groenten) for every upcoming planned meal
   that wants more than it holds, earliest day first — the same rule the app
   applies after every change. Settles past meals first.
   Usage: corepack pnpm dlx tsx scripts/rebalance-freezer.ts <env-file>
   (.env.local = local stack; .env.prod.local = PRODUCTION, back up first). */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { loadStock, rebalanceStock, settleFreezer } from "../lib/freezer/stock-server";
import { shortagesByKey } from "../lib/freezer/stock";

const file = process.argv[2];
if (!file) throw new Error("usage: rebalance-freezer.ts <env-file>");
const env = Object.fromEntries(
  readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  await settleFreezer(db);
  for (const kind of ["vleesje", "groente"] as const) {
    await rebalanceStock(db, kind);
    const s = await loadStock(db, kind);
    const held = s.reservations.map((r) => `${r.day} ${s.entries.find((e) => e.id === r.entryId)?.name} ${r.amount}`).sort();
    console.log(`${kind}: reservations\n  ${held.join("\n  ") || "(none)"}`);
    for (const v of shortagesByKey(s.entries, s.reservations, s.demands).values()) {
      console.log(`  SHORT ${v.name}: ${v.short} (${v.days.map((d) => `${d.day} ${d.short}`).join(", ")})`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
