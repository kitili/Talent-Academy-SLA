import { parseDeadline } from "@shared/academyPath";

/** Rules the Trainer's Reopen dialog, Materials form and Progress chart share with their tests. No React in here. */

/** The server answers `{ error }`; `apiRequest` wraps it as "403: {json}". Gives the sentence to show. */
export function apiErrorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const body = message.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    /* not JSON: use the text if it reads like a sentence */
  }
  return body && !body.startsWith("<") && body.length < 200 ? body : fallback;
}

/** Reopen is offered on an item that has a deadline: one that has passed is closed, one still to come may be moved. */
export function canReopen(dueDate: string | Date | null | undefined): boolean {
  return Boolean(parseDeadline(dueDate as any));
}

export type Sitter = { id: string; name: string };

/** Who can be given their own deadline: the Fellows the item names, or the whole cohort when it names none. */
export function reopenCandidates(
  audience: Array<{ teacherId: string; name: string }> | undefined,
  roster: Array<{ id: string; name?: string; email?: string }>,
): Sitter[] {
  if (audience && audience.length > 0) return audience.map((member) => ({ id: member.teacherId, name: member.name }));
  return roster.map((fellow) => ({ id: fellow.id, name: fellow.name || fellow.email || "Fellow" }));
}

export type ReopenInput = {
  kind: "quiz" | "assignment";
  itemId: string;
  scope: "fellow" | "everyone";
  teacherId?: string;
  /** The datetime-local field's value, which carries no zone. */
  dueLocal: string;
  now?: Date;
};

/** The body for `POST /api/deadlines/reopen`, or the sentence that says what is missing. The deadline goes as an instant. */
export function reopenBody(input: ReopenInput): { body: Record<string, unknown> } | { error: string } {
  const due = parseDeadline(input.dueLocal);
  if (!due) return { error: "Choose the new deadline" };
  if (due.getTime() <= (input.now ?? new Date()).getTime()) return { error: "The new deadline must be in the future" };
  if (input.scope === "fellow" && !input.teacherId) return { error: "Choose the Fellow" };
  return {
    body: {
      kind: input.kind,
      itemId: input.itemId,
      scope: input.scope,
      ...(input.scope === "fellow" ? { teacherId: input.teacherId } : {}),
      dueDate: due.toISOString(),
    },
  };
}

export type MaterialInput = { title: string; note: string; fileUrl: string | null; fileName: string | null; linkUrl: string; teacherIds: string[] };

/** The body for `POST /api/batches/:id/materials`, or what is missing. Empty `teacherIds` names the whole cohort. */
export function materialBody(input: MaterialInput): { body: Record<string, unknown> } | { error: string } {
  if (!input.title.trim()) return { error: "Add a title" };
  const link = input.linkUrl.trim();
  if (!input.fileUrl && !link) return { error: "Add a file or a link" };
  return {
    body: {
      title: input.title.trim(),
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
      ...(input.fileUrl ? { fileUrl: input.fileUrl, fileName: input.fileName || undefined } : {}),
      ...(link ? { linkUrl: link } : {}),
      teacherIds: input.teacherIds,
    },
  };
}

export type ProgressBar = { name: string; percent: number };

/** One bar per Fellow, lowest first so the ones who need help sit at the top; percentages are held to 0-100. */
export function progressBars(rows: Array<{ teacherName?: string; teacher?: { name?: string }; overallPercentage?: number }>): ProgressBar[] {
  return rows
    .map((row) => ({
      name: row.teacher?.name || row.teacherName || "Fellow",
      percent: Math.max(0, Math.min(100, Math.round(Number(row.overallPercentage) || 0))),
    }))
    .sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name));
}
