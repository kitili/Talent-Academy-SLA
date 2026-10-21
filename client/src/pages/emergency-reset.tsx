import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function EmergencyReset() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Test logins only</CardTitle>
          <CardDescription>
            This academy does not reset passwords or create other accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>admin / admin123</p>
          <p>trainer1 / trainer123</p>
          <p>teacher@test.com / teacher123</p>
          <Button asChild className="w-full">
            <a href="/auth">Back to sign in</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
