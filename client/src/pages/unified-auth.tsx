import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Shield, GraduationCap, Users, Mail, Sparkles } from "lucide-react";
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
  
  // Login state
  const [loginRole, setLoginRole] = useState<Role>("admin");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  
  // Multi-role selection state
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<MultiRoleOption[]>([]);
  const [selectingRole, setSelectingRole] = useState(false);
  
  // Registration state
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // Floating label states
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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
        
        // Update the auth context's query cache
        if (user.role !== 'teacher') {
          queryClient.setQueryData(["/api/user"], user);
        }

        toast({
          title: "Welcome!",
          description: `Successfully logged in as ${selectedRole.role}`,
        });
        
        // Redirect based on role
        if (selectedRole.role === 'teacher') {
          window.location.href = "/teacher/dashboard";
        } else {
          window.location.href = "/";
        }
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
          password: loginPassword 
        }),
        credentials: "include",
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
        
        // Single role - direct login
        const userRole = data.role;
        
        // For single role login, verify it matches selection if not teacher
        // Admin and trainer are both in users table, so allow admin/trainer interchangeability
        const isAdminOrTrainer = (r: string) => r === 'admin' || r === 'trainer';
        if (userRole !== loginRole && !(isAdminOrTrainer(userRole) && isAdminOrTrainer(loginRole)) && userRole !== 'teacher') {
          toast({
            variant: "destructive",
            title: "Role mismatch",
            description: `This account is registered as ${userRole}, not ${loginRole}. Please select the correct role.`,
          });
          setLoginLoading(false);
          return;
        }

        // Update the auth context's query cache
        if (userRole !== 'teacher') {
          queryClient.setQueryData(["/api/user"], data);
        }

        toast({
          title: "Welcome!",
          description: `Successfully logged in as ${userRole}`,
        });
        
        // Redirect based on role
        if (userRole === 'teacher') {
          window.location.href = "/teacher/dashboard";
        } else {
          window.location.href = "/";
        }
      } else {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: data.message || "Invalid email or password",
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
            description: `Your Teacher ID is: ${data.teacherId}. ${data.message || "Your account is pending approval from admin or trainer."}`,
            duration: 8000,
          });

          // Reset form - don't switch to login since they can't log in yet
          setRegName("");
          setRegEmail("");
          setRegPassword("");
          setAccountType(null);
        } else {
          const error = await response.text();
          toast({
            variant: "destructive",
            title: "Registration failed",
            description: error || "Could not create account",
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
            description: "Your trainer account is pending admin approval.",
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

  const motivationalQuotes = [
    "Education is the passport to the future.",
    "Learning never exhausts the mind.",
    "The beautiful thing about learning is that nobody can take it away from you.",
    "Education is not preparation for life; education is life itself.",
    "The capacity to learn is a gift; the ability to learn is a skill."
  ];

  const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary/5 via-primary/10 to-primary/15 dark:from-gray-900 dark:via-primary/20 dark:to-primary/30 relative overflow-hidden">
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

      {/* Decorative background shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-48 sm:w-72 h-48 sm:h-72 bg-primary/20 dark:bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-64 sm:w-96 h-64 sm:h-96 bg-primary/20 dark:bg-primary/10 rounded-full blur-3xl hidden sm:block" />
        <div className="absolute top-1/2 left-1/3 w-48 sm:w-64 h-48 sm:h-64 bg-primary/20 dark:bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 relative z-10">
        <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-6 lg:gap-12 items-center">
          {/* Left side - Welcome section (hidden on mobile in login, shown in register) */}
          <div className="hidden lg:flex flex-1 flex-col justify-center space-y-4 lg:space-y-6 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-4 mb-4">
              <SilverleafLogo className="w-16 h-16" />
              <div>
                <h1 className="text-4xl font-bold text-foreground">Silverleaf Academy</h1>
                <p className="text-sm text-muted-foreground mt-1">Training Program Planner</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-foreground leading-tight">
                Welcome to Your Learning Journey
              </h2>
              <p className="text-lg text-muted-foreground">
                Empowering educators and learners with comprehensive training programs and management tools.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-6">
              <div className="flex items-start gap-3 p-4 bg-card/50 rounded-lg backdrop-blur-sm border border-border/50">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Interactive Learning</h3>
                  <p className="text-sm text-muted-foreground">Engage with dynamic content and assessments</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-4 bg-card/50 rounded-lg backdrop-blur-sm border border-border/50">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Secure Platform</h3>
                  <p className="text-sm text-muted-foreground">Your data is protected with enterprise security</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Auth form */}
          <div className="w-full max-w-md lg:w-auto lg:min-w-[480px] lg:max-w-[520px]">
            <Card className="backdrop-blur-sm bg-card/95 shadow-2xl border-border/50">
              <CardHeader className="text-center space-y-2 pb-4 sm:pb-6 px-4 sm:px-6">
                <div className="flex justify-center lg:hidden mb-3">
                  <SilverleafLogo className="w-12 h-12 sm:w-14 sm:h-14" />
                </div>
                <CardTitle className="text-2xl sm:text-3xl font-bold">Welcome Back</CardTitle>
                <CardDescription className="text-sm sm:text-base">Sign in to continue your learning journey</CardDescription>
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
                      <div className="space-y-2 sm:space-y-3">
                        <Label className="text-sm sm:text-base font-semibold">Select Your Role</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                          {roleCards.map((role) => {
                            const Icon = role.icon;
                            const isSelected = loginRole === role.value;
                            return (
                              <button
                                key={role.value}
                                type="button"
                                onClick={() => setLoginRole(role.value as Role)}
                                data-testid={`radio-${role.value}`}
                                className={`
                                  relative p-3 sm:p-4 rounded-xl border-2 transition-all duration-300
                                  hover-elevate active-elevate-2
                                  ${isSelected 
                                    ? 'border-primary bg-primary/5 shadow-lg shadow-primary/20' 
                                    : 'border-border bg-card hover:border-primary/50'
                                  }
                                `}
                              >
                                <div className="flex flex-col sm:flex-col items-center gap-2 text-center">
                                  <div className={`
                                    p-2 sm:p-3 rounded-lg transition-all duration-300
                                    ${isSelected 
                                      ? `bg-gradient-to-br ${role.gradient} text-white` 
                                      : 'bg-muted text-muted-foreground'
                                    }
                                  `}>
                                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                                  </div>
                                  <div>
                                    <p className={`font-semibold text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                      {role.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {role.description}
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                    <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Email/ID Input with floating label */}
                      <div className="relative">
                        <div className="relative">
                          <Mail className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground z-10" />
                          <Input
                            id="login-email"
                            data-testid="input-login-email"
                            type="text"
                            placeholder=" "
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            onFocus={() => setEmailFocused(true)}
                            onBlur={() => setEmailFocused(false)}
                            required
                            className="pl-10 sm:pl-12 h-12 sm:h-14 text-sm sm:text-base peer bg-card border-2 transition-all duration-300 focus:border-primary"
                          />
                          <Label
                            htmlFor="login-email"
                            className={`
                              absolute left-10 sm:left-12 transition-all duration-300 pointer-events-none
                              ${emailFocused || loginEmail
                                ? '-top-2.5 left-3 text-xs bg-card px-2 text-primary font-medium'
                                : 'top-1/2 -translate-y-1/2 text-sm sm:text-base text-muted-foreground'
                              }
                            `}
                          >
                            {loginRole === "teacher" ? "Teacher ID or Email" : "Username or Email"}
                          </Label>
                        </div>
                        <div className={`h-0.5 bg-primary transition-all duration-300 ${emailFocused ? 'w-full' : 'w-0'}`} />
                      </div>

                      {/* Password Input with floating label */}
                      <div className="relative">
                        <div className="relative">
                          <PasswordInput
                            id="login-password"
                            data-testid="input-login-password"
                            placeholder=" "
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            onFocus={() => setPasswordFocused(true)}
                            onBlur={() => setPasswordFocused(false)}
                            required
                            className="h-12 sm:h-14 text-sm sm:text-base peer bg-card border-2 transition-all duration-300 focus:border-primary"
                          />
                          <Label
                            htmlFor="login-password"
                            className={`
                              absolute left-10 transition-all duration-300 pointer-events-none
                              ${passwordFocused || loginPassword
                                ? '-top-2.5 left-3 text-xs bg-card px-2 text-primary font-medium'
                                : 'top-1/2 -translate-y-1/2 text-sm sm:text-base text-muted-foreground'
                              }
                            `}
                          >
                            Password
                          </Label>
                        </div>
                        <div className={`h-0.5 bg-primary transition-all duration-300 ${passwordFocused ? 'w-full' : 'w-0'}`} />
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

                      {/* Motivational Quote */}
                      <div className="pt-3 sm:pt-4 border-t border-border">
                        <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-primary/5 rounded-lg">
                          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0 mt-0.5" />
                          <p className="text-xs sm:text-sm text-muted-foreground italic">
                            "{randomQuote}"
                          </p>
                        </div>
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
                          Your account will need to be approved by an admin{accountType === "teacher" ? " or trainer" : ""} before you can log in.
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
    </div>
  );
}
