import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScreenshotWarningProps {
  visible: boolean;
  onDismiss: () => void;
}

export function ScreenshotWarning({ visible, onDismiss }: ScreenshotWarningProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-destructive/95 backdrop-blur-md animate-in fade-in duration-200">
      <div className="max-w-2xl p-12 text-center space-y-6">
        <AlertTriangle className="w-32 h-32 mx-auto text-destructive-foreground animate-pulse" />
        <h1 className="text-5xl font-bold text-destructive-foreground">
          Screenshot Detected
        </h1>
        <p className="text-2xl text-destructive-foreground/90">
          This content is protected and screenshots are not permitted.
        </p>
        <p className="text-xl text-destructive-foreground/80">
          This attempt has been logged for security purposes.
        </p>
        <div className="pt-6">
          <Button
            onClick={onDismiss}
            size="lg"
            variant="outline"
            className="bg-background hover:bg-background/90 text-foreground border-destructive-foreground/50"
          >
            I Understand
          </Button>
        </div>
      </div>
    </div>
  );
}
