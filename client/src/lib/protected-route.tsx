import { useAuth } from "@/hooks/use-auth";
import { readSessionUser } from "@/lib/sessionUser";
import { Redirect, Route } from "wouter";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const { user, isLoading } = useAuth();
  const sessionUser = user || readSessionUser();

  if (sessionUser) {
    return <Route path={path} component={Component} />;
  }

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex min-h-screen flex-col items-center justify-center bg-primary text-white gap-3 px-6 text-center">
          <p className="text-xl font-semibold">Silverleaf Academy</p>
          <p className="text-white/90">Opening your classroom…</p>
        </div>
      </Route>
    );
  }

  return (
    <Route path={path}>
      <Redirect to="/auth" />
    </Route>
  );
}
