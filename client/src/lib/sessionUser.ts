const KEY = "sl-user";

export function readSessionUser(): any | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function persistSessionUser(user: unknown) {
  try {
    if (user) sessionStorage.setItem(KEY, JSON.stringify(user));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearSessionUser() {
  persistSessionUser(null);
}

export function homeForRole(role?: string) {
  if (role === "teacher") return "/teacher/dashboard";
  if (role === "admin") return "/admin";
  return "/trainer/batches";
}

// Who is signed in, as the gates see it. Until the server answers /api/user, `user` may be the stored user: a
// placeholder that can draw a page but never moves anyone. Only the server's answer redirects.
export type SignInView = { answered: boolean; user: { role?: string } | null | undefined };

/** Where the sign-in page (and `/`) sends a visitor the server says is signed in; null to stay. */
export function signInRedirect({ answered, user }: SignInView): string | null {
  return answered && user?.role ? homeForRole(user.role) : null;
}

/** Where a protected page sends a visitor the server says is signed out; null to stay. */
export function protectedRedirect({ answered, user }: SignInView): string | null {
  return answered && !user ? "/auth" : null;
}
