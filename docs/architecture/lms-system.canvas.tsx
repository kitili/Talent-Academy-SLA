export default function LmsSystemCanvas() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="text-3xl font-bold">Talent Academy — where we are</h1>
      <p className="mt-2 text-slate-600">
        Same LMS as before. Live at talent-academy-sla.vercel.app. PDF items 1–5 are in the product.
        We did not have ERDs or DFDs until this pack. Database is one Postgres, tables grouped as ops areas.
      </p>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <Card title="Done">
          PDF completion, quizzes, unlock path, Vercel, teacher list + progress metrics, Supabase SQL pack, data catalog.
        </Card>
        <Card title="Now">
          11 teachers on live Neon. App prefers SUPABASE_DATABASE_URL. You still create the Supabase project and paste the URI.
        </Card>
        <Card title="Docs">
          docs/architecture/STATUS.md · erd.md · dfd.md · workflow.md · docs/ops/*
        </Card>
      </section>

      <h2 className="mt-10 text-xl font-semibold">Workflow (system + PDF)</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6">
        <li>Admin/trainer sign in → create course (any length, not 5 weeks) — PDF 4</li>
        <li>Upload PPTX → auto quiz or write questions — PDF 2</li>
        <li>Assign course to batch → enroll teachers</li>
        <li>Teacher opens week 1 only; week 2 locked until quiz passed — PDF 5</li>
        <li>Pass writes report card; admin sees named completion, not At Risk — PDF 1 + 3</li>
      </ol>

      <h2 className="mt-10 text-xl font-semibold">Database look</h2>
      <p className="mt-2 text-sm text-slate-600">
        public.users / teachers / batches / courses / training_weeks / quizzes / progress / certificates.
        ops.catalog lists each table as identity, onboarding, learning, classroom, communications, marketing, or security.
      </p>
      <pre className="mt-4 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{`
users ──┬── batches ── batch_teachers ── teachers
        └── batch_courses ── courses ── training_weeks ── quiz_cache
                                              │
                         teacher_content_progress + quiz_attempts
                                              │
                         teacher_course_completion → admin dashboard
`}</pre>
    </div>
  );
}

function Card({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
    </div>
  );
}
