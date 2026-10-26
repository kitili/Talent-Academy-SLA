import { useAuth } from "@/hooks/use-auth";
import { protectedRedirect } from "@/lib/sessionUser";
import { Redirect, Route } from "wouter";

export function OpeningClassroom() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary text-white gap-3 px-6 text-center">
      <p className="text-xl font-semibold">Silverleaf Academy</p>
      <p className="text-white/90">Opening your classroom…</p>
    </div>
  );
}

export function ProtectedRoute({
  path,
  component: Component,
  match,
  nest,
}: {
  path: string;
  component: () => React.JSX.Element;
  match?: any;
  nest?: boolean;
}) {
  const { user, isLoading } = useAuth();
  const redirect = protectedRedirect({ answered: !isLoading, user });

  if (redirect) {
    return (
      <Route path={path} match={match} nest={nest}>
        <Redirect to={redirect} />
      </Route>
    );
  }

  // `user` is the server's answer, or the stored placeholder while that answer is on its way.
  if (user) {
    return <Route path={path} match={match} nest={nest} component={Component} />;
  }

  return (
    <Route path={path} match={match} nest={nest}>
      <OpeningClassroom />
    </Route>
  );
}
