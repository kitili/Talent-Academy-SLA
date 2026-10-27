import { DeskNav } from "@/components/AcademyShell";
import { DESK_MENUS } from "@/components/deskMenu";

/** The width of an admin page's content. The shell sets its own now; kept for older callers. */
export const adminFrame = "mx-auto w-full max-w-[1120px] px-4 sm:px-6";

/** The Admin menu (Home, Approvals, People, Cohorts, Attendance, Analytics, Certificates) lives in deskMenu.ts. */
export const ADMIN_LINKS = DESK_MENUS.admin;

/** The Admin desk's side menu. AcademyShell draws it for `desk="admin"` / `showAdminNav`. */
export function AdminNav({ current }: { current?: string } = {}) {
  return <DeskNav desk="admin" current={current} />;
}
