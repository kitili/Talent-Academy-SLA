import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import logoImage from "@assets/image_1760460046116.png";

export default function AuthPage() {
  const { user, isLoading, loginMutation, registerMutation } = useAuth();
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({
    username: "",
    password: "",
    email: "",
    firstName: "",
    lastName: "",
  });

  // Redirect if already logged in
  if (user) {
    return <Redirect to="/" />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginData);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(registerData);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Auth forms */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="h-16 w-16 flex items-center justify-center bg-primary rounded-xl p-2 shadow-lg">
                <img src={logoImage} alt="Silverleaf Academy Logo" className="w-full h-full object-contain" />
              </div>
              <div className="text-left">
                <h1 className="text-3xl sm:text-4xl font-bold text-primary">Silverleaf Academy</h1>
                <p className="text-sm text-muted-foreground mt-1">Training Program Planner</p>
              </div>
            </div>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login" data-testid="tab-login" className="text-base">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register" className="text-base">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="shadow-2xl border-0 rounded-2xl">
                <CardHeader className="space-y-3 pb-8">
                  <CardTitle className="text-3xl font-bold">Login</CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    Enter your credentials to access the training program planner
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="login-username">Username</Label>
                      <Input
                        id="login-username"
                        type="text"
                        placeholder="Enter your username"
                        value={loginData.username}
                        onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                        required
                        data-testid="input-login-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="Enter your password"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                        data-testid="input-login-password"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loginMutation.isPending}
                      data-testid="button-login"
                    >
                      {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Login
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card className="shadow-2xl border-0 rounded-2xl">
                <CardHeader className="space-y-3 pb-8">
                  <CardTitle className="text-3xl font-bold">Create Teacher Account</CardTitle>
                  <CardDescription className="text-base leading-relaxed">
                    Register to access the training program planner in view-only mode
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  <form onSubmit={handleRegister} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="register-username">Username *</Label>
                      <Input
                        id="register-username"
                        type="text"
                        placeholder="Choose a username"
                        value={registerData.username}
                        onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                        required
                        data-testid="input-register-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password *</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Choose a password (min 6 characters)"
                        value={registerData.password}
                        onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                        required
                        minLength={6}
                        data-testid="input-register-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="your.email@example.com"
                        value={registerData.email}
                        onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                        data-testid="input-register-email"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="register-firstName">First Name</Label>
                        <Input
                          id="register-firstName"
                          type="text"
                          placeholder="First name"
                          value={registerData.firstName}
                          onChange={(e) => setRegisterData({ ...registerData, firstName: e.target.value })}
                          data-testid="input-register-firstname"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="register-lastName">Last Name</Label>
                        <Input
                          id="register-lastName"
                          type="text"
                          placeholder="Last name"
                          value={registerData.lastName}
                          onChange={(e) => setRegisterData({ ...registerData, lastName: e.target.value })}
                          data-testid="input-register-lastname"
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={registerMutation.isPending}
                      data-testid="button-register"
                    >
                      {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Teacher Account
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right side - Hero section */}
      <div className="hidden lg:flex flex-1 bg-primary items-center justify-center p-12">
        <div className="max-w-lg text-center space-y-8">
          <div className="h-24 w-24 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-8 shadow-2xl">
            <img src={logoImage} alt="Silverleaf Academy Logo" className="w-20 h-20 object-contain" />
          </div>
          <h2 className="text-5xl font-bold text-white leading-tight">Welcome to Silverleaf Academy</h2>
          <p className="text-xl text-white/90 leading-relaxed">
            Organize and manage teacher training content with ease. Track competency focus, objectives,
            and presentation materials for each training week.
          </p>
          <div className="pt-8 space-y-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 text-left shadow-lg hover:bg-white/15 transition-colors">
              <p className="text-white/90 text-base">
                <strong className="text-white font-semibold">Teachers:</strong> Create an account to view training materials
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 text-left shadow-lg hover:bg-white/15 transition-colors">
              <p className="text-white/90 text-base">
                <strong className="text-white font-semibold">Admins:</strong> Contact your administrator for admin access
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Theme toggle in top right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
    </div>
  );
}
