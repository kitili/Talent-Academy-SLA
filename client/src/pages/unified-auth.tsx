import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { homeForRole, persistSessionUser, signInRedirect } from "@/lib/sessionUser";
import { Shield, GraduationCap, Users, Eye, EyeOff } from "lucide-react";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";

type Role = "admin" | "trainer" | "teacher";

const DESK_REQUEST_KEY = "sl-desk-request";

interface MultiRoleOption {
  id: string;
  role: Role;
  name: string;
}

const SilverleafLogo = ({ className = "h-9 w-auto" }: { className?: string }) => (
  <img src={logoImage} alt="" className={className} />
);

const fieldClass =
  "min-h-11 w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sl-accent";
const labelClass = "text-sm font-semibold text-sl-ink";
const hintClass = "text-[13px] text-sl-muted";
const primaryClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-sl-accent-strong px-4 py-2.5 text-[15px] font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sl-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sl-surface disabled:opacity-60";
const secondaryClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-4 py-2.5 text-[15px] font-semibold text-sl-ink hover:bg-sl-neutral-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sl-accent";
const linkClass =
  "inline-flex min-h-11 items-center font-semibold text-sl-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sl-accent rounded";

export default function UnifiedAuth() {
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  // Login state
  const [loginRole, setLoginRole] = useState<Role>("admin");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "request" | "password">("sign-in");
  const [passwordReady, setPasswordReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestUsername, setRequestUsername] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestSent, setRequestSent] = useState(false);

  // Multi-role selection state
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<MultiRoleOption[]>([]);
  const [selectingRole, setSelectingRole] = useState(false);

  useEffect(() => {
    const redirect = signInRedirect({ answered: !isLoading, user });
    if (redirect && !showRolePicker) {
      setLocation(redirect);
    }
  }, [user, isLoading, showRolePicker, setLocation]);

  useEffect(() => {
    const raw = localStorage.getItem(DESK_REQUEST_KEY);
    if (!raw) return;
    let saved: { username?: string; role?: string } = {};
    try {
      saved = JSON.parse(raw);
    } catch {
      return;
    }
    const role = saved.role === "teacher" || saved.role === "trainer" ? saved.role : null;
    const username = (saved.username || "").trim();
    if (!role || username.length < 3) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/access-requests/status?identifier=${encodeURIComponent(username)}&role=${role}`,
        );
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (data.code === "needs_password") {
          setPasswordReady(true);
          setLoginRole(role);
          setLoginEmail(username);
          setMode("password");
          return;
        }
        if (data.code === "approved") localStorage.removeItem(DESK_REQUEST_KEY);
      } catch {
        // Stay on sign-in until the next refresh can reach the academy.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle role selection when multiple roles are available
  const handleRoleSelection = async (selectedRole: MultiRoleOption) => {
    setSelectingRole(true);
    
    try {
      const response = await fetch("/api/login/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          roleId: selectedRole.id, 
          role: selectedRole.role 
        }),
        credentials: "include",
      });

      if (response.ok) {
        const user = await response.json();
        setShowRolePicker(false);
        
        persistSessionUser(user);
        queryClient.setQueryData(["/api/user"], user);
        if (user.role === "teacher") {
          queryClient.setQueryData(["/api/teacher/me"], user);
        }

        toast({
          title: "Welcome!",
          description: `Successfully logged in as ${selectedRole.role}`,
        });
        setLocation(homeForRole(user.role || selectedRole.role));
      } else {
        const data = await response.json();
        toast({
          variant: "destructive",
          title: "Login failed",
          description: data.message || "Could not complete login",
        });
        setShowRolePicker(false);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred during role selection",
      });
      setShowRolePicker(false);
    } finally {
      setSelectingRole(false);
    }
  };

  // Handle login - now uses unified endpoint for all roles
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      // Use unified login endpoint for all roles
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginEmail,
          password: loginPassword,
          role: loginRole,
        }),
        credentials: "include",
        signal: AbortSignal.timeout(20000),
      });

      let data: { message?: string; code?: string; multiRole?: boolean; roles?: MultiRoleOption[]; role?: Role } = {};
      try {
        data = await response.json();
      } catch {
        data = { message: "The academy could not start. Try again in a moment." };
      }

      if (response.ok) {
        // Check if multiple roles are available
        if (data.multiRole) {
          setAvailableRoles(data.roles || []);
          setShowRolePicker(true);
          setLoginLoading(false);
          return;
        }
        
        const signedInRole = data.role as Role;
        if (signedInRole !== loginRole) {
          toast({
            variant: "destructive",
            title: "Incorrect password",
            description: "Use the username and password for the role you selected.",
          });
          setLoginLoading(false);
          return;
        }
        persistSessionUser(data);
        queryClient.setQueryData(["/api/user"], data);
        if (signedInRole === "teacher") {
          queryClient.setQueryData(["/api/teacher/me"], data);
        }

        toast({
          title: "Welcome!",
          description: `Successfully logged in as ${signedInRole}`,
        });
        setLoginLoading(false);
        setLocation(homeForRole(signedInRole));
      } else {
        if (data.code === "needs_password") {
          const role = loginRole === "teacher" ? "teacher" : "trainer";
          setPasswordReady(true);
          setLoginRole(role);
          localStorage.setItem(DESK_REQUEST_KEY, JSON.stringify({ username: loginEmail.trim(), role }));
          setMode("password");
        }
        toast({
          variant: "destructive",
          title: response.status >= 500 ? "Sign-in unavailable" : data.code === "pending" ? "Waiting for an admin" : "Sign-in stopped",
          description: data.message || "Invalid username or password",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred during login",
      });
    } finally {
      setLoginLoading(false);
    }
  };

  const openMode = (next: "sign-in" | "request" | "password") => {
    setMode(next);
    setRequestSent(false);
    if (next !== "sign-in" && loginRole === "admin") setLoginRole("trainer");
  };

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: requestName,
          username: requestUsername,
          email: requestEmail,
          role: loginRole,
        }),
      });
      const data = await response.json().catch(() => ({}));
      const role = loginRole === "teacher" ? "teacher" : "trainer";
      if (data.code === "needs_password") {
        localStorage.setItem(DESK_REQUEST_KEY, JSON.stringify({ username: requestUsername.trim(), role }));
        setPasswordReady(true);
        setLoginEmail(requestUsername.trim());
        setLoginRole(role);
        openMode("password");
        toast({ title: "Already signed in", description: data.message });
        return;
      }
      if (!response.ok) {
        toast({ variant: "destructive", title: "Request not saved", description: data.message || "Try again" });
        return;
      }
      localStorage.setItem(DESK_REQUEST_KEY, JSON.stringify({ username: requestUsername.trim(), role }));
      setRequestSent(true);
      toast({ title: "Request sent", description: "Refresh this page after an admin approves you. Create your password will appear then." });
    } catch {
      toast({ variant: "destructive", title: "Request not saved", description: "Try again in a moment." });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCreatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginLoading(true);
    try {
      const response = await fetch("/api/access-requests/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: loginEmail,
          role: loginRole,
          password: loginPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast({ variant: "destructive", title: "Password not saved", description: data.message || "Try again" });
        return;
      }
      setLoginPassword("");
      localStorage.removeItem(DESK_REQUEST_KEY);
      setPasswordReady(false);
      openMode("sign-in");
      toast({ title: "Password saved", description: "Sign in with it." });
    } catch {
      toast({ variant: "destructive", title: "Password not saved", description: "Try again in a moment." });
    } finally {
      setLoginLoading(false);
    }
  };

  const roleCards = [
    { value: "admin", title: "Admin", note: "Runs the academy" },
    { value: "trainer", title: "Trainer", note: "I coach cohorts" },
    { value: "teacher", title: "Fellow", note: "I learn in a cohort" },
  ];

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case 'admin': return Shield;
      case 'trainer': return Users;
      case 'teacher': return GraduationCap;
    }
  };

  const getRoleDescription = (role: Role) => {
    switch (role) {
      case 'admin': return 'Full system access and user management';
      case 'trainer': return 'Leads cohorts and assessments';
      case 'teacher': return 'Takes courses and quizzes';
    }
  };

  const deskName = loginRole === "teacher" ? "Fellow" : "Trainer";

  const heading =
    mode === "request"
      ? { title: "Request a desk", line: "An Admin reads every request. No password yet: you set it after approval." }
      : mode === "password"
        ? { title: "Create your password", line: "An Admin approved your desk. Create your password, then sign in." }
        : { title: "Sign in", line: "Admins, Trainers and Fellows all sign in here." };

  const passwordField = (id: string, label: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>{label}</label>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-sl-control bg-sl-surface focus-within:ring-2 focus-within:ring-sl-accent">
        <input
          id={id}
          data-testid="input-login-password"
          type={showPassword ? "text" : "password"}
          autoComplete={mode === "password" ? "new-password" : "current-password"}
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
          required
          className="min-h-11 min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] text-sl-ink focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowPassword((shown) => !shown)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          aria-controls={id}
          data-testid="button-toggle-password"
          className="flex w-11 shrink-0 items-center justify-center border-l border-sl-line text-sl-neutral hover:bg-sl-neutral-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sl-accent"
        >
          {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

  const deskChoice = (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className={`${labelClass} mb-2 p-0`}>I am a…</legend>
      <div className="flex flex-wrap gap-2.5">
        {roleCards.filter((role) => role.value !== "admin").map((role) => {
          const isSelected = loginRole === role.value;
          return (
            <label
              key={role.value}
              htmlFor={`role-${role.value}`}
              className={`flex min-h-11 flex-1 basis-40 cursor-pointer flex-col gap-1 rounded-lg border px-3.5 py-3 focus-within:ring-2 focus-within:ring-sl-accent ${isSelected ? "border-sl-accent bg-sl-accent-soft" : "border-sl-control bg-sl-surface"}`}
            >
              <span className="flex items-center gap-2.5 text-[15px] font-semibold text-sl-ink">
                <input
                  id={`role-${role.value}`}
                  type="radio"
                  name="role"
                  value={role.value}
                  checked={isSelected}
                  onChange={() => setLoginRole(role.value as Role)}
                  data-testid={`radio-${role.value}`}
                  className="m-0 h-[18px] w-[18px] accent-[rgb(var(--sl-accent-strong))]"
                />
                {role.title}
              </span>
              <span className="pl-7 text-[13px] text-sl-muted">{role.note}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  const approvedNotice = passwordReady && mode !== "password" && (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sl-line bg-sl-accent-soft px-3.5 py-2 text-sm text-sl-ink">
      <span>An Admin approved your desk.</span>
      <button type="button" className={linkClass} onClick={() => openMode("password")} data-testid="button-mode-password">
        Create your password
      </button>
    </div>
  );

  const submitLabel = loginLoading ? (
    <>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      Please wait...
    </>
  ) : mode === "request" ? "Send request" : mode === "password" ? "Save password" : "Sign in";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-sl-ground px-4 py-12 text-sl-ink sm:py-16">
      {/* Multi-role picker dialog */}
      <Dialog open={showRolePicker} onOpenChange={setShowRolePicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Select Your Role</DialogTitle>
            <DialogDescription>
              This email has multiple roles. Choose which one to use for this session.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {availableRoles.map((roleOption) => {
              const Icon = getRoleIcon(roleOption.role);
              return (
                <button
                  key={`${roleOption.role}-${roleOption.id}`}
                  onClick={() => handleRoleSelection(roleOption)}
                  disabled={selectingRole}
                  data-testid={`select-role-${roleOption.role}`}
                  className="flex min-h-11 items-center gap-4 rounded-lg border border-sl-control p-4 text-left hover:border-sl-accent hover:bg-sl-accent-soft disabled:opacity-50"
                >
                  <div className="rounded-lg bg-sl-accent-soft p-3 text-sl-accent">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold capitalize text-sl-ink">{roleOption.role}</div>
                    <div className="text-sm text-sl-muted">{roleOption.name}</div>
                    <div className="mt-1 text-xs text-sl-muted">
                      {getRoleDescription(roleOption.role)}
                    </div>
                  </div>
                  {selectingRole && (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-sl-accent/30 border-t-sl-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3">
        <SilverleafLogo />
        <span className="text-lg font-semibold">Silverleaf Academy</span>
      </div>

      <main className={`flex w-full flex-col gap-6 rounded-xl border border-sl-line bg-sl-surface p-6 sm:px-8 sm:pb-7 sm:pt-8 ${mode === "sign-in" ? "max-w-[420px]" : "max-w-[480px]"}`}>
        {mode === "request" && requestSent ? (
          <section aria-labelledby="request-sent-title" className="flex flex-col gap-3.5" data-testid="text-request-sent">
            <span className="self-start rounded-full bg-sl-neutral-soft px-2.5 py-[3px] text-xs font-semibold text-sl-neutral">Waiting for an Admin</span>
            <h1 id="request-sent-title" className="m-0 text-[28px] font-semibold leading-tight">Request sent</h1>
            <p className="m-0 text-[15px] leading-relaxed">
              Thank you, {requestName.trim()}. We sent your request for a {deskName} desk to the Admin.
            </p>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {[
                "An Admin approves or declines your request.",
                "If it is approved, you set your own password.",
                "Then you sign in and go straight to your desk.",
              ].map((text, index) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sl-neutral-soft text-[13px] font-semibold text-sl-neutral">{index + 1}</span>
                  <span className="text-sm leading-relaxed text-sl-neutral">{text}</span>
                </li>
              ))}
            </ol>
            <p className={`m-0 ${hintClass}`}>When you are approved, open this page again. It asks you to create your password.</p>
            <button type="button" className={`${secondaryClass} self-start sm:w-auto`} onClick={() => openMode("sign-in")} data-testid="button-mode-signin">
              Back to sign in
            </button>
          </section>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="m-0 text-[28px] font-semibold leading-tight">{heading.title}</h1>
              <p className="m-0 text-[15px] leading-relaxed text-sl-muted">{heading.line}</p>
            </div>

            {approvedNotice}

            <form
              aria-label={heading.title}
              onSubmit={mode === "request" ? handleRequest : mode === "password" ? handleCreatePassword : handleLogin}
              className="flex flex-col gap-[18px]"
            >
              {mode === "sign-in" ? (
                <div role="radiogroup" aria-labelledby="signin-as" className="flex flex-col gap-1.5">
                  <span id="signin-as" className={labelClass}>Sign in as</span>
                  <div className="grid grid-cols-3 gap-2">
                    {roleCards.map((role) => {
                      const isSelected = loginRole === role.value;
                      return (
                        <button
                          key={role.value}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setLoginRole(role.value as Role)}
                          data-testid={`radio-${role.value}`}
                          className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sl-accent ${isSelected ? "border-sl-accent bg-sl-accent-soft text-sl-accent" : "border-sl-control bg-sl-surface text-sl-ink hover:bg-sl-neutral-soft"}`}
                        >
                          {role.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                deskChoice
              )}

              {mode === "request" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="request-name" className={labelClass}>Full name</label>
                    <input id="request-name" data-testid="input-request-name" type="text" autoComplete="name" value={requestName} onChange={(e) => setRequestName(e.target.value)} required className={fieldClass} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="request-email" className={labelClass}>Email</label>
                    <input id="request-email" data-testid="input-request-email" type="email" autoComplete="email" aria-describedby="request-email-hint" value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} required className={fieldClass} />
                    <span id="request-email-hint" className={hintClass}>Use the email you will sign in with.</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="request-username" className={labelClass}>Username</label>
                    <input id="request-username" data-testid="input-request-username" type="text" autoComplete="username" aria-describedby="request-username-hint" value={requestUsername} onChange={(e) => setRequestUsername(e.target.value)} required className={fieldClass} />
                    <span id="request-username-hint" className={hintClass}>3 to 40 letters or numbers. You can also sign in with it.</span>
                  </div>
                </>
              )}

              {mode !== "request" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-email" className={labelClass}>Email or username</label>
                  <input
                    id="login-email"
                    data-testid="input-login-email"
                    type="text"
                    autoComplete="username"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className={fieldClass}
                  />
                </div>
              )}

              {mode !== "request" && passwordField("login-password", mode === "password" ? "New password" : "Password")}

              <button
                type="submit"
                className={primaryClass}
                disabled={loginLoading}
                data-testid={mode === "request" ? "button-submit-request" : mode === "password" ? "button-save-password" : "button-login"}
              >
                {submitLabel}
              </button>

              {mode === "sign-in" && (
                <p className="m-0 text-sm text-sl-muted">Forgot your password? Ask your Admin to reset it.</p>
              )}
            </form>

            {mode === "sign-in" ? (
              <>
                <div className="h-px bg-sl-line" />
                <div className="flex flex-col gap-2.5">
                  <p className="m-0 text-sm text-sl-muted">New to the academy? Ask for a Trainer or Fellow desk. An Admin approves it.</p>
                  <button type="button" className={secondaryClass} onClick={() => openMode("request")} data-testid="button-mode-request">
                    Request a desk
                  </button>
                </div>
              </>
            ) : (
              <p className="m-0 text-sm text-sl-muted">
                {mode === "request" ? "Already have a desk? " : ""}
                <button type="button" className={linkClass} onClick={() => openMode("sign-in")} data-testid="button-mode-signin">
                  {mode === "request" ? "Sign in" : "Back to sign in"}
                </button>
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
