import type { ReactNode } from "react";
import { SceneBackdrop, type SceneName } from "@/components/SceneBackdrop";
import { AdminNav } from "@/components/AdminNav";

/** The page chrome for an admin list. Inside the People tabs it adds nothing. */
export function AdminPage({ embedded = false, scene, children }: { embedded?: boolean; scene: SceneName; children: ReactNode }) {
  if (embedded) return <>{children}</>;
  return (
    <SceneBackdrop scene={scene}>
      <AdminNav />
      <div className="p-4 sm:p-6 md:p-8">
        <div className="sl-sheet sl-frame">{children}</div>
      </div>
    </SceneBackdrop>
  );
}
