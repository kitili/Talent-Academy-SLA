import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import UnifiedAuth from "@/pages/unified-auth";

export default function RoleHome() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return <UnifiedAuth />;
  }

  if (user.role === "admin") {
    return <Redirect to="/admin" />;
  }

  if (user.role === "trainer") {
    return <Redirect to="/trainer/batches" />;
  }

  if (user.role === "teacher") {
    return <Redirect to="/teacher/dashboard" />;
  }

  return <Redirect to="/courses" />;
}
