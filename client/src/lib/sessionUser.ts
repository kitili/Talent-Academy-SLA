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
