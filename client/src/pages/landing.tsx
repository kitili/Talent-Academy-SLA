import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full mx-auto px-6 text-center">
        <div className="mb-8">
          <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-primary font-bold text-3xl">SL</span>
          </div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-landing-title">
            Silver Leaf
          </h1>
          <p className="text-lg text-muted-foreground">
            Training Program Planner
          </p>
        </div>

        <p className="text-muted-foreground mb-8">
          Organize and manage your teacher training program with ease. Access training weeks, competency focus, objectives, and presentation materials.
        </p>

        <Button
          size="lg"
          onClick={() => window.location.href = "/api/login"}
          data-testid="button-login"
        >
          Sign In
        </Button>

        <p className="text-sm text-muted-foreground mt-6">
          Sign in to access your training materials
        </p>
      </div>
    </div>
  );
}
