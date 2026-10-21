import { Link, useLocation } from "wouter";

export const adminFrame = "mx-auto w-[calc(100%-1rem)] sm:w-[80%]";

export const ADMIN_LINKS = [
  { href: "/admin", label: "Desk", test: "desk" },
  { href: "/approvals", label: "Approvals", test: "approvals" },
  { href: "/admin/people", label: "People", test: "people", also: ["/admin/trainers", "/admin/teachers"] },
  { href: "/admin/batches", label: "Cohorts", test: "cohorts" },
  { href: "/admin/attendance", label: "Attendance", test: "attendance" },
  { href: "/admin/analytics", label: "Analytics", test: "analytics" },
  { href: "/admin/certificates", label: "Certificates", test: "certificates" },
] as const;

type AdminLink = (typeof ADMIN_LINKS)[number];

function isActive(link: AdminLink, location: string) {
  if (link.href === "/admin") return location === "/admin";
  const hrefs: string[] = [link.href, ...("also" in link ? link.also : [])];
  return hrefs.some((href) => location === href || location.startsWith(`${href}/`));
}

/** A rail down the left edge on wide screens, and a strip under the header on narrow ones. */
export function AdminNav() {
  const [location] = useLocation();
  return (
    <nav
      aria-label="Admin"
      data-tour="admin-nav"
      data-testid="admin-nav"
      data-admin-rail=""
      className="sticky top-0 z-40 border-b border-[#102448]/10 bg-[#fffaf4] text-[#17233c] dark:border-white/10 dark:bg-[#162033] dark:text-[#f6f1e8] lg:fixed lg:inset-y-0 lg:left-0 lg:w-56 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:pt-4"
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 lg:flex-col lg:gap-1 lg:px-3 lg:py-4">
        {ADMIN_LINKS.map((link) => {
          const active = isActive(link, location);
          return (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`admin-nav-${link.test}`}
              data-tour={`admin-nav-${link.test}`}
              className={`shrink-0 border-b-2 px-1 py-2 text-[15px] lg:rounded-md lg:border-b-0 lg:border-l-4 lg:px-3 ${
                active
                  ? "border-[#c4842a] font-semibold text-[#17233c] dark:text-[#f6f1e8] lg:bg-[#c4842a]/10"
                  : "border-transparent font-medium text-[#243044] hover:border-[#c4842a]/40 hover:text-[#17233c] dark:text-[#d7deea] dark:hover:text-[#f6f1e8] lg:hover:bg-[#102448]/5"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
