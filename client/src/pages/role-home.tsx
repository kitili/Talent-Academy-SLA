import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { readSessionUser } from "@/lib/sessionUser";
import UnifiedAuth from "@/pages/unified-auth";

export default function RoleHome() {
  const { user } = useAuth();
  const sessionUser = user || readSessionUser();

  if (!sessionUser) {
    return <UnifiedAuth />;
  }

  if (sessionUser.role === "admin") {
    return <Redirect to="/admin" />;
  }

  if (sessionUser.role === "trainer") {
    return <Redirect to="/trainer/batches" />;
  }

  if (sessionUser.role === "teacher") {
    return <Redirect to="/teacher/dashboard" />;
  }

  return <Redirect to="/courses" />;
}
