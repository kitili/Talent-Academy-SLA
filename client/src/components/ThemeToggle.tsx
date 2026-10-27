import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function readSaved(): Theme {
  try {
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** The moon in the header. It inherits the text colour around it; `showLabel` adds the words (the phone account menu). */
export function ThemeToggle({ showLabel = false }: { showLabel?: boolean } = {}) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initialTheme = readSaved();
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
    // More than one toggle can be on the page (header and phone menu): keep each one's icon in step.
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const newTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    setTheme(newTheme);
    try {
      localStorage.setItem("theme", newTheme);
    } catch {
      /* private mode: the choice lasts this visit */
    }
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  return (
    <Button
      variant="ghost"
      size={showLabel ? "default" : "icon"}
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      aria-label={showLabel ? undefined : label}
      className={showLabel ? "min-h-11 justify-start gap-2 px-2 text-sm font-normal" : "h-11 w-11 text-inherit"}
    >
      {theme === "light" ? <Moon className="h-5 w-5" aria-hidden="true" /> : <Sun className="h-5 w-5" aria-hidden="true" />}
      {showLabel && <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>}
    </Button>
  );
}
