import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Each course's progress, one bar per course, as a percent. One series, so no legend: the panel's title names it.
 * Bars use the theme's first chart colour (`--chart-1`, which has a light and a dark step); text and grid use the desk's
 * ink tokens. A table of the same figures sits under the chart, so the numbers never depend on seeing the colour.
 */
export function CourseProgressChart({ rows }: { rows: ReadonlyArray<{ name: string; percent: number }> }) {
  if (rows.length === 0) return null;
  const ink = "rgb(var(--sl-muted))";
  return (
    <div className="space-y-3 px-5 py-4" data-testid="chart-course-progress">
      <div role="img" aria-label={`Progress per course: ${rows.map((row) => `${row.name} ${row.percent}%`).join(", ")}`} style={{ height: 56 + rows.length * 38 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows as Array<{ name: string; percent: number }>} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }} barCategoryGap={10}>
            <CartesianGrid horizontal={false} stroke="rgb(var(--sl-line))" />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: ink, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fill: ink, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgb(var(--sl-neutral-soft))" }}
              formatter={(value: number) => [`${value}%`, "Progress"]}
              contentStyle={{ background: "rgb(var(--sl-surface))", border: "1px solid rgb(var(--sl-line))", borderRadius: 8, color: "rgb(var(--sl-ink))" }}
            />
            <Bar dataKey="percent" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="min-h-[44px] cursor-pointer py-2.5 text-sl-accent">Show these figures as a table</summary>
        <table className="mt-1 w-full text-left text-[15px]">
          <caption className="sr-only">Progress per course</caption>
          <thead>
            <tr className="text-xs text-sl-muted"><th scope="col" className="py-1 pr-3 font-medium">Course</th><th scope="col" className="py-1 font-medium">Progress</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-sl-line"><th scope="row" className="py-1.5 pr-3 font-normal text-sl-ink">{row.name}</th><td className="py-1.5 text-sl-ink">{row.percent}%</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
