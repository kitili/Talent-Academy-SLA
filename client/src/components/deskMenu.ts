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
  /** A guided-tour target (`data-tour`) this item carries instead of `nav-<desk>-<test>`. */
  tour?: string;
};

export const DESK_MENUS: Record<Desk, readonly DeskMenuItem[]> = {
  admin: [
    { key: "home", label: "Home", href: "/admin", test: "desk" },
    { key: "approvals", label: "Approvals", href: "/approvals", test: "approvals" },
    { key: "people", label: "People", href: "/admin/people", test: "people", also: ["/admin/trainers", "/admin/teachers"] },
    { key: "cohorts", label: "Cohorts", href: "/admin/batches", test: "cohorts", also: ["/cohorts", "/courses", "/course"] },
    { key: "attendance", label: "Attendance", href: "/admin/attendance", test: "attendance" },
    { key: "analytics", label: "Analytics", href: "/admin/analytics", test: "analytics" },
    { key: "certificates", label: "Certificates", href: "/admin/certificates", test: "certificates" },
  ],
  trainer: [
    { key: "home", label: "Home", href: "/trainer/batches?tab=home", test: "home" },
    { key: "cohorts", label: "Cohorts", href: "/trainer/batches?tab=cohorts", test: "cohorts", also: ["/cohorts", "/courses", "/course", "/trainer/teachers"] },
    { key: "assessments", label: "Assessments", href: "/trainer/batches?tab=assessments", test: "assessments" },
    { key: "progress", label: "Progress", href: "/trainer/batches?tab=progress", test: "progress" },
    { key: "attendance", label: "Attendance", href: "/trainer/batches?tab=attendance", test: "attendance" },
    { key: "messages", label: "Messages", href: "/trainer/batches?tab=messages", test: "messages" },
    { key: "schedule", label: "Schedule", href: "/trainer/batches?tab=schedule", test: "schedule" },
  ],
  fellow: [
    { key: "home", label: "Home", href: "/teacher/dashboard?tab=home", test: "home" },
    { key: "learning", label: "Learning", href: "/teacher/dashboard?tab=learning", test: "learning", also: ["/teacher/week"] },
    { key: "work", label: "Work", href: "/teacher/dashboard?tab=work", test: "work" },
    { key: "quizzes", label: "Quizzes", href: "/teacher/dashboard?tab=quizzes", test: "quizzes", also: ["/teacher/exams"] },
    { key: "progress", label: "Progress", href: "/teacher/dashboard?tab=progress", test: "progress" },
    { key: "reflect", label: "Reflect", href: "/teacher/dashboard?tab=reflect", test: "reflect" },
    { key: "messages", label: "Messages", href: "/teacher/dashboard?tab=messages", test: "messages" },
    { key: "certificates", label: "Certificates", href: "/teacher/certificates", test: "certificates", tour: "teacher-certificates" },
  ],
};

export const DESK_LABELS: Record<Desk, string> = { admin: "Admin", trainer: "Trainer", fellow: "Fellow" };

/** The four items on each desk's phone bar, in order; "More" opens the rest (design/board/Shell.dc.html). */
export const DESK_PHONE_BAR: Record<Desk, readonly string[]> = {
  admin: ["home", "approvals", "people", "cohorts"],
  trainer: ["home", "cohorts", "assessments", "messages"],
  fellow: ["home", "learning", "work", "messages"],
};

/** The `data-tour` on each desk's side menu. Admin and Trainer keep the targets their tours already use. */
export const DESK_NAV_TOUR: Record<Desk, string> = { admin: "admin-nav", trainer: "trainer-tools", fellow: "fellow-nav" };

/** The test hook suffix an item carries: `admin-nav-<test>` on the Admin desk, `nav-<desk>-<test>` elsewhere. */
export function deskItemHook(desk: Desk, item: DeskMenuItem) {
  return desk === "admin" ? `admin-nav-${item.test}` : `nav-${desk}-${item.test}`;
}

function splitHref(href: string) {
  const [path, query = ""] = href.split("?");
  return { path, tab: new URLSearchParams(query).get("tab") };
}

/**
 * The key of the item a location opens: an exact path (and `?tab=`) first, then the longest path the location sits
 * under (an item's `href` or `also`). On a desk page with no `?tab=`, the first item on that path is current.
 */
export function deskItemForLocation(desk: Desk, path: string, search = ""): string | undefined {
  const items = DESK_MENUS[desk];
  const tab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
  const onPath = items.filter((item) => splitHref(item.href).path === path);
  if (onPath.length) {
    const byTab = tab ? onPath.find((item) => splitHref(item.href).tab === tab) : undefined;
    if (byTab) return byTab.key;
    const plain = onPath.find((item) => !splitHref(item.href).tab);
    if (plain) return plain.key;
    if (!tab) return onPath[0].key;
  }
  let best: { key: string; length: number } | undefined;
  for (const item of items) {
    for (const base of [splitHref(item.href).path, ...(item.also ?? [])]) {
      const under = path === base || path.startsWith(`${base}/`);
      if (under && base.length > (best?.length ?? -1)) best = { key: item.key, length: base.length };
    }
  }
  return best?.key;
}
