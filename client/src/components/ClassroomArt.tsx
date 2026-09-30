export function ClassroomArt({ className = "" }: { className?: string }) {
  return (
    <div className={`sl-art overflow-hidden rounded-xl border border-primary/15 bg-primary/[0.04] ${className}`} aria-hidden>
      <svg viewBox="0 0 640 160" className="w-full h-28 sm:h-36" role="img">
        <title>Classroom scene</title>
        <rect width="640" height="160" fill="transparent" />
        <ellipse className="sl-art-float" cx="72" cy="118" rx="48" ry="12" fill="hsl(220 80% 32% / 0.08)" />
        <path d="M40 120 L72 36 L104 120 Z" fill="hsl(220 80% 32% / 0.18)" />
        <circle cx="72" cy="42" r="14" fill="hsl(220 80% 32% / 0.35)" />
        <rect x="200" y="48" width="240" height="88" rx="8" fill="hsl(220 80% 32% / 0.12)" />
        <rect x="216" y="64" width="88" height="12" rx="3" fill="hsl(220 80% 32% / 0.35)" />
        <rect x="216" y="86" width="208" height="8" rx="2" fill="hsl(220 80% 32% / 0.2)" />
        <rect x="216" y="102" width="160" height="8" rx="2" fill="hsl(220 80% 32% / 0.16)" />
        <circle className="sl-art-float" cx="560" cy="70" r="28" fill="hsl(220 80% 32% / 0.2)" />
        <path d="M540 110 h40 v18 h-40 z" fill="hsl(220 80% 32% / 0.28)" />
        <path d="M548 92 h24 v18 h-24 z" fill="hsl(220 80% 32% / 0.4)" />
      </svg>
    </div>
  );
}
