/**
 * The side menu of each desk, in order (design/board/Shell.dc.html). The shell draws it; a desk page says which item
 * is current and may switch sections itself through `onNavigate` instead of following `href`.
 * `test` keeps the data-testid / data-tour suffix the tests and the guided tour already use.
 */
export type Desk = "admin" | "trainer" | "fellow";

export type DeskMenuItem = {
  key: string;
  label: string;
  href: string;
  test: string;
  /** Other paths that also make this item current (an item's own pages, such as a person's detail page). */
  also?: readonly string[];
};

export const DESK_MENUS: Record<Desk, readonly DeskMenuItem[]> = {
  admin: [
    { key: "home", label: "Home", href: "/admin", test: "desk" },
    { key: "approvals", label: "Approvals", href: "/approvals", test: "approvals" },
    { key: "people", label: "People", href: "/admin/people", test: "people", also: ["/admin/trainers", "/admin/teachers"] },
    { key: "cohorts", label: "Cohorts", href: "/admin/batches", test: "cohorts" },
    { key: "attendance", label: "Attendance", href: "/admin/attendance", test: "attendance" },
    { key: "analytics", label: "Analytics", href: "/admin/analytics", test: "analytics" },
    { key: "certificates", label: "Certificates", href: "/admin/certificates", test: "certificates" },
  ],
  trainer: [
    { key: "home", label: "Home", href: "/trainer/batches?tab=home", test: "home" },
    { key: "cohorts", label: "Cohorts", href: "/trainer/batches?tab=cohorts", test: "cohorts" },
    { key: "assessments", label: "Assessments", href: "/trainer/batches?tab=assessments", test: "assessments" },
    { key: "progress", label: "Progress", href: "/trainer/batches?tab=progress", test: "progress" },
    { key: "attendance", label: "Attendance", href: "/trainer/batches?tab=attendance", test: "attendance" },
    { key: "messages", label: "Messages", href: "/trainer/batches?tab=messages", test: "messages" },
    { key: "schedule", label: "Schedule", href: "/trainer/batches?tab=schedule", test: "schedule" },
  ],
  fellow: [
    { key: "home", label: "Home", href: "/teacher/dashboard?tab=home", test: "home" },
    { key: "learning", label: "Learning", href: "/teacher/dashboard?tab=learning", test: "learning" },
    { key: "work", label: "Work", href: "/teacher/dashboard?tab=work", test: "work" },
    { key: "quizzes", label: "Quizzes", href: "/teacher/dashboard?tab=quizzes", test: "quizzes" },
    { key: "progress", label: "Progress", href: "/teacher/dashboard?tab=progress", test: "progress" },
    { key: "reflect", label: "Reflect", href: "/teacher/dashboard?tab=reflect", test: "reflect" },
    { key: "messages", label: "Messages", href: "/teacher/dashboard?tab=messages", test: "messages" },
    { key: "certificates", label: "Certificates", href: "/teacher/certificates", test: "certificates" },
  ],
};

export const DESK_LABELS: Record<Desk, string> = { admin: "Admin", trainer: "Trainer", fellow: "Fellow" };
