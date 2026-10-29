import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AcademyShell } from "@/components/AcademyShell";
import { SkeletonRows } from "@/components/Skeletons";
import { FELLOW_TYPES, FELLOW_TYPE_HINTS, FELLOW_TYPE_LABELS, fellowTypeOf, type FellowType } from "@shared/academyPeople";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const FIELD = `w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted ${FOCUS}`;
const LABEL = "text-sm font-medium text-sl-ink";
const PANEL = "rounded-xl border border-sl-line bg-sl-surface";

type Fellow = { id: string; name: string; email: string; username?: string | null; fellowType?: string | null; passwordSet?: string | null; teacherId?: number };
type Cohort = { id: string; name: string };

const blank = { name: "", email: "", username: "", fellowType: "in_house" as FellowType, batchId: "" };

/** A Trainer registers a Fellow. The Fellow is approved at once and creates their own password at sign-in. */
export default function TrainerFellows() {
  const { toast } = useToast();
  const [form, setForm] = useState(blank);
  const [done, setDone] = useState<string | null>(null);
  const { data: cohorts = [] } = useQuery<Cohort[]>({ queryKey: ["/api/batches"] });
  const { data: fellows = [], isLoading } = useQuery<Fellow[]>({ queryKey: ["/api/trainer/fellows"] });

  const register = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/trainer/fellows", { ...form, batchId: form.batchId || undefined });
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      setDone(data.message || "Fellow registered.");
      setForm({ ...blank, batchId: form.batchId });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/fellows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    },
    onError: (error: Error) => {
      setDone(null);
      toast({ title: "Could not register the Fellow", description: error.message, variant: "destructive" });
    },
  });

  const retype = useMutation({
    mutationFn: async ({ id, fellowType }: { id: string; fellowType: FellowType }) => {
      const res = await apiRequest("PATCH", `/api/trainer/fellows/${id}/type`, { fellowType });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/trainer/fellows"] }),
    onError: (error: Error) => toast({ title: "Could not change the type", description: error.message, variant: "destructive" }),
  });

  return (
    <AcademyShell title="Register Fellows" desk="trainer" current="fellows">
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold text-sl-ink">Register Fellows</h1>
          <p className="text-sm text-sl-muted">Add a Fellow to your cohort. They sign in, choose Fellow, and create their own password. You never set one for them.</p>
        </div>

        <form
          className={`${PANEL} space-y-3 px-5 py-4`}
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate();
          }}
          aria-label="Register a Fellow"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="fellow-name" className={LABEL}>Full name</label>
              <input id="fellow-name" className={FIELD} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" data-testid="input-fellow-name" required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fellow-email" className={LABEL}>Email</label>
              <input id="fellow-email" type="email" className={FIELD} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" data-testid="input-fellow-email" required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fellow-username" className={LABEL}>Username</label>
              <input id="fellow-username" className={FIELD} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" aria-describedby="fellow-username-hint" data-testid="input-fellow-username" required />
              <span id="fellow-username-hint" className="text-[13px] text-sl-muted">3 to 40 letters or numbers. The Fellow can sign in with it.</span>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fellow-cohort" className={LABEL}>Cohort</label>
              <select id="fellow-cohort" className={FIELD} value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })} data-testid="select-fellow-cohort">
                <option value="">No cohort yet</option>
                {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
              </select>
            </div>
          </div>
          <fieldset className="space-y-2 border-0 p-0">
            <legend className={`${LABEL} mb-1`}>Kind of Fellow</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FELLOW_TYPES.map((type) => (
                <label key={type} className={`flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-lg border px-3.5 py-3 ${form.fellowType === type ? "border-sl-accent bg-sl-accent-soft" : "border-sl-control bg-sl-surface"}`}>
                  <span className="flex items-center gap-2.5 text-[15px] font-semibold text-sl-ink">
                    <input type="radio" name="fellow-type" value={type} checked={form.fellowType === type} onChange={() => setForm({ ...form, fellowType: type })} data-testid={`radio-fellow-type-${type}`} className="m-0 h-[18px] w-[18px] accent-[rgb(var(--sl-accent-strong))]" />
                    {FELLOW_TYPE_LABELS[type]}
                  </span>
                  <span className="pl-7 text-[13px] text-sl-muted">{FELLOW_TYPE_HINTS[type]}</span>
                </label>
              ))}
            </div>
            <p className="text-[13px] text-sl-muted">Both kinds see every lesson, quiz and assessment.</p>
          </fieldset>
          <button type="submit" className={BTN_PRIMARY} disabled={register.isPending || !form.name.trim() || !form.email.trim() || !form.username.trim()} data-testid="button-register-fellow">
            {register.isPending ? "Registering…" : "Register Fellow"}
          </button>
          {done && <p role="status" className="rounded-lg bg-sl-done-soft px-3 py-2 text-sm text-sl-done" data-testid="fellow-registered">{done}</p>}
        </form>

        <section aria-labelledby="my-fellows" className="space-y-2">
          <h2 id="my-fellows" className="text-base font-semibold text-sl-ink">Your Fellows{!isLoading && <span className="font-normal text-sl-muted"> · {fellows.length}</span>}</h2>
          {isLoading ? (
            <SkeletonRows label="Loading Fellows" rows={3} />
          ) : fellows.length === 0 ? (
            <p className={`${PANEL} px-5 py-6 text-sm text-sl-muted`}>No Fellows yet. Register the first one above.</p>
          ) : fellows.map((fellow) => (
            <div key={fellow.id} className={`${PANEL} flex flex-wrap items-center justify-between gap-3 px-5 py-3`} data-testid={`fellow-row-${fellow.id}`}>
              <div className="min-w-0">
                <p className="truncate font-semibold text-sl-ink">{fellow.name}</p>
                <p className="truncate text-sm text-sl-muted">
                  {fellow.email}
                  {fellow.passwordSet === "no" ? " · waiting to create a password" : ""}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-sl-muted">
                <span className="sr-only">Kind of Fellow for {fellow.name}</span>
                <select
                  className={`${FIELD} min-h-11 w-auto`}
                  value={fellowTypeOf(fellow.fellowType)}
                  onChange={(e) => retype.mutate({ id: fellow.id, fellowType: e.target.value as FellowType })}
                  data-testid={`select-fellow-type-${fellow.id}`}
                >
                  {FELLOW_TYPES.map((type) => <option key={type} value={type}>{FELLOW_TYPE_LABELS[type]}</option>)}
                </select>
              </label>
            </div>
          ))}
        </section>
      </div>
    </AcademyShell>
  );
}
