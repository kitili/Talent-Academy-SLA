import { Link, useLocation } from "wouter";

export const adminFrame = "mx-auto w-[calc(100%-1rem)] sm:w-[80%]";

export const ADMIN_LINKS = [
  { href: "/admin", label: "Desk", test: "desk" },
  { href: "/approvals", label: "Approvals", test: "approvals" },
  { href: "/admin/trainers", label: "Trainers", test: "trainers" },
  { href: "/admin/teachers", label: "Teachers", test: "teachers" },
  { href: "/admin/batches", label: "Cohorts", test: "cohorts" },
  { href: "/admin/analytics", label: "Analytics", test: "analytics" },
] as const;

export function AdminNav({ embedded = false, flow = false }: { embedded?: boolean; flow?: boolean }) {
  const [location] = useLocation();
  return (
    <nav
      aria-label="Admin"
      data-tour="admin-nav"
      data-testid="admin-nav"
      className={
        embedded
          ? "border-t border-[#102448]/10 dark:border-white/10"
          : `border-b border-[#102448]/10 bg-[#fffaf4] text-[#17233c] dark:border-white/10 dark:bg-[#162033] dark:text-[#f6f1e8] ${flow ? "" : "sticky top-0 z-40"}`
      }
    >
      <div className={`${adminFrame} flex flex-wrap items-center gap-x-6 gap-y-2 py-3`}>
        {ADMIN_LINKS.map((link) => {
          const active = link.href === "/admin"
            ? location === "/admin"
            : location === link.href || location.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`admin-nav-${link.test}`}
              data-tour={`admin-nav-${link.test}`}
              className={`shrink-0 border-b-2 pb-0.5 text-[15px] ${
                active
                  ? "border-[#c4842a] font-semibold text-[#17233c] dark:text-[#f6f1e8]"
                  : "border-transparent font-medium text-[#243044] hover:text-[#17233c] dark:text-[#d7deea] dark:hover:text-[#f6f1e8]"
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
