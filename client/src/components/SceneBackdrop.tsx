import { ReactNode } from "react";

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

export function SceneBackdrop({ scene, children }: { scene: SceneName; children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#102448]">
      <img
        src={SCENE_PHOTOS[scene]}
        alt=""
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover object-center"
        decoding="async"
      />
      {children}
    </div>
  );
}
