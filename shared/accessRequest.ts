export type RequestedRole = "trainer" | "teacher";

export type AccessRequest = {
  name: string;
  username: string;
  email: string;
  role: RequestedRole;
};

export type DeskState = "unknown" | "pending" | "approved" | "needs_password" | "rejected" | "inactive";

const USERNAME = /^[a-zA-Z0-9._-]{3,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAccessRequest(body: unknown): AccessRequest | { error: string } {
  const value = (body || {}) as { name?: unknown; username?: unknown; email?: unknown; role?: unknown };
  const role = String(value.role || "").trim().toLowerCase();
  if (role !== "trainer" && role !== "teacher") return { error: "Choose trainer or teacher" };
  const name = String(value.name || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { error: "Add your name" };
  const username = String(value.username || "").trim();
  if (!USERNAME.test(username)) return { error: "Username needs 3 to 40 letters or numbers" };
  const email = String(value.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Add a valid email" };
  return { name, username, email, role };
}

export function parsePasswordSetup(body: unknown): { identifier: string; role: RequestedRole; password: string } | { error: string } {
  const value = (body || {}) as { identifier?: unknown; username?: unknown; role?: unknown; password?: unknown };
  const role = String(value.role || "").trim().toLowerCase();
  if (role !== "trainer" && role !== "teacher") return { error: "Choose trainer or teacher" };
  const identifier = String(value.identifier || value.username || "").trim();
  if (identifier.length < 3) return { error: "Add the username or email you requested with" };
  const password = String(value.password || "");
  if (password.trim().length < 6) return { error: "Password needs at least 6 characters" };
  return { identifier, role, password };
}

export function deskState(account: { approvalStatus?: string | null; passwordSet?: string | null } | null | undefined): DeskState {
  if (!account) return "unknown";
  const status = account.approvalStatus || "pending";
  if (status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  if (status === "inactive") return "inactive";
  if (status === "approved" && account.passwordSet === "no") return "needs_password";
  if (status === "approved") return "approved";
  return "unknown";
}

export function signInMessage(state: DeskState) {
  if (state === "pending") return "An admin still needs to sign this desk in. You can create a password after that.";
  if (state === "needs_password") return "Your desk is signed in. Create your password, then sign in with it.";
  if (state === "rejected") return "This request was turned away.";
  if (state === "inactive") return "This desk is inactive.";
  return null;
}
