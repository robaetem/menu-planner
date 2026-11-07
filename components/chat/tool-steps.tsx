"use client";

import * as React from "react";
import type { UIMessage } from "ai";
import { Loader } from "@/components/ui/loader";
import { Steps, StepsContent, StepsItem, StepsTrigger } from "@/components/ui/steps";

type Part = UIMessage["parts"][number];

export function toolName(part: Part): string | null {
  if (part.type === "dynamic-tool") return (part as { toolName?: string }).toolName ?? "tool";
  return part.type.startsWith("tool-") ? part.type.slice(5) : null;
}

/** Tools with their own card; never folded into the steps group. */
export const CARD_TOOLS = new Set(["request_change", "proposeChange", "proposeCodeChange"]);

const LABELS: Record<string, string> = {
  listFiles: "In de app gekeken",
  readFile: "In de app gekeken",
  searchFiles: "In de app gekeken",
  grep: "In de app gekeken",
  getPlanning: "Planning bekeken",
  getRecipes: "Recepten bekeken",
  searchRecipes: "Recepten bekeken",
  getRecipe: "Recepten bekeken",
  getFreezer: "Diepvries bekeken",
  getShopping: "Boodschappen bekeken",
};

function label(name: string) {
  return LABELS[name] ?? "Even nagekeken";
}

export function isStepPart(part: Part) {
  const n = toolName(part);
  return n !== null && !CARD_TOOLS.has(n);
}

export function ToolSteps({ parts }: { parts: Part[] }) {
  const running = parts.some((p) => {
    const s = (p as { state?: string }).state;
    return s !== "output-available" && s !== "output-error";
  });
  const labels = Array.from(new Set(parts.map((p) => label(toolName(p) ?? ""))));
  return (
    <Steps defaultOpen={false} className="text-xs">
      <StepsTrigger className="text-xs">
        {running ? (
          <Loader variant="text-shimmer" size="sm" text="Even kijken…" className="font-normal" />
        ) : (
          "Even nagekeken"
        )}
      </StepsTrigger>
      <StepsContent>
        {labels.map((l) => (
          <StepsItem key={l} className="text-xs">
            {l}
          </StepsItem>
        ))}
      </StepsContent>
    </Steps>
  );
}
