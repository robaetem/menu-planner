import { cn } from "@/lib/utils";

export type Person = "robin" | "amber";

/** Tinted pill classes for a person — the same colours everywhere they appear. */
export const PERSON_BADGE: Record<Person, string> = {
  robin: "border-robin/30 bg-robin-soft text-robin-ink",
  amber: "border-amber/30 bg-amber-soft text-amber-ink",
};

/** Text in a person's colour. */
export const PERSON_TEXT: Record<Person, string> = {
  robin: "text-robin-ink",
  amber: "text-amber-ink",
};

export function PersonBadge({
  who,
  className,
  children,
}: {
  who: Person;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", PERSON_BADGE[who], className)}>
      {children}
    </span>
  );
}

/** A small dot in a person's colour, for lists and legends. */
export function PersonDot({ who, className }: { who: Person; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", who === "robin" ? "bg-robin" : "bg-amber", className)}
    />
  );
}
