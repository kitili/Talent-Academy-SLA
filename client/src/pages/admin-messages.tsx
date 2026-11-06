import { AcademyShell } from "@/components/AcademyShell";

/** The Admin's desk mail with Trainers and Fellows. */
export default function AdminMessages() {
  return (
    <AcademyShell title="Messages" desk="admin" current="messages">
      <h1 className="text-[28px] font-semibold text-sl-ink">Messages</h1>
    </AcademyShell>
  );
}
