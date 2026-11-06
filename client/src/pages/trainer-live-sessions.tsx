import { AcademyShell } from "@/components/AcademyShell";

/** An instructional Trainer's live sessions: what is on, what is next, and the links for each. */
export default function TrainerLiveSessions() {
  return (
    <AcademyShell title="Live sessions" desk="trainer" current="live-sessions">
      <h1 className="text-[28px] font-semibold text-sl-ink">Live sessions</h1>
    </AcademyShell>
  );
}
