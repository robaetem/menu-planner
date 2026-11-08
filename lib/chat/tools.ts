import { tool } from "ai";
import { z } from "zod";
import { startChange } from "@/lib/change/runs";
import { appGuideTools } from "./app-guide";
import { codeTools } from "./code-tools";
import { dataTools } from "./data-tools";
import { ProposeChangeInput, ProposeChangeOutput } from "./ops";

/** All chat tools. Household data is only read here; changes to it are only
 *  PROPOSED: proposeChange has no execute, so the AI SDK hands it to the
 *  client, which shows a "Doen / Niet doen" card and, after Doen, calls
 *  POST /api/chat/apply (journaled, undoable). The only side effect here is
 *  request_change, which queues an app-code change through lib/change as soon as
 *  the user asks for it (no confirmation question; the run card's undo is the safety net). */
export function buildChatTools(email: string, opts: { images?: string[] } = {}) {
  return {
    ...dataTools,
    ...appGuideTools,
    ...codeTools,
    proposeChange: tool({
      description:
        "Stel een wijziging aan GEGEVENS voor (planning, situaties, notities, maaltijden, recepten, tags, diepvries, boodschappenlijst). De gebruiker ziet een kaart met `title` en de knoppen Doen / Niet doen; pas na Doen gebeurt het. Schrijf er hooguit 'Zal ik dat doen?' bij. Gebruik namen zoals de lees-tools ze tonen (exacte receptnaam, situatielabel uit getSettings, datum yyyy-MM-dd). Meerdere stappen = meerdere ops in één voorstel. delete*/remove*/clear*-ops alleen als de gebruiker uitdrukkelijk vroeg om iets te verwijderen. Resultaat: { ok: true, summary } (gedaan; ongedaan maken kan in de kaart), { ok: false, error } (niets veranderd; leg uit waarom) of { declined: true } (niet doen; stel het niet opnieuw voor).",
      inputSchema: ProposeChangeInput,
      outputSchema: ProposeChangeOutput,
    }),
    request_change: tool({
      description:
        "Vraag een wijziging aan de APP (uiterlijk, gedrag, tekst) aan. Meteen aanroepen zodra de gebruiker om een aanpassing van de app vraagt, zonder eerst te vragen of je het mag; de kaart met 'Ongedaan maken' is het vangnet. Vraag alleen iets (één korte vraag) als echt onduidelijk is wat ze wil. Schrijf vóór de aanroep één korte regel (bv. 'Komt eraan, even geduld.'), erna niets meer. NOOIT voor het wijzigen of verwijderen van gegevens (recepten, planning, diepvries, boodschappen): daarvoor is proposeChange.",
      inputSchema: z.object({
        request: z.string().min(10).max(2000).describe("Duidelijke, zelfstandige beschrijving van de wijziging, in het Engels en in het Nederlands."),
      }),
      execute: async ({ request }) => {
        const r = await startChange(email, request, opts.images?.length ? opts.images : undefined);
        return r.ok ? { runId: r.runId } : { error: r.error };
      },
    }),
  };
}
