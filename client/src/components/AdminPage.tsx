import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AcademyShell } from "@/components/AcademyShell";
import type { SceneName } from "@/components/SceneBackdrop";
import { deskName } from "@shared/deskName";

/** The page chrome for an admin list. Inside the People tabs it adds nothing. */
export function AdminPage({ embedded = false, scene, title, children }: { embedded?: boolean; scene: SceneName; title?: string; children: ReactNode }) {
  const { user, logoutMutation } = useAuth();
  if (embedded) return <>{children}</>;
  return (
    <AcademyShell
      scene={scene}
      title={title || "Silverleaf Academy"}
      subtitle="Admin desk"
      userLabel={user ? deskName(user) : undefined}
      onLogout={() => logoutMutation.mutate()}
      showAdminNav
    >
      {children}
    </AcademyShell>
  );
}
