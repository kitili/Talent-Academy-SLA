import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { LogOut } from "lucide-react";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";
import { SceneBackdrop, type SceneName } from "@/components/SceneBackdrop";

type AcademyShellProps = {
  title: string;
  subtitle?: string;
  userLabel?: string;
  onLogout?: () => void;
  actions?: ReactNode;
  scene?: SceneName;
  children: ReactNode;
};

export function AcademyShell({ title, subtitle, userLabel, onLogout, actions, scene = "library", children }: AcademyShellProps) {
  return (
    <SceneBackdrop scene={scene}>
      <header className="sticky top-0 z-50 bg-primary shadow-md">
        <div className="sl-frame py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 sm:h-12 sm:w-12 flex-shrink-0 rounded-md bg-white/10 p-1">
              <img src={logoImage} alt="Silverleaf Academy" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-lg sm:text-xl truncate">{title}</p>
              {subtitle && <p className="text-white/80 text-xs sm:text-sm truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {userLabel && (
              <span className="hidden md:inline text-xs text-white/90 max-w-[180px] truncate">{userLabel}</span>
            )}
            {actions}
            <NotificationBell />
            <div className="text-white">
              <ThemeToggle />
            </div>
            {onLogout && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onLogout}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            )}
          </div>
        </div>
      </header>
      <div className="sl-frame py-6 sm:py-8">
        <div className="sl-sheet space-y-6">
          {children}
        </div>
      </div>
    </SceneBackdrop>
  );
}
