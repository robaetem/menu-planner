/** The app's mark: a smiling slice of bread. Draws in the current text colour. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden className={className}>
      <path
        d="M23 82V55C14 52 10 46 10 38C10 25 20 16 33 16C41 16 45 20 50 20C55 20 59 16 67 16C80 16 90 25 90 38C90 46 86 52 77 55V82"
        stroke="currentColor"
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={41} cy={48} r={5} fill="currentColor" />
      <circle cx={59} cy={48} r={5} fill="currentColor" />
      <path d="M43 59Q50 66 57 59" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
    </svg>
  );
}
