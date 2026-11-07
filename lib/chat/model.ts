import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs } from "ai";

// Model and stream settings shared by the chat route and scripts/eval-chat.ts.
export const CHAT_MODEL = "z-ai/glm-5.3-flash";

// Reasoning cannot be turned off for this model; "low" keeps it to a few
// dozen tokens. Provider order: the endpoints with the lowest time to first
// token in scripts/eval-chat.ts runs (2026-11-07); others stay as fallback.
const FAST_PROVIDERS = ["together", "friendli", "fireworks", "deepinfra", "baseten"];

export function chatModel(apiKey: string) {
  return createOpenRouter({ apiKey }).chat(CHAT_MODEL, {
    extraBody: {
      reasoning: { effort: "low", exclude: true },
      provider: { order: FAST_PROVIDERS, allow_fallbacks: true },
    },
  });
}

// A couple of lookups plus the answer; never long chains.
// 10 leaves room for the change tools; the last step may not call tools, so the user always gets a written answer.
const MAX_STEPS = 10;

export const chatSettings = {
  stopWhen: stepCountIs(MAX_STEPS),
  // The last step may not call tools, so there is always a written answer.
  prepareStep: ({ stepNumber }: { stepNumber: number }) =>
    stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" as const } : {},
  maxOutputTokens: 700,
  temperature: 0.3,
};
