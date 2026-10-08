import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { homeForRole, persistSessionUser, readSessionUser } from "@/lib/sessionUser";
import { Shield, GraduationCap, Users, Mail } from "lucide-react";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";

type Role = "admin" | "trainer" | "teacher";
type AccountType = "teacher" | "trainer";

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
  
  // Registration state
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const [databaseReady, setDatabaseReady] = useState<boolean | null>(null);
  const [sso, setSso] = useState({ google: false, microsoft: false });

  useEffect(() => {
    fetch("/api/auth/sso/status")
      .then((res) => res.json())
      .then((data) => setSso({ google: Boolean(data?.google), microsoft: Boolean(data?.microsoft) }))
      .catch(() => setSso({ google: false, microsoft: false }));
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setDatabaseReady(Boolean(data?.ok && data?.databaseReachable)))
      .catch(() => setDatabaseReady(false));
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

      const data = await response.json();

      if (response.ok) {
        // Check if multiple roles are available
        if (data.multiRole) {
          setAvailableRoles(data.roles);
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
        toast({
          variant: "destructive",
          title: "Incorrect password",
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

  // Handle registration for Teacher or Trainer
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountType) return;
    
    setRegLoading(true);

    try {
      if (accountType === "teacher") {
        // Create Teacher account
        const response = await fetch("/api/teacher/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: regName,
            email: regEmail,
            password: regPassword,
          }),
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          toast({
            title: "Account created!",
            description: `Your Teacher ID is: ${data.teacherId}. You can sign in now with this email and password.`,
            duration: 8000,
          });

          // Reset form - don't switch to login since they can't log in yet
          setRegName("");
          setRegEmail("");
          setRegPassword("");
          setAccountType(null);
        } else {
          let description = "Could not create account";
          try {
            const data = await response.json();
            description = data.message || description;
          } catch {
            /* ignore non-JSON body */
          }
          toast({
            variant: "destructive",
            title: "Registration failed",
            description,
          });
        }
      } else if (accountType === "trainer") {
        // Create Trainer account
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: regEmail,
            email: regEmail,
            firstName: regName.split(" ")[0] || regName,
            lastName: regName.split(" ").slice(1).join(" ") || "",
            password: regPassword,
          }),
          credentials: "include",
        });

        if (response.ok) {
          toast({
            title: "Account created!",
            description: "Your trainer account is ready. You can sign in now.",
            duration: 8000,
          });

          setRegName("");
          setRegEmail("");
          setRegPassword("");
          setAccountType(null);
        } else {
          const data = await response.json();
          toast({
            variant: "destructive",
            title: "Registration failed",
            description: data.message || "Could not create account",
          });
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred during registration",
      });
    } finally {
      setRegLoading(false);
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
      description: "Managing batches",
      gradient: "from-primary to-primary"
    },
    {
      value: "teacher",
      icon: GraduationCap,
      title: "Teacher",
      description: "Taking courses",
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
      case 'trainer': return 'Manage batches and teacher progress';
      case 'teacher': return 'Take courses and complete quizzes';
    }
  };

  const scenes: Record<Role, { src: string; line: string }> = {
    admin: { src: "/bg-library.jpg", line: "The library is open" },
    trainer: { src: "/bg-hall.jpg", line: "The hall is open" },
    teacher: { src: "/bg-garden.jpg", line: "The garden is open" },
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
                <CardDescription>Admin, trainer, or teacher.</CardDescription>
              </CardHeader>
              
              <CardContent className="px-4 sm:px-6">
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
                    <TabsTrigger value="login" data-testid="tab-login" className="text-sm sm:text-base">Login</TabsTrigger>
                    <TabsTrigger value="register" data-testid="tab-register" className="text-sm sm:text-base">Create Account</TabsTrigger>
                  </TabsList>

                  {/* LOGIN TAB */}
                  <TabsContent value="login" className="space-y-4 sm:space-y-6">
                    <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
                      {/* Role Selection Cards */}
                      <div className="grid grid-cols-3 gap-1 rounded-full bg-[#f4eadc] p-1">
                        {roleCards.map((role) => {
                          const isSelected = loginRole === role.value;
                          return (
                            <button
                              key={role.value}
                              type="button"
                              onClick={() => setLoginRole(role.value as Role)}
                              data-testid={`radio-${role.value}`}
                              className={`rounded-full px-2 py-2 text-sm font-semibold transition ${
                                isSelected ? "bg-[#102448] text-white shadow" : "text-[#102448] hover:bg-white"
                              }`}
                            >
                              {role.title}
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="login-email">
                          {loginRole === "teacher" ? "Teacher ID or email" : "Username or email"}
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                          <Input
                            id="login-email"
                            data-testid="input-login-email"
                            type="text"
                            autoComplete="username"
                            placeholder={loginRole === "teacher" ? "teacher@test.com" : loginRole === "trainer" ? "trainer1" : "admin"}
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            required
                            className="pl-10 h-12 text-sm sm:text-base bg-card border-2"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="login-password">Password</Label>
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
                      </div>

                      {/* Login Button */}
                      <Button 
                        type="submit" 
                        size="lg"
                        className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 transition-all duration-300 hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]" 
                        disabled={loginLoading}
                        data-testid="button-login"
                      >
                        {loginLoading ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span className="text-sm sm:text-base">Logging in...</span>
                          </span>
                        ) : (
                          "Sign In"
                        )}
                      </Button>

                      {loginRole === "teacher" && (sso.google || sso.microsoft) && (
                        <div className="grid gap-2">
                          {sso.google && (
                            <Button type="button" variant="outline" asChild>
                              <a href="/api/auth/sso/google">Continue with Google</a>
                            </Button>
                          )}
                          {sso.microsoft && (
                            <Button type="button" variant="outline" asChild>
                              <a href="/api/auth/sso/microsoft">Continue with Microsoft</a>
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Forgot Password Link */}
                      <div className="text-center">
                        <a 
                          href="/emergency-reset" 
                          className="text-sm text-muted-foreground hover:text-primary hover:underline transition-colors"
                          data-testid="link-forgot-password"
                        >
                          Forgot password?
                        </a>
                      </div>
                    </form>
                  </TabsContent>

                  {/* REGISTER TAB */}
                  <TabsContent value="register" className="space-y-3 sm:space-y-4">
                    {!accountType ? (
                      <div className="space-y-3 sm:space-y-4">
                        <Label className="text-sm sm:text-base">Choose Account Type:</Label>
                        <div className="grid grid-cols-1 gap-2 sm:gap-3">
                          <Button
                            variant="outline"
                            className="h-16 sm:h-20 text-sm sm:text-base"
                            onClick={() => setAccountType("trainer")}
                            data-testid="button-create-trainer"
                          >
                            <div className="text-center">
                              <div className="font-semibold">Create Trainer Account</div>
                              <div className="text-xs text-muted-foreground">For trainers managing batches and teachers</div>
                            </div>
                          </Button>
                          <Button
                            variant="outline"
                            className="h-16 sm:h-20 text-sm sm:text-base"
                            onClick={() => setAccountType("teacher")}
                            data-testid="button-create-teacher"
                          >
                            <div className="text-center">
                              <div className="font-semibold">Create Teacher Account</div>
                              <div className="text-xs text-muted-foreground">For teachers taking training courses</div>
                            </div>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleRegister} className="space-y-3 sm:space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">
                            Create {accountType === "trainer" ? "Trainer" : "Teacher"} Account
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setAccountType(null)}
                            data-testid="button-back"
                          >
                            ← Back
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="reg-name">Full Name</Label>
                          <Input
                            id="reg-name"
                            data-testid="input-reg-name"
                            value={regName}
                            onChange={(e) => setRegName(e.target.value)}
                            placeholder="Enter your full name"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="reg-email">Email</Label>
                          <Input
                            id="reg-email"
                            data-testid="input-reg-email"
                            type="email"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="reg-password">Password</Label>
                          <PasswordInput
                            id="reg-password"
                            data-testid="input-reg-password"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="Create a password (min. 6 characters)"
                            required
                          />
                        </div>

                        <Button
                          type="submit"
                          className="w-full"
                          disabled={regLoading}
                          data-testid="button-register"
                        >
                          {regLoading ? "Creating account..." : "Create Account"}
                        </Button>

                        <p className="text-xs text-muted-foreground text-center">
                          After you create the account you can sign in immediately with the same email and password.
                        </p>
                      </form>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
