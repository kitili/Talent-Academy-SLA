import { Link, useLocation } from "wouter";

export const ADMIN_LINKS = [
  { href: "/admin", label: "Desk", test: "desk" },
  { href: "/approvals", label: "Approvals", test: "approvals" },
  { href: "/admin/trainers", label: "Trainers", test: "trainers" },
  { href: "/admin/teachers", label: "Teachers", test: "teachers" },
  { href: "/admin/batches", label: "Cohorts", test: "cohorts" },
  { href: "/admin/analytics", label: "Analytics", test: "analytics" },
  { href: "/courses", label: "Courses", test: "courses" },
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
          ? "border-t border-[#102448]/10"
          : `border-b border-[#102448]/10 bg-[#fffaf4] ${flow ? "" : "sticky top-0 z-40"}`
      }
    >
      <div className="mx-auto flex w-[min(1120px,calc(100%-1.25rem))] flex-wrap items-center gap-x-6 gap-y-2 py-3">
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
                  ? "border-[#c4842a] font-semibold text-[#102448]"
                  : "border-transparent font-medium text-[#4a5b73] hover:text-[#102448]"
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
