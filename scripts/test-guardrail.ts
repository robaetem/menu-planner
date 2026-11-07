/* Run: npx tsx scripts/test-guardrail.ts */
import { check, parseDiff } from "./guardrail-check";

let failed = 0;
function t(name: string, diff: string, expectFail: boolean) {
  const problems = check(parseDiff(diff));
  const ok = expectFail ? problems.length > 0 : problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${problems.length ? " -> " + problems[0] : ""}`);
}
const d = (path: string, add: string[] = [], rem: string[] = []) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${rem.map((l) => "-" + l).join("\n")}\n${add.map((l) => "+" + l).join("\n")}\n`;

t("title text change passes", d("app/(protected)/diepvries/page.tsx", ['<h1>Diepvries 🧊</h1>'], ["<h1>Diepvries</h1>"]), false);
t("read-only supabase select passes", d("lib/x.ts", ['const r = await db.from("a").select("*");']), false);
t("insert passes", d("lib/x.ts", ['await db.from("a").insert({ a: 1 });']), false);
t("supabase migration fails", d("supabase/migrations/1.sql", ["alter table a add b int;"]), true);
t("workflow edit fails", d(".github/workflows/x.yml", ["on: push"]), true);
t("proxy.ts fails", d("proxy.ts", ["//x"]), true);
t("protected layout fails", d("app/(protected)/layout.tsx", ["//x"]), true);
t("other layout passes", d("app/(protected)/planning/layout.tsx", ["//x"]), false);
t(".env fails", d(".env.production", ["A=1"]), true);
t("next.config fails", d("next.config.js", ["//x"]), true);
t("scripts fails", d("scripts/seed.ts", ["//x"]), true);
t("ALLOWED_EMAILS edit fails", d("lib/auth.ts", ["const a = process.env.ALLOWED_EMAILS;"]), true);
t(".delete( fails", d("lib/x.ts", ['await db.from("a").delete().eq("id", 1);']), true);
t(".update( fails", d("lib/x.ts", ['await db.from("a").update({ a: 1 });']), true);
t(".upsert( fails", d("lib/x.ts", ['await db.from("a").upsert(x);']), true);
t(".truncate fails", d("lib/x.ts", ["x.truncate()"]), true);
t("delete from fails", d("lib/x.ts", ["`DELETE FROM a`"]), true);
t("drop table fails", d("lib/x.ts", ["'drop  table a'"]), true);
t("dep removal fails", d("package.json", [], ['    "date-fns": "^4.4.0",']), true);
t("dep add passes", d("package.json", ['    "zod": "^3.0.0",'], []), false);
t("dep bump passes", d("package.json", ['    "date-fns": "^4.5.0",'], ['    "date-fns": "^4.4.0",']), false);
t("removed .delete( line passes", d("lib/x.ts", [], ['db.delete()']), false);
t("deleted protected file fails", `diff --git a/proxy.ts b/proxy.ts\ndeleted file mode 100644\n--- a/proxy.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n`, true);

if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log("ALL PASS");
