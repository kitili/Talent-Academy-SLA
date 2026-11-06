import { fellowTypeOf, FELLOW_TYPE_LABELS, trainerTypeOf, TRAINER_TYPE_LABELS } from "@shared/academyPeople";

export type KindFilter = "all" | "in_house" | "pre_service" | "instructional";

export const FELLOW_KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "in_house", label: FELLOW_TYPE_LABELS.in_house },
  { value: "pre_service", label: FELLOW_TYPE_LABELS.pre_service },
];

export const TRAINER_KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "in_house", label: TRAINER_TYPE_LABELS.in_house },
  { value: "instructional", label: TRAINER_TYPE_LABELS.instructional },
];

/** The word shown for a signed-in person's own kind. An Admin has none; a Fellow is a `teacher` in code. */
export function ownKindLabel(user: { role?: string | null; fellowType?: unknown; trainerType?: unknown } | null | undefined): string | null {
  if (!user) return null;
  if (user.role === "teacher") return FELLOW_TYPE_LABELS[fellowTypeOf(user.fellowType)];
  if (user.role === "trainer") return TRAINER_TYPE_LABELS[trainerTypeOf(user.trainerType)];
  return null;
}

/**
 * The kind a list row carries. A row whose route did not send the field has no known kind (undefined), not a default,
 * so the list never calls someone in-house just because the field is missing.
 */
export function listKindOf(role: "teacher" | "trainer", row: { fellowType?: unknown; trainerType?: unknown }): string | undefined {
  const raw = role === "teacher" ? row.fellowType : row.trainerType;
  if (raw === undefined || raw === null) return undefined;
  return role === "teacher" ? fellowTypeOf(raw) : trainerTypeOf(raw);
}

export function kindLabelOf(role: "teacher" | "trainer", kind: string | undefined): string | null {
  if (!kind) return null;
  return role === "teacher" ? FELLOW_TYPE_LABELS[fellowTypeOf(kind)] : TRAINER_TYPE_LABELS[trainerTypeOf(kind)];
}

/** Keep the rows of one kind; "all" keeps every row, including those with no known kind. */
export function filterByKind<T extends { fellowType?: unknown; trainerType?: unknown }>(rows: T[], role: "teacher" | "trainer", filter: KindFilter): T[] {
  if (filter === "all") return rows;
  return rows.filter((row) => listKindOf(role, row) === filter);
}
