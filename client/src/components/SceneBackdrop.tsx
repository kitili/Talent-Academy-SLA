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

export function SceneBackdrop({ scene, veil = "photo", children }: { scene: SceneName; veil?: "photo" | "light"; children: ReactNode }) {
  return (
    <div className={`relative min-h-screen ${veil === "light" ? "bg-[#f4efe6]" : "bg-[#102448]"}`}>
      <img
        src={SCENE_PHOTOS[scene]}
        alt=""
        className={`pointer-events-none fixed inset-0 z-0 h-full w-full object-cover object-center ${veil === "light" ? "opacity-25" : ""}`}
        decoding="async"
      />
      {veil === "light" && (
        <div className="pointer-events-none fixed inset-0 z-0 bg-[#f7f3ea]/80" />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
