/* Apply a SQL file to the Supabase DB via the Management API (direct DB is
   IPv6-only/unreachable here). Usage: corepack pnpm dlx tsx scripts/apply-sql.ts <file.sql> */
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const file = process.argv[2];
if (!file) throw new Error("usage: apply-sql.ts <file.sql>");
const query = readFileSync(file, "utf8");

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  console.log(res.status, text);
  if (!res.ok) process.exit(1);
}

main();
