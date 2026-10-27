import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AcademyShell } from "@/components/AcademyShell";
import { TabBar } from "@/components/AdminParts";
import AdminTrainers from "@/pages/admin-trainers";
import AdminTeachers from "@/pages/admin-teachers";
import { deskName } from "@shared/deskName";

type Listed = { id: string; approvalStatus: string };

const active = (rows?: Listed[]) => rows?.filter((row) => row.approvalStatus !== "inactive").length;

/** Trainers and Fellows (stored as teachers) share one tab. /admin/people opens on trainers. */
export default function AdminPeople() {
  const [location, navigate] = useLocation();
  const { user, logoutMutation } = useAuth();
  const current = location.startsWith("/admin/teachers") ? "teachers" : "trainers";
  // The same two reads the lists below make, so each tab can show its count before it is opened.
  const { data: trainers } = useQuery<Listed[]>({ queryKey: ["/api/admin/trainers"], enabled: user?.role === "admin" });
  const { data: teachers } = useQuery<Listed[]>({ queryKey: ["/api/admin/teachers"], enabled: user?.role === "admin" });

  const tabs = (
    <TabBar
      label="People"
      active={current}
      onSelect={(id) => navigate(id === "teachers" ? "/admin/teachers" : "/admin/trainers")}
      tabs={[
        { id: "trainers", label: "Trainers", count: active(trainers), testId: "people-tab-trainers" },
        { id: "teachers", label: "Fellows", count: active(teachers), testId: "people-tab-teachers" },
      ]}
    />
  );

  return (
    <AcademyShell
      title="Silverleaf Academy"
      userLabel={user ? deskName(user) : undefined}
      onLogout={() => logoutMutation.mutate()}
      showAdminNav
      desk="admin"
      current="people"
    >
      <div data-testid="admin-people">
        {current === "teachers" ? <AdminTeachers tabs={tabs} /> : <AdminTrainers tabs={tabs} />}
      </div>
    </AcademyShell>
  );
}
