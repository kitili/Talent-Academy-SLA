import { parseFellowType, parseTrainerType } from "./academyPeople";

export type RequestedRole = "trainer" | "teacher";

export type AccessRequest = {
  name: string;
  username: string;
  email: string;
  role: RequestedRole;
  /** A Fellow's `fellowType` or a Trainer's `trainerType`; in-house when the form leaves it out. */
  type: string;
};

export type DeskState = "unknown" | "pending" | "approved" | "needs_password" | "rejected" | "inactive";

const USERNAME = /^[a-zA-Z0-9._-]{3,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAccessRequest(body: unknown): AccessRequest | { error: string } {
  const value = (body || {}) as { name?: unknown; username?: unknown; email?: unknown; role?: unknown; type?: unknown; fellowType?: unknown; trainerType?: unknown };
  const role = String(value.role || "").trim().toLowerCase();
  if (role !== "trainer" && role !== "teacher") return { error: "Choose trainer or teacher" };
  const name = String(value.name || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { error: "Add your name" };
  const username = String(value.username || "").trim();
  if (!USERNAME.test(username)) return { error: "Username needs 3 to 40 letters or numbers" };
  const email = String(value.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Add a valid email" };
  const chosen = role === "teacher" ? parseFellowType(value.fellowType ?? value.type) : parseTrainerType(value.trainerType ?? value.type);
  if (!chosen) return { error: role === "teacher" ? "Choose in-house or pre-service" : "Choose in-house or instructional" };
  return { name, username, email, role, type: chosen };
}

export function parsePasswordSetup(body: unknown): { identifier: string; role: RequestedRole; password: string } | { error: string } {
  const value = (body || {}) as { identifier?: unknown; username?: unknown; role?: unknown; password?: unknown };
  const role = String(value.role || "").trim().toLowerCase();
  if (role !== "trainer" && role !== "teacher") return { error: "Choose trainer or teacher" };
  const identifier = String(value.identifier || value.username || "").trim();
  if (identifier.length < 3) return { error: "Add the username or email you requested with" };
  // Sign-in trims the password, so setup stores the trimmed one. Otherwise a stray space locks the person out.
  const password = String(value.password || "").trim();
  if (password.length < 6) return { error: "Password needs at least 6 characters" };
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
  if (state === "pending") return "An admin still needs to approve this desk. You can create a password after that.";
  if (state === "needs_password") return "Your desk is approved. Create your password, then sign in with it.";
  if (state === "rejected") return "This request was turned away.";
  if (state === "inactive") return "This desk is inactive.";
  return null;
}
