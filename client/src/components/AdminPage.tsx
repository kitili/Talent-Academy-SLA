import type { ReactNode } from "react";
import { AcademyShell } from "@/components/AcademyShell";
import type { SceneName } from "@/components/SceneBackdrop";

/** The page chrome for an admin list: the shell on the Admin desk. Inside the People tabs it adds nothing. */
export function AdminPage({ embedded = false, title, children }: { embedded?: boolean; scene?: SceneName; title?: string; children: ReactNode }) {
  if (embedded) return <>{children}</>;
  return (
    <AcademyShell title={title || "Silverleaf Academy"} desk="admin">
      {children}
    </AcademyShell>
  );
}
