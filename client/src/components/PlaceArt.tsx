/** Place photos. Only the sign-in page still reads these (track P); the desks draw none. */
export const PLACES = {
  library: "/places/place-library.jpg",
  hall: "/places/place-hall.jpg",
  garden: "/places/place-garden.jpg",
  classroom: "/places/place-classroom.jpg",
  lessons: "/places/place-lessons.jpg",
  certificate: "/places/place-certificate.jpg",
} as const;

export type PlaceName = keyof typeof PLACES;

const ROTATION: PlaceName[] = ["classroom", "lessons", "garden", "hall", "library", "certificate"];

export function placeForLabel(label: string, index = 0): PlaceName {
  const text = label.toLowerCase();
  if (/certif/.test(text)) return "certificate";
  if (/cohort|batch|hall|trainer/.test(text)) return "hall";
  if (/garden|learn|teacher/.test(text)) return "garden";
  if (/library|admin|analytic|handover|grade/.test(text)) return "library";
  if (/course|lesson|module|file|document|week/.test(text)) return "lessons";
  if (/class|room|approv/.test(text)) return "classroom";
  return ROTATION[Math.abs(index) % ROTATION.length];
}

/**
 * Was a photo with the title over it. Photos never sit behind text now (design/board/Shell.dc.html), so only the title
 * and its line are left, as plain text, until each page draws its own page header.
 */
export function PlaceBanner({
  title,
  subtitle,
  titleTestId,
}: {
  place: PlaceName;
  title: string;
  subtitle?: string;
  titleTestId?: string;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h2 data-testid={titleTestId} className="text-lg font-semibold text-sl-ink">
        {title}
      </h2>
      {subtitle && <p className="text-sm text-sl-muted">{subtitle}</p>}
    </section>
  );
}

/** Was a decorative photo. Draws nothing now; kept so callers still compile. */
export function PlaceCover(_props: { place: PlaceName; className?: string }) {
  return null;
}
