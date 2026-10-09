import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AcademyShell } from "@/components/AcademyShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function AdminHandover() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const { data: health } = useQuery<any>({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      return res.json();
    },
  });

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="p-8 text-center">Only administrators can open the handover.</Card>
      </div>
    );
  }

  const weeks = [
    {
      title: "Week 1 — Come in",
      items: [
        "Admin, trainer, and teacher desks each use their own password.",
        "Approvals sit on the admin home when people are waiting.",
        "Test logins (not for fellows): admin / admin123, trainer1 / trainer123, teacher@test.com / teacher123.",
      ],
    },
    {
      title: "Week 2 — Teach",
      items: [
        "Assign a course to a cohort, then a module quiz with an 80% pass mark unless you change it.",
        "Lesson files should land on Vercel Blob. Health must show blob true on the live site.",
        "Teachers open week 2 only after week 1 and its quiz.",
      ],
    },
    {
      title: "Week 3 — Close",
      items: [
        "Gradebook CSV lives on the cohort workspace.",
        "Certificates generate when a course is complete enough.",
        "Database is Neon. Restore from Neon, not a second app database.",
      ],
    },
  ];

  return (
    <AcademyShell
      scene="paper"
      title="Silverleaf Academy"
      subtitle="Three-week handover"
      userLabel={user?.username}
      onLogout={() => logoutMutation.mutate()}
    >
      <Button variant="ghost" onClick={() => navigate("/admin")}>Back</Button>
      <h1 className="text-3xl font-bold">Handover</h1>
      <p className="text-muted-foreground">What Silverleaf staff need in the first three weeks. Live site uses Neon.</p>
      <Card className="p-4">
        <p className="font-semibold">Live health</p>
        <p className="text-sm text-muted-foreground mt-1">
          Database {health?.databaseReachable ? "reachable" : "down"}
          {health?.databaseHost ? ` · ${health.databaseHost}` : ""} · files {health?.blob ? "on Blob" : "local only"}
        </p>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {weeks.map((week) => (
          <Card key={week.title} className="p-4 space-y-2">
            <p className="font-semibold">{week.title}</p>
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {week.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </AcademyShell>
  );
}
