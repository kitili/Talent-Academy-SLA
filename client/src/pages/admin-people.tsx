import { useLocation } from "wouter";
import { AdminNav } from "@/components/AdminNav";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import AdminTrainers from "@/pages/admin-trainers";
import AdminTeachers from "@/pages/admin-teachers";

const TABS = [
  { id: "trainers", label: "Trainers", href: "/admin/trainers" },
  { id: "teachers", label: "Teachers", href: "/admin/teachers" },
] as const;

/** Trainers and teachers share one tab. /admin/people opens on trainers. */
export default function AdminPeople() {
  const [location, navigate] = useLocation();
  const active = location.startsWith("/admin/teachers") ? "teachers" : "trainers";
  return (
    <SceneBackdrop scene="hall">
      <AdminNav />
      <div className="p-4 sm:p-6 md:p-8">
        <div className="sl-sheet sl-frame" data-testid="admin-people">
          <div role="tablist" aria-label="People" className="mb-6 flex gap-2 border-b border-[#102448]/10 dark:border-white/10">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active === tab.id}
                data-testid={`people-tab-${tab.id}`}
                onClick={() => navigate(tab.href)}
                className={`-mb-px border-b-2 px-4 py-2 text-[15px] ${
                  active === tab.id
                    ? "border-[#c4842a] font-semibold text-[#17233c] dark:text-[#f6f1e8]"
                    : "border-transparent font-medium text-[#243044] hover:border-[#c4842a]/40 dark:text-[#d7deea]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {active === "teachers" ? <AdminTeachers embedded /> : <AdminTrainers embedded />}
        </div>
      </div>
    </SceneBackdrop>
  );
}
