import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export default function EmergencyReset() {
  const { toast } = useToast();
  const [masterKey, setMasterKey] = useState("");
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/emergency-admin-reset", {
        masterKey,
        username,
        newPassword,
      });
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setMasterKey("");
      setUsername("");
      setNewPassword("");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Reset failed", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Emergency Password Reset</CardTitle>
          <CardDescription>
            Reset admin password using your master key. This key is set in the ADMIN_RESET_KEY environment variable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="masterKey">Master Reset Key</Label>
            <PasswordInput
              id="masterKey"
              placeholder="Enter your secret master key"
              value={masterKey}
              onChange={(e) => setMasterKey(e.target.value)}
              data-testid="input-master-key"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              data-testid="input-username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <PasswordInput
              id="newPassword"
              placeholder="Enter new password (min 6 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="input-new-password"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => resetMutation.mutate()}
            disabled={!masterKey || !username || !newPassword || resetMutation.isPending}
            data-testid="button-reset"
          >
            {resetMutation.isPending ? "Resetting..." : "Reset Password"}
          </Button>
          <div className="text-center">
            <Link href="/auth" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />
              Back to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
