import { ReactNode } from "react";

export type SceneName = "room" | "library" | "board" | "garden" | "lamp" | "hall" | "paper";

/** A plain academy page. The scene name is kept so callers stay unchanged; there is no photo behind it. */
export function SceneBackdrop({ children }: { scene?: SceneName; veil?: "photo" | "light"; children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#f4efe6] dark:bg-[#10182a]">
      <div className="relative z-10">{children}</div>
    </div>
  );
}
