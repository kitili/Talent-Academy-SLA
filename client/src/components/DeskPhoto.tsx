export type DeskPhotoDesk = "admin" | "trainer" | "fellow";

/** One photo per desk, from client/public/places. Admin: the staff room; Trainer: the reading table; Fellow: learning under the tree. */
const DESK_PHOTOS: Record<DeskPhotoDesk, { src: string; position: string }> = {
  admin: { src: "/places/place-hall.jpg", position: "center 35%" },
  trainer: { src: "/places/place-library.jpg", position: "center 55%" },
  fellow: { src: "/places/place-garden.jpg", position: "center 60%" },
};

/**
 * A short decorative photo strip for the top of a desk's Home page. It carries no text, is hidden from screen readers
 * and from print, and has a fixed height so the work below it does not move when the picture arrives.
 */
export function DeskPhoto({ desk }: { desk: DeskPhotoDesk }) {
  const photo = DESK_PHOTOS[desk];
  return (
    <div aria-hidden="true" className="h-24 w-full overflow-hidden rounded-xl border border-sl-line bg-sl-neutral-soft print:hidden sm:h-32" data-testid={`desk-photo-${desk}`}>
      <img src={photo.src} alt="" loading="lazy" decoding="async" width={1280} height={720} className="h-full w-full object-cover" style={{ objectPosition: photo.position }} />
    </div>
  );
}
