/** Small classroom scene that matches the module topic. Navy only, so it stays on the Silverleaf brand. */
export function ModuleScene({ title }: { title: string }) {
  const text = title.toLowerCase();
  const kind = /assess|quiz|check|understand/.test(text)
    ? "check"
    : /class|routin|behav|manage/.test(text)
      ? "room"
      : "plan";

  return (
    <svg viewBox="0 0 72 56" className="h-12 w-16 shrink-0 rounded-md bg-primary/10" aria-hidden>
      {kind === "plan" && (
        <>
          <rect className="sl-scene-draw" x="14" y="10" width="44" height="32" rx="3" fill="hsl(220 80% 32% / 0.18)" />
          <rect x="20" y="16" width="22" height="4" rx="1" fill="hsl(220 80% 32% / 0.7)" />
          <rect x="20" y="24" width="32" height="3" rx="1" fill="hsl(220 80% 32% / 0.35)" />
          <rect x="20" y="30" width="26" height="3" rx="1" fill="hsl(220 80% 32% / 0.25)" />
        </>
      )}
      {kind === "room" && (
        <>
          <path className="sl-scene-bob" d="M18 40 L36 12 L54 40 Z" fill="hsl(220 80% 32% / 0.28)" />
          <rect x="22" y="40" width="28" height="6" rx="1" fill="hsl(220 80% 32% / 0.45)" />
          <circle cx="36" cy="18" r="4" fill="hsl(220 80% 32% / 0.7)" />
        </>
      )}
      {kind === "check" && (
        <>
          <circle cx="36" cy="28" r="16" fill="hsl(220 80% 32% / 0.12)" />
          <path className="sl-scene-draw" d="M26 28 l7 7 14-16" fill="none" stroke="hsl(220 80% 32%)" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
