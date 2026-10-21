import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

/** Goes to the page the person came from. With no earlier page it goes to the fallback. */
export function BackButton({ fallback = "/", label = "Back", className = "" }: { fallback?: string; label?: string; className?: string }) {
  const [, navigate] = useLocation();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`-ml-2 ${className}`}
      data-testid="button-back"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else navigate(fallback);
      }}
    >
      <ArrowLeft className="mr-1 h-4 w-4" />
      {label}
    </Button>
  );
}
