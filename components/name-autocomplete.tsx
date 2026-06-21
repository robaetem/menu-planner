"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A text input with a prefix-then-substring suggestion dropdown fed by a list of
 *  known names (e.g. every vleesje/potje name ever entered). Keyboard navigable.
 *  Controlled: value + onChange; calls onCommit (optional) when Enter is pressed
 *  without an active suggestion. */
export function NameAutocomplete({
  value,
  onChange,
  names,
  placeholder,
  autoFocus,
  onCommit,
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  names: string[];
  placeholder?: string;
  autoFocus?: boolean;
  onCommit?: () => void;
  className?: string;
  id?: string;
}) {
  const [show, setShow] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(-1);

  const suggestions = React.useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const n of names) {
      const l = n.toLowerCase();
      if (l === q) continue;
      if (l.startsWith(q)) starts.push(n);
      else if (l.includes(q)) contains.push(n);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [value, names]);

  function choose(v: string) {
    onChange(v);
    setShow(false);
    setActiveIdx(-1);
  }

  const open = show && suggestions.length > 0;

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShow(true);
          setActiveIdx(-1);
        }}
        onFocus={() => setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 120)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={className}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && open) {
            e.preventDefault();
            setActiveIdx((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp" && open) {
            e.preventDefault();
            setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          } else if (e.key === "Enter") {
            if (open && activeIdx >= 0) {
              e.preventDefault();
              choose(suggestions[activeIdx]);
            } else if (onCommit) {
              onCommit();
            }
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setShow(false);
          }
        }}
      />
      {open && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={cn(
                  "w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm",
                  i === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
