import { tool } from "ai";
import { appGuideTools } from "./app-guide";
import { codeTools } from "./code-tools";
import { dataTools } from "./data-tools";
import { ProposeChangeInput, ProposeChangeOutput, ProposeCodeChangeInput, ProposeCodeChangeOutput } from "./ops";

/** All chat tools. Nothing here writes: data and code changes are only PROPOSED.
 *  proposeChange and proposeCodeChange have no execute, so the AI SDK hands
 *  them to the client, which shows an approval card. Only after the user
 *  approves does the client call POST /api/chat/apply (data) or POST
 *  /api/change (code) and return the outcome as the tool result. */
export function buildChatTools(_email: string) {
  return {
    ...dataTools,
    ...appGuideTools,
    ...codeTools,
    proposeChange: tool({
      description:
        "Stel een wijziging aan GEGEVENS voor (planning, situaties, notities, maaltijden, recepten, tags, diepvries, boodschappenlijst). De gebruiker ziet een kaart met `title` en de knoppen Doen / Niet doen; pas na Doen gebeurt het. Schrijf er hooguit 'Zal ik dat doen?' bij. Gebruik namen zoals de lees-tools ze tonen (exacte receptnaam, situatielabel uit getSettings, datum yyyy-MM-dd). Meerdere stappen = meerdere ops in één voorstel. delete*-ops alleen als de gebruiker uitdrukkelijk vroeg om iets te verwijderen. Resultaat: { ok: true, summary } (gedaan; de gebruiker kan het ongedaan maken), { ok: false, error } (niets veranderd; leg uit waarom) of { declined: true } (afgewezen; doe niets).",
      inputSchema: ProposeChangeInput,
      outputSchema: ProposeChangeOutput,
    }),
    proposeCodeChange: tool({
      description:
        "Stel een wijziging aan de APP zelf voor (uiterlijk, knoppen, teksten, gedrag), niet aan gegevens. De gebruiker ziet een kaart met Doen / Niet doen; na Doen wordt de wijziging gebouwd en gepubliceerd. Neem haar wens over in haar eigen woorden (plus Engels); niets opzoeken is nodig. Resultaat: { runId } (gestart; voortgang staat in de kaart), { error } of { declined: true }.",
      inputSchema: ProposeCodeChangeInput,
      outputSchema: ProposeCodeChangeOutput,
    }),
  };
}
