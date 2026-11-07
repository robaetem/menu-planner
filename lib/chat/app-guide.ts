// The appGuide tool: plain-language "how does the app work" answers in one
// step, from lib/chat/app-knowledge.ts, instead of reading source files.
import { tool } from "ai";
import { z } from "zod";
import { APP_KNOWLEDGE } from "./app-knowledge";

const TOPICS = APP_KNOWLEDGE.map((k) => k.topic);

export const appGuideTools = {
  appGuide: tool({
    description:
      "Uitleg over hoe de app werkt en waar je wat vindt, in gewone woorden (knoppen, kleuren, stappen). Gebruik dit EERST voor elke 'hoe werkt…', 'hoe doe ik…', 'wat betekent…' of 'waar vind ik…'-vraag, en voordat je een app-wijziging voorstelt; lees pas code als dit het antwoord niet heeft. Kies 1-4 onderwerpen; zonder onderwerp krijg je alles. Onderwerpen: " +
      APP_KNOWLEDGE.map((k) => `${k.topic} (${k.title})`).join("; "),
    inputSchema: z.object({
      topics: z.array(z.string().max(40)).max(8).optional().describe(`Onderwerpen uit: ${TOPICS.join(", ")}`),
    }),
    execute: async ({ topics }) => {
      const wanted = (topics ?? []).map((t) => t.trim().toLowerCase());
      const picked = wanted.length
        ? APP_KNOWLEDGE.filter((k) => wanted.some((w) => k.topic.includes(w) || w.includes(k.topic)))
        : APP_KNOWLEDGE;
      const list = picked.length ? picked : APP_KNOWLEDGE;
      return { topics: list.map((k) => ({ title: k.title, text: k.text })) };
    },
  }),
};
