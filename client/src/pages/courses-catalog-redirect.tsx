import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { readSessionUser } from "@/lib/sessionUser";

/** The old Training Courses catalog is gone. Courses are added on the admin Cohorts page. */
export default function CoursesCatalogRedirect() {
  const { user } = useAuth();
  const sessionUser = user || readSessionUser();
  if (sessionUser?.role === "admin") return <Redirect to="/admin/batches" />;
  if (sessionUser?.role === "trainer") return <Redirect to="/trainer/batches" />;
  if (sessionUser?.role === "teacher") return <Redirect to="/teacher/dashboard" />;
  return <Redirect to="/auth" />;
}
