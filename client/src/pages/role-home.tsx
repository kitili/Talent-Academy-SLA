import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { OpeningClassroom } from "@/lib/protected-route";
import { signInRedirect } from "@/lib/sessionUser";
import UnifiedAuth from "@/pages/unified-auth";

export default function RoleHome() {
  const { user, isLoading } = useAuth();
  const redirect = signInRedirect({ answered: !isLoading, user });

  if (redirect) {
    return <Redirect to={redirect} />;
  }

  // A stored user only means someone was signed in on this tab: wait for the server before drawing the sign-in form.
  if (isLoading && user) {
    return <OpeningClassroom />;
  }

  return <UnifiedAuth />;
}
