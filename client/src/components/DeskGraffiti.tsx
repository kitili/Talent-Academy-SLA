import { useAuth } from "@/hooks/use-auth";
import { wallLabel } from "@shared/deskName";

/** The academy leaf: three stacked tips and a thin stem. */
function LeafMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 72 96" className={className} aria-hidden="true" fill="currentColor">
      <path d="M36 4 62 30 36 24 10 30Z" />
      <path d="M36 28 64 58 36 50 8 58Z" />
      <path d="M36 54 60 88 36 78 12 88Z" />
      <path d="M36 10v74" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

/** A quiet leaf and the signed-in name on the photo behind the desks. */
export function DeskGraffiti() {
  const { user } = useAuth();
  if (!user) return null;
  const name = wallLabel(user as {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    email?: string | null;
  });

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden text-[#16315f] dark:text-[#f3f6fb]"
      aria-hidden="true"
      data-testid="desk-graffiti"
    >
      <LeafMark className="absolute left-6 top-[9vh] h-[4.75rem] w-14 opacity-[0.1] sm:left-10 sm:h-[5.5rem] sm:w-16 dark:opacity-[0.13]" />
      <LeafMark className="absolute bottom-[7vh] right-6 h-[3.75rem] w-11 rotate-[10deg] opacity-[0.08] sm:right-10 sm:h-[4.5rem] sm:w-14 dark:opacity-[0.11]" />
      <p
        data-testid="desk-graffiti-name"
        className="absolute left-4 top-[29vh] max-h-[46vh] select-none overflow-hidden whitespace-nowrap font-serif text-[0.72rem] font-medium tracking-[0.2em] opacity-[0.14] sm:left-7 sm:text-[0.82rem] dark:opacity-[0.18]"
        style={{ writingMode: "vertical-rl" }}
      >
        {name}
      </p>
      <p
        className="absolute right-4 top-[20vh] max-h-[38vh] select-none overflow-hidden whitespace-nowrap font-serif text-[0.68rem] font-medium tracking-[0.26em] opacity-[0.09] sm:right-7 sm:text-[0.78rem] dark:opacity-[0.13]"
        style={{ writingMode: "vertical-rl" }}
      >
        Silverleaf
      </p>
    </div>
  );
}
