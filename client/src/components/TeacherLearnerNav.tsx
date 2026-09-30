import { useLocation } from "wouter";
import { BookOpen, GraduationCap, Home } from "lucide-react";

export function TeacherLearnerNav() {
  const [location, navigate] = useLocation();
  const items = [
    { href: "/teacher/dashboard", label: "Home", icon: Home },
    { href: "/teacher/dashboard#my-learning", label: "My learning", icon: BookOpen },
    { href: "/teacher/certificates", label: "Certificates", icon: GraduationCap },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur sm:hidden">
      <div className="grid grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href.startsWith("/teacher/certificates")
            ? location.startsWith("/teacher/certificates")
            : location.startsWith("/teacher/dashboard") || location.startsWith("/teacher/week");
          return (
            <button
              key={item.href}
              type="button"
              className={`flex flex-col items-center gap-1 py-2 text-xs ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}
              onClick={() => navigate(item.href.replace("#my-learning", ""))}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
