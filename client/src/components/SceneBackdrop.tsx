import { ReactNode } from "react";

/** The photos the desks used to sit on. Nothing draws them now; the names stay so callers still compile. */
export const SCENE_PHOTOS = {
  room: "/silverleaf-room.jpg",
  library: "/bg-library.jpg",
  board: "/bg-board.jpg",
  garden: "/bg-garden.jpg",
  lamp: "/bg-lamp.jpg",
  hall: "/bg-hall.jpg",
  paper: "/bg-paper.jpg",
} as const;

export type SceneName = keyof typeof SCENE_PHOTOS;

/** The page ground. No photo, veil or cream: photos never sit behind text (design/board/Shell.dc.html). */
export function SceneBackdrop({ children }: { scene?: SceneName; veil?: "photo" | "light"; children: ReactNode }) {
  return <div className="min-h-screen bg-sl-ground text-sl-ink">{children}</div>;
}
