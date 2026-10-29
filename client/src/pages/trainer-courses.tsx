import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AcademyShell } from "@/components/AcademyShell";
import { SkeletonRows } from "@/components/Skeletons";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_SECONDARY = `inline-flex items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-3.5 py-2.5 min-h-[44px] text-sm text-sl-ink hover:bg-sl-neutral-soft disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const FIELD = `w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted ${FOCUS}`;
const LABEL = "text-sm font-medium text-sl-ink";
const PANEL = "rounded-xl border border-sl-line bg-sl-surface";

type Cohort = { id: string; name: string };
type Course = { id: string; name: string; description?: string | null; mine: boolean; cohorts: Cohort[] };

const blank = { name: "", description: "", cohortId: "" };

/**
 * A Trainer's courses: the ones they made and the ones on cohorts they teach. They make a course here, then open it to
 * add modules, slides, videos and quizzes, and put it on a cohort so its Fellows see it.
 */
export default function TrainerCourses() {
  const { toast } = useToast();
  const [form, setForm] = useState(blank);
  const [placing, setPlacing] = useState<Record<string, string>>({});
  const { data: cohorts = [] } = useQuery<Cohort[]>({ queryKey: ["/api/batches"] });
  const { data: courses = [], isLoading } = useQuery<Course[]>({ queryKey: ["/api/trainer/courses"] });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/trainer/courses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/trainer/desk"] });
  };

  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/trainer/courses", { ...form, cohortId: form.cohortId || undefined })).json(),
    onSuccess: (course: { id: string; name: string }) => {
      toast({ title: `${course.name} is ready`, description: "Open it to add modules, slides and videos." });
      setForm({ ...blank, cohortId: form.cohortId });
      refresh();
    },
    onError: (error: Error) => toast({ title: "Could not make the course", description: error.message, variant: "destructive" }),
  });

  const place = useMutation({
    mutationFn: async ({ courseId, cohortId }: { courseId: string; cohortId: string }) =>
      (await apiRequest("POST", `/api/trainer/courses/${courseId}/cohorts`, { cohortId })).json(),
    onSuccess: () => {
      toast({ title: "Course added to the cohort" });
      refresh();
    },
    onError: (error: Error) => toast({ title: "Could not add the course", description: error.message, variant: "destructive" }),
  });

  return (
    <AcademyShell title="Courses" desk="trainer" current="courses">
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold text-sl-ink">Courses</h1>
          <p className="text-sm text-sl-muted">Make a course, open it to add modules, slides, videos and quizzes, and put it on a cohort you teach.</p>
        </div>

        <form
          className={`${PANEL} space-y-3 px-5 py-4`}
          onSubmit={(event) => { event.preventDefault(); create.mutate(); }}
          aria-label="Make a course"
        >
          <h2 className="text-base font-semibold text-sl-ink">Make a course</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="course-name" className={LABEL}>Name</label>
              <input id="course-name" className={FIELD} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-course-name" required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="course-cohort" className={LABEL}>Put it on a cohort</label>
              <select id="course-cohort" className={FIELD} value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })} data-testid="select-course-cohort">
                <option value="">Not yet</option>
                {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="course-description" className={LABEL}>What it covers (optional)</label>
            <textarea id="course-description" rows={2} className={`${FIELD} resize-y`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button type="submit" className={BTN_PRIMARY} disabled={create.isPending || form.name.trim().length < 3} data-testid="button-create-course">
            {create.isPending ? "Making…" : "Make course"}
          </button>
        </form>

        <section aria-labelledby="my-courses" className="space-y-2">
          <h2 id="my-courses" className="text-base font-semibold text-sl-ink">Your courses{!isLoading && <span className="font-normal text-sl-muted"> · {courses.length}</span>}</h2>
          {isLoading ? (
            <SkeletonRows label="Loading courses" rows={3} />
          ) : courses.length === 0 ? (
            <p className={`${PANEL} px-5 py-6 text-sm text-sl-muted`}>No courses yet. Make the first one above.</p>
          ) : courses.map((course) => {
            const open = cohorts.filter((cohort) => !course.cohorts.some((on) => on.id === cohort.id));
            return (
              <article key={course.id} className={`${PANEL} space-y-3 px-5 py-4`} data-testid={`course-row-${course.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sl-ink">{course.name}</h3>
                    <p className="text-sm text-sl-muted">
                      {course.cohorts.length ? `On ${course.cohorts.map((cohort) => cohort.name).join(", ")}` : "Not on a cohort yet: Fellows cannot see it"}
                      {course.mine ? " · made by you" : ""}
                    </p>
                  </div>
                  <a className={BTN_PRIMARY} href={`/courses/${course.id}`} data-testid={`link-open-course-${course.id}`}>Open and add content</a>
                </div>
                {open.length > 0 && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex-1 space-y-1.5">
                      <span className={LABEL}>Add to a cohort</span>
                      <select
                        className={FIELD}
                        value={placing[course.id] || ""}
                        onChange={(e) => setPlacing((current) => ({ ...current, [course.id]: e.target.value }))}
                      >
                        <option value="">Choose a cohort</option>
                        {open.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={BTN_SECONDARY}
                      disabled={!placing[course.id] || place.isPending}
                      onClick={() => place.mutate({ courseId: course.id, cohortId: placing[course.id] })}
                    >
                      Add
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </AcademyShell>
  );
}
