import { useQuery } from "@tanstack/react-query";

/** One short line for the day, for whoever is signed in. Shows nothing while loading or if there is none. */
export function DailyLine() {
  const { data } = useQuery<{ line: string }>({
    queryKey: ["/api/daily-line"],
    staleTime: 60 * 60 * 1000,
  });
  if (!data?.line) return null;
  return (
    <p className="text-sm text-sl-muted" data-testid="daily-line">
      {data.line}
    </p>
  );
}
