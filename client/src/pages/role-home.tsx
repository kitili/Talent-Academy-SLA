import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function RoleHome() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
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
