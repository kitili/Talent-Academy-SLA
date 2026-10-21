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

export function PlaceBanner({
  place,
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
    <section className="sl-place-banner">
      <div className="sl-place-banner-copy">
        <h2 data-testid={titleTestId} className="text-2xl sm:text-3xl font-bold text-white">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm sm:text-base text-white/90 max-w-xl">{subtitle}</p>}
      </div>
    </section>
  );
}

export function PlaceCover({
  place,
  className = "h-28 sm:h-36",
}: {
  place: PlaceName;
  className?: string;
}) {
  return null;
}
