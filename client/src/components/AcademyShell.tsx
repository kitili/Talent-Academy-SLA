import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { LogOut } from "lucide-react";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";
import { SceneBackdrop, type SceneName } from "@/components/SceneBackdrop";
import { AdminNav, adminFrame } from "@/components/AdminNav";

type AcademyShellProps = {
  title: string;
  subtitle?: string;
  userLabel?: string;
  onLogout?: () => void;
  actions?: ReactNode;
  scene?: SceneName;
  showAdminNav?: boolean;
  children: ReactNode;
};

export function AcademyShell({ title, subtitle, userLabel, onLogout, actions, scene = "library", showAdminNav = false, children }: AcademyShellProps) {
  const frame = showAdminNav ? adminFrame : "sl-frame";
  return (
    <SceneBackdrop scene={scene} veil={showAdminNav ? "light" : "photo"}>
      <header
        className={`sticky top-0 z-50 shadow-sm ${showAdminNav ? "bg-[#fffaf4] text-[#17233c] border-b border-[#102448]/10 dark:bg-[#162033] dark:text-[#f6f1e8] dark:border-white/10" : "bg-primary text-white"}`}
        data-tour={showAdminNav ? "admin-header" : undefined}
      >
        <div className={`${frame} py-3 sm:py-4 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 min-w-0" data-tour={showAdminNav ? "admin-brand" : undefined}>
            <div className={`h-11 w-11 sm:h-12 sm:w-12 flex-shrink-0 rounded-md p-1 ${showAdminNav ? "bg-white" : "bg-white/10"}`}>
              <img src={logoImage} alt="Silverleaf Academy" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className={`font-semibold text-lg sm:text-xl truncate ${showAdminNav ? "text-[#17233c] dark:text-[#f6f1e8]" : "text-white"}`}>{title}</p>
              {subtitle && <p className={`text-xs sm:text-sm truncate ${showAdminNav ? "text-[#243044] dark:text-[#d7deea]" : "text-white/80"}`}>{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {userLabel && (
              <span
                className={`text-xs max-w-[5.5rem] sm:max-w-[140px] truncate ${showAdminNav ? "inline text-[#243044] dark:text-[#d7deea]" : "hidden lg:inline text-white/90"}`}
                data-tour={showAdminNav ? "admin-account" : undefined}
              >
                {userLabel}
              </span>
            )}
            {actions}
            <span className="inline-flex" data-tour={showAdminNav ? "admin-bell" : undefined}>
              <NotificationBell tone={showAdminNav ? "light" : "dark"} />
            </span>
            <div className={showAdminNav ? "text-[#17233c] dark:text-[#f6f1e8]" : "text-white"} data-tour={showAdminNav ? "admin-theme" : undefined}>
              <ThemeToggle />
            </div>
            {onLogout && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onLogout}
                data-tour={showAdminNav ? "admin-logout" : undefined}
                className={showAdminNav
                  ? "bg-transparent hover:bg-[#102448]/5 text-[#17233c] border-[#102448]/15 dark:text-[#f6f1e8] dark:border-white/20 dark:hover:bg-white/10"
                  : "bg-white/10 hover:bg-white/20 text-white border-white/20"}
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            )}
          </div>
        </div>
        {showAdminNav && <AdminNav embedded />}
      </header>
      <div className={`${frame} py-6 sm:py-8`}>
        <div className="sl-sheet space-y-6">
          {children}
        </div>
      </div>
    </SceneBackdrop>
  );
}
