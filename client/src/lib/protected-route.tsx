import { useAuth } from "@/hooks/use-auth";
import { protectedRedirect } from "@/lib/sessionUser";
import { Redirect, Route } from "wouter";
import { PageSkeleton } from "@/components/Skeletons";

/** Before the sign-in check answers: the page in grey outline, never a coloured splash or "Opening…" text. */
export function OpeningClassroom() {
  return <PageSkeleton />;
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
