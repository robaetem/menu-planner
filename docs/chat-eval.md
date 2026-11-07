# Chat eval

`scripts/eval-chat.ts` runs 48 chat turns (single and multi-turn) against the real model with the production data, read-only. Every non-GET request to Supabase or GitHub throws, and `request_change` is stubbed. Run it with:

```
corepack pnpm dlx tsx scripts/eval-chat.ts <label> [case,ids]
```

Results land in `/tmp/menu-chat-eval/<label>.json`. Flags per answer: tech words, third person, over 20 words, style (bold, headers, "Goede vraag", "Kortom", "Wil je dat ik").

## Results (2026-11-07, model z-ai/glm-5.3-flash)

| Run | Median words | Over 20 words | Median time to first word | p90 time to first word | Pass (judged) |
| --- | --- | --- | --- | --- | --- |
| Before (main) | 99 | most | 2.3 s | 10.6 s | about 50% |
| After (this change) | 14 | 8 of 48, 1 over 30 (the "volledige lijst" case, allowed) | 1.3 s | 2.2 s | about 96% |

Speed came from reasoning effort "low", a fixed fast provider order, and the app guide in the prompt, so how-questions no longer read code.

## Examples (after)

- "welke recepten heb ik?" → "48 recepten. Bv. witloofquiche, lasagne met spinazie, ravioli, kip curry, pastinaakpuree."
- "wat eten we donderdag?" → "Donderdag: pasta scampi, potje."
- "wat moet ik kopen?" → "11 dingen. Bv. aardappelen, bloemkool, courgette, prei, gehakt."
- "hoeveel potjes hebben we nog?" → "6 vrij: 3 voor Robin, 3 voor Amber."
- "maak de verzendknop rood" → "Zal ik de verzendknop rood maken?", then on "ja": "Komt eraan, duurt een paar minuten."

## Open issues

- The week overview sometimes still adds "(potje)".
- The freezer tool returns batches with 0 left and repeated names and gives no free totals, so counting depends on the model.
- `lastCookedOn` in the recipe list is always empty, so "what haven't we eaten in a while" is a guess.
- The planning tool does not report a shortage or reservations, so "why is there a shortage" cannot be explained.
