export type LearningStatus =
  | "Not Started"
  | "In Progress"
  | "Completed"
  | "Passed"
  | "Failed"
  | "Locked";

export function learningStatus(opts: {
  percentage: number;
  locked?: boolean;
  passed?: boolean | null;
}): LearningStatus {
  if (opts.locked) return "Locked";
  const pct = Number.isFinite(opts.percentage) ? opts.percentage : 0;
  if (pct <= 0) return "Not Started";
  if (pct >= 100) {
    if (opts.passed === false) return "Failed";
    if (opts.passed === true) return "Passed";
    return "Completed";
  }
  return "In Progress";
}

/** Never keep "At Risk" on a finished course. */
export function staffWatchLabel(percentage: number, status: LearningStatus): string | null {
  if (status === "Completed" || status === "Passed") return null;
  if (status === "Failed") return "Failed";
  if (status === "Locked") return "Locked";
  if (percentage > 0 && percentage < 30) return "Needs support";
  return null;
}

export function learningStatusBadgeVariant(status: LearningStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "Passed" || status === "Completed") return "default";
  if (status === "Failed") return "destructive";
  if (status === "In Progress") return "secondary";
  return "outline";
}
