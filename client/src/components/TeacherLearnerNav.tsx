import { DeskPhoneBar, useInsideShell } from "@/components/AcademyShell";

/**
 * The Fellow's phone bar for pages that are not yet inside AcademyShell: Home, Learning, Work, Messages and More
 * (design/board/FellowPhone.dc.html). Inside the shell it draws nothing, because the shell draws the same bar.
 */
export function TeacherLearnerNav() {
  const insideShell = useInsideShell();
  if (insideShell) return null;
  return <DeskPhoneBar desk="fellow" />;
}
