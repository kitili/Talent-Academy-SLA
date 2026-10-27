import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Menu } from "lucide-react";

export interface MobileMenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "destructive";
}

interface MobileMenuProps {
  items: MobileMenuItem[];
  userInfo?: string;
  children?: React.ReactNode;
}

export function MobileMenu({ items, userInfo, children }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-11 w-11 text-inherit" aria-label="Menu">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 border-sl-line bg-sl-surface p-0 text-sl-ink">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle>Menu</SheetTitle>
          {userInfo && (
            <p className="text-sm text-sl-muted truncate">{userInfo}</p>
          )}
        </SheetHeader>
        <Separator />
        {children && (
          <>
            <div className="p-4">{children}</div>
            <Separator />
          </>
        )}
        <nav className="flex flex-col gap-1 p-2">
          {items.map((item, i) => (
            <Button
              key={i}
              variant={item.variant === "destructive" ? "destructive" : "ghost"}
              className="justify-start min-h-11"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
            >
              <item.icon className="mr-3 h-4 w-4" aria-hidden="true" />
              {item.label}
            </Button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
