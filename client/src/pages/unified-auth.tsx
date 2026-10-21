import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { homeForRole, persistSessionUser, readSessionUser } from "@/lib/sessionUser";
import { Shield, GraduationCap, Users, Mail } from "lucide-react";
import { PLACES, type PlaceName } from "@/components/PlaceArt";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";

type Role = "admin" | "trainer" | "teacher";

const DESK_REQUEST_KEY = "sl-desk-request";

interface MultiRoleOption {
  id: string;
  role: Role;
  name: string;
}

const SilverleafLogo = ({ className = "w-12 h-12" }: { className?: string }) => (
  <img src={logoImage} alt="Silverleaf Academy" className={className} />
);

export default function UnifiedAuth() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  
  // Login state
  const [loginRole, setLoginRole] = useState<Role>("admin");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "request" | "password">("sign-in");
  const [passwordReady, setPasswordReady] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestUsername, setRequestUsername] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestSent, setRequestSent] = useState(false);

  // Multi-role selection state
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<MultiRoleOption[]>([]);
  const [selectingRole, setSelectingRole] = useState(false);

  useEffect(() => {
    const signedIn = user || readSessionUser();
    if (signedIn?.role && !showRolePicker) {
      setLocation(homeForRole(signedIn.role));
    }
  }, [user, showRolePicker, setLocation]);

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
      toast({ title: "Request sent", description: "Refresh this page after an admin signs you in. Create your password will appear then." });
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
    {
      value: "admin",
      icon: Shield,
      title: "Admin",
      description: "System administrator",
      gradient: "from-primary to-primary"
    },
    {
      value: "trainer",
      icon: Users,
      title: "Trainer",
      description: "Coaching adult teachers",
      gradient: "from-primary to-primary"
    },
    {
      value: "teacher",
      icon: GraduationCap,
      title: "Teacher",
      description: "Adult teacher in training",
      gradient: "from-primary to-primary"
    }
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
      case 'trainer': return 'Coach batches of adult teachers';
      case 'teacher': return 'Prepare to teach young pupils';
    }
  };

  const scenes: Record<Role, { src: string; line: string; place: PlaceName }> = {
    admin: { src: "/bg-library.jpg", line: "The library is open", place: "library" },
    trainer: { src: "/bg-hall.jpg", line: "The hall is open", place: "hall" },
    teacher: { src: "/bg-garden.jpg", line: "For adult teachers", place: "garden" },
  };
  const scene = scenes[loginRole];

  return (
    <div className="relative min-h-screen">
      <img key={scene.src} src={scene.src} alt="" className="pointer-events-none fixed inset-0 h-full w-full object-cover object-center" decoding="async" />
      <div className="fixed inset-0 bg-[#102448]/20" />
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
                  className="flex items-center gap-4 p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all duration-200 text-left disabled:opacity-50"
                >
                  <div className="p-3 rounded-lg bg-primary text-primary-foreground">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold capitalize">{roleOption.role}</div>
                    <div className="text-sm text-muted-foreground">{roleOption.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {getRoleDescription(roleOption.role)}
                    </div>
                  </div>
                  {selectingRole && (
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative z-10 flex min-h-screen items-end justify-center px-4 py-6 sm:items-center">
        <div className="w-full max-w-md">
          <Card className="w-full rounded-[1.75rem] border-0 bg-white/95 text-center shadow-2xl backdrop-blur">
              <CardHeader className="pb-2 pt-6 text-center">
                <div className="mb-3 flex items-center justify-center gap-3">
                  <SilverleafLogo className="h-12 w-12" />
                  <div className="text-left">
                    <p className="text-lg font-bold text-[#102448]">Silverleaf Academy</p>
                    <p className="text-sm text-muted-foreground">{scene.line}</p>
                  </div>
                </div>
                <CardTitle className="text-2xl font-bold">Come in</CardTitle>
                <CardDescription>
                  {passwordReady
                    ? "An admin signed you in. Create your password, then sign in."
                    : "Sign in, or ask for a trainer or teacher desk."}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="px-4 sm:px-6">
                    <div className={`mb-4 grid gap-2 text-[11px] font-semibold leading-tight ${passwordReady ? "grid-cols-3" : "grid-cols-2"}`}>
                      <button type="button" className={`rounded-full px-2 py-2 ${mode === "sign-in" ? "bg-[#102448] text-white" : "bg-[#f4eadc] text-[#102448]"}`} onClick={() => openMode("sign-in")} data-testid="button-mode-signin">Sign in</button>
                      <button type="button" className={`rounded-full px-2 py-2 ${mode === "request" ? "bg-[#102448] text-white" : "bg-[#f4eadc] text-[#102448]"}`} onClick={() => openMode("request")} data-testid="button-mode-request">Request a desk</button>
                      {passwordReady && (
                        <button type="button" className={`rounded-full px-2 py-2 ${mode === "password" ? "bg-[#102448] text-white" : "bg-[#f4eadc] text-[#102448]"}`} onClick={() => openMode("password")} data-testid="button-mode-password">Create your password</button>
                      )}
                    </div>
                    <form onSubmit={mode === "request" ? handleRequest : mode === "password" ? handleCreatePassword : handleLogin} className="space-y-4 sm:space-y-6">
                      {/* Role Selection Cards */}
                      <div className={`grid gap-2 ${mode === "sign-in" ? "grid-cols-3" : "grid-cols-2"}`}>
                        {roleCards.filter((role) => mode === "sign-in" || role.value !== "admin").map((role) => {
                          const isSelected = loginRole === role.value;
                          const place = scenes[role.value as Role].place;
                          return (
                            <button
                              key={role.value}
                              type="button"
                              onClick={() => setLoginRole(role.value as Role)}
                              data-testid={`radio-${role.value}`}
                              className={`overflow-hidden rounded-2xl border text-left transition ${
                                isSelected ? "border-[#102448] ring-2 ring-[#102448]" : "border-transparent hover:border-[#102448]/30"
                              }`}
                            >
                              <img src={PLACES[place]} alt="" className="h-16 w-full object-cover sm:h-20" />
                              <span className={`block px-2 py-1.5 text-center ${isSelected ? "bg-[#102448] text-white" : "bg-[#f4eadc] text-[#102448]"}`}>
                                <span className="block text-sm font-semibold">{role.title}</span>
                                <span className="mt-0.5 block text-[10px] leading-tight opacity-80">{role.description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {mode === "request" && (
                        <div className="space-y-2 text-left">
                          <Label htmlFor="request-name">Name</Label>
                          <Input id="request-name" data-testid="input-request-name" value={requestName} onChange={(e) => setRequestName(e.target.value)} required placeholder="Your name" className="h-12 bg-card border-2" />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="login-email">
                          {mode === "request" ? "Username" : loginRole === "teacher" ? "Username, teacher ID, or email" : "Username or email"}
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                          <Input
                            id="login-email"
                            data-testid={mode === "request" ? "input-request-username" : "input-login-email"}
                            type="text"
                            autoComplete="username"
                            placeholder="Username or email"
                            value={mode === "request" ? requestUsername : loginEmail}
                            onChange={(e) => mode === "request" ? setRequestUsername(e.target.value) : setLoginEmail(e.target.value)}
                            required
                            className="pl-10 h-12 text-sm sm:text-base bg-card border-2 text-[#17233c]"
                          />
                        </div>
                      </div>

                      {mode === "request" && (
                        <div className="space-y-2 text-left">
                          <Label htmlFor="request-email">Email</Label>
                          <Input id="request-email" data-testid="input-request-email" type="email" value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} required placeholder="name@school.com" className="h-12 bg-card border-2 text-[#17233c]" />
                        </div>
                      )}

                      {mode !== "request" && <div className="space-y-2">
                        <Label htmlFor="login-password">{mode === "password" ? "New password" : "Password"}</Label>
                        <div className="relative">
                          <PasswordInput
                            id="login-password"
                            data-testid="input-login-password"
                            autoComplete="current-password"
                            placeholder="Password"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            required
                            className="h-12 text-sm sm:text-base bg-card border-2"
                          />
                        </div>
                      </div>}

                      <Button 
                        type="submit" 
                        size="lg"
                        className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 transition-all duration-300 hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]" 
                        disabled={loginLoading}
                        data-testid={mode === "request" ? "button-submit-request" : mode === "password" ? "button-save-password" : "button-login"}
                      >
                        {loginLoading ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span className="text-sm sm:text-base">Please wait...</span>
                          </span>
                        ) : mode === "request" ? (
                          "Ask to be signed in"
                        ) : mode === "password" ? (
                          "Save password"
                        ) : (
                          "Sign In"
                        )}
                      </Button>

                      {mode === "request" && (
                        <p className="text-left text-xs text-[#3a4a60]">Trainer and teacher desks. An admin signs you in from Approvals.</p>
                      )}
                      {requestSent && mode === "request" && (
                        <p className="text-left text-sm text-[#17233c]" data-testid="text-request-sent">
                          Request sent. Refresh this page after an admin signs you in. Create your password will appear then.
                        </p>
                      )}
                      {mode === "password" && (
                        <p className="text-left text-xs text-[#3a4a60]">Use the username or email from your request. This stays closed until an admin signs you in.</p>
                      )}
                    </form>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
