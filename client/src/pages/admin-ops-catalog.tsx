import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { AcademyShell } from "@/components/AcademyShell";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

type Catalog = {
  howToFind: string;
  areas: { id: string; title: string; description: string }[];
  tables: { table: string; area: string; label: string }[];
  documents: { area: string; path: string; title: string }[];
};

export default function AdminOpsCatalog() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<Catalog>({
    queryKey: ["/api/admin/ops-catalog"],
    queryFn: async () => {
      const response = await fetch("/api/admin/ops-catalog");
      if (!response.ok) throw new Error("Could not load catalog");
      return response.json();
    },
  });

  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  return (
    <AcademyShell title="Data catalog" scene="paper">
      <p className="text-muted-foreground mb-6 max-w-3xl">
        {data?.howToFind ||
          "Each Supabase table is tagged with an ops area so onboarding, marketing, and the rest stay separate."}
      </p>
      {isLoading ? (
        <p>Loading catalog…</p>
      ) : (
        <div className="space-y-8">
          {(data?.areas || []).map((area) => (
            <Card key={area.id} className="p-6">
              <h2 className="text-xl font-bold">[{area.id}] {area.title}</h2>
              <p className="text-muted-foreground mt-1">{area.description}</p>
              <ul className="mt-4 space-y-1">
                {(data?.tables || [])
                  .filter((row) => row.area === area.id)
                  .map((row) => (
                    <li key={row.table}>
                      <code className="text-sm">{row.table}</code>
                      <span className="text-muted-foreground"> — {row.label}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                Documents:{" "}
                {(data?.documents || [])
                  .filter((doc) => doc.area === area.id)
                  .map((doc) => doc.path)
                  .join(", ") || "docs/ops/README.md"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </AcademyShell>
  );
}
