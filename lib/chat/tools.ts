import { tool } from "ai";
import { z } from "zod";
import { startChange } from "@/lib/change/runs";
import { appGuideTools } from "./app-guide";
import { codeTools } from "./code-tools";
import { dataTools } from "./data-tools";

/** All chat tools. The only side effect anywhere is request_change, which
 *  queues an app-code change through lib/change (never touches household data). */
export function buildChatTools(email: string) {
  return {
    ...dataTools,
    ...appGuideTools,
    ...codeTools,
    request_change: tool({
      description:
        "Vraag een wijziging aan de APP (uiterlijk, gedrag, tekst) aan. Alleen aanroepen nadat de gebruiker in dit gesprek expliciet ja heeft gezegd op 'Zal ik dit aanpassen?'. NOOIT voor het wijzigen of verwijderen van gegevens (recepten, planning, diepvries, boodschappen).",
      inputSchema: z.object({
        request: z.string().min(10).max(2000).describe("Duidelijke, zelfstandige beschrijving van de wijziging, in het Engels en in het Nederlands."),
      }),
      execute: async ({ request }) => {
        const r = await startChange(email, request);
        return r.ok ? { runId: r.runId } : { error: r.error };
      },
    }),
  };
}
