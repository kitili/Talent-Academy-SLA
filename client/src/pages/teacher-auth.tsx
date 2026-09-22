import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle, Copy } from "lucide-react";

export default function TeacherAuth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("login");
  const [showTeacherIdDialog, setShowTeacherIdDialog] = useState(false);
  const [newTeacherId, setNewTeacherId] = useState<number | null>(null);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: async (data: { identifier: string; password: string }) => {
      const response = await fetch("/api/teacher/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Logged in successfully" });
      setLocation("/teacher/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const response = await fetch("/api/teacher/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Registration failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setNewTeacherId(data.teacherId);
      setShowTeacherIdDialog(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCopyTeacherId = () => {
    if (newTeacherId) {
      navigator.clipboard.writeText(newTeacherId.toString());
      toast({
        title: "Copied!",
        description: "Teacher ID copied to clipboard",
      });
    }
  };

  const handleContinueToDashboard = () => {
    setShowTeacherIdDialog(false);
    toast({
      title: "Welcome!",
      description: "Registration successful",
    });
    setLocation("/teacher/dashboard");
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ identifier: loginIdentifier, password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate({
      name: registerName,
      email: registerEmail,
      password: registerPassword,
    });
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Teacher Portal</CardTitle>
            <CardDescription>Login or register as a teacher</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-identifier">Teacher ID or Email</Label>
                    <Input
                      id="login-identifier"
                      type="text"
                      data-testid="input-login-identifier"
                      placeholder="7100 or your@email.com"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <PasswordInput
                        id="login-password"
                        data-testid="input-login-password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    data-testid="button-login"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Logging in..." : "Login"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Full Name</Label>
                    <Input
                      id="register-name"
                      type="text"
                      data-testid="input-register-name"
                      placeholder="John Doe"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      data-testid="input-register-email"
                      placeholder="your@email.com"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <div className="relative">
                      <PasswordInput
                        id="register-password"
                        data-testid="input-register-password"
                        placeholder="••••••••"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    data-testid="button-register"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? "Registering..." : "Register"}
                  </Button>
                  <p className="text-sm text-muted-foreground text-center">
                    You will receive a unique Teacher ID upon registration
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showTeacherIdDialog} onOpenChange={setShowTeacherIdDialog}>
        <AlertDialogContent data-testid="dialog-teacher-id-success">
          <AlertDialogHeader>
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-green-100 dark:bg-green-900/20 p-3">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-500" />
              </div>
            </div>
            <AlertDialogTitle className="text-center text-2xl">
              Registration Successful!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-4">
              <p className="text-base">
                Your account has been created successfully. Please save your Teacher ID:
              </p>
              <div className="bg-primary/10 border-2 border-primary rounded-lg p-6 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Your Teacher ID</p>
                <div className="flex items-center justify-center gap-3">
                  <p className="text-4xl font-bold text-primary" data-testid="text-teacher-id-display">
                    {newTeacherId}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyTeacherId}
                    data-testid="button-copy-teacher-id"
                    aria-label="Copy Teacher ID"
                  >
                    <Copy className="h-5 w-5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Trainers will use this ID to add you to training batches
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Please save this ID in a safe place. You will need it for future reference.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={handleContinueToDashboard}
              data-testid="button-continue-dashboard"
              className="w-full"
            >
              Continue to Dashboard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
