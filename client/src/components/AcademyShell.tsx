import { createContext, useContext, useEffect, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  Ellipsis,
  House,
  MessageSquare,
  UserCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";
import { SceneBackdrop, type SceneName } from "@/components/SceneBackdrop";
import {
  DESK_LABELS,
  DESK_MENUS,
  DESK_NAV_TOUR,
  DESK_PHONE_BAR,
  deskItemForLocation,
  deskItemHook,
  type Desk,
  type DeskMenuItem,
} from "@/components/deskMenu";
import { useAuth } from "@/hooks/use-auth";
import { deskName } from "@shared/deskName";

type AcademyShellProps = {
  /** The page's name. The header always reads "Silverleaf Academy"; the page draws its own h1, so this names the tab. */
  title: string;
  subtitle?: string;
  /** Defaults to the signed-in person's name. */
  userLabel?: string;
  /** Defaults to signing the signed-in person out. */
  onLogout?: () => void;
  /** Header controls placed before the bell, such as the page's Help (`TourButton`). */
  actions?: ReactNode;
  /** No longer drawn: the shell has no scenery. Kept so callers still compile. */
  scene?: SceneName;
  /** The Admin desk's menu; the same as `desk="admin"`. */
  showAdminNav?: boolean;
  /** Which desk's menu (DESK_MENUS) the shell draws, and its current item's key. */
  desk?: Desk;
  current?: string;
  /** Switch sections in place instead of following the item's href (Trainer and Fellow desks). */
  onNavigate?: (key: string) => void;
  children: ReactNode;
};

/** True inside AcademyShell, so a page's older phone bar (TeacherLearnerNav) stands down there. */
const InsideShell = createContext(false);

export function useInsideShell() {
  return useContext(InsideShell);
}

const PHONE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  home: House,
  learning: BookOpen,
  work: ClipboardList,
  messages: MessageSquare,
  approvals: UserCheck,
  people: Users,
  cohorts: UsersRound,
  assessments: ClipboardCheck,
};

function useCurrentItem(desk: Desk, current?: string) {
  const [path] = useLocation();
  const search = useSearch();
  return current ?? deskItemForLocation(desk, path, search);
}

function initials(name?: string) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "?";
}

/** One menu item: a link that follows `href`, or switches the section in place through `onNavigate`. */
function DeskLink({
  desk,
  item,
  on,
  onNavigate,
  onDone,
  hooks,
  className,
  children,
}: {
  desk: Desk;
  item: DeskMenuItem;
  on: boolean;
  onNavigate?: (key: string) => void;
  onDone?: () => void;
  hooks: boolean;
  className: string;
  children: ReactNode;
}) {
  const hook = deskItemHook(desk, item);
  const [path] = useLocation();
  // A page switches only its own sections in place; an item on another page (Fellow Certificates) follows its href.
  const inPlace = Boolean(onNavigate) && item.href.split("?")[0] === path;
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      data-testid={hooks ? hook : undefined}
      data-tour={hooks ? item.tour ?? hook : undefined}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (inPlace && onNavigate) {
          event.preventDefault();
          onNavigate(item.key);
        }
        onDone?.();
      }}
      className={className}
    >
      {children}
    </Link>
  );
}

const itemClass = (on: boolean) =>
  `flex min-h-11 items-center rounded-md px-3 py-2.5 text-[15px] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sl-accent ${
    on ? "bg-sl-accent-soft font-semibold text-sl-accent" : "text-sl-neutral hover:bg-sl-neutral-soft hover:text-sl-ink"
  }`;

/** The desk's side menu: a column at 1024 px and wider, a wrapped strip above the page on narrower screens. */
export function DeskNav({ desk, current, onNavigate }: { desk: Desk; current?: string; onNavigate?: (key: string) => void }) {
  const on = useCurrentItem(desk, current);
  return (
    <nav
      aria-label={`${DESK_LABELS[desk]} desk`}
      data-tour={DESK_NAV_TOUR[desk]}
      data-testid={desk === "admin" ? "admin-nav" : `nav-${desk}`}
      className="hidden shrink-0 border-b border-sl-line bg-sl-surface print:hidden sm:block lg:max-w-[280px] lg:flex-[1_1_232px] lg:overflow-y-auto lg:border-b-0 lg:border-r"
    >
      <div className="flex flex-wrap gap-1 px-4 py-2 sm:px-6 lg:flex-col lg:flex-nowrap lg:px-3 lg:py-5">
        {DESK_MENUS[desk].map((item) => (
          <DeskLink key={item.key} desk={desk} item={item} on={on === item.key} onNavigate={onNavigate} hooks className={itemClass(on === item.key)}>
            {item.label}
          </DeskLink>
        ))}
      </div>
    </nav>
  );
}

/** The phone bar: four items and More, which opens the rest (design/board/FellowPhone.dc.html). */
export function DeskPhoneBar({ desk, current, onNavigate }: { desk: Desk; current?: string; onNavigate?: (key: string) => void }) {
  const on = useCurrentItem(desk, current);
  const [moreOpen, setMoreOpen] = useState(false);
  const items = DESK_MENUS[desk];
  const bar = DESK_PHONE_BAR[desk].map((key) => items.find((item) => item.key === key)).filter((item): item is DeskMenuItem => !!item);
  const rest = items.filter((item) => !bar.includes(item));
  const moreOn = rest.some((item) => item.key === on);
  const tab = (active: boolean) =>
    `flex min-h-11 flex-col items-center justify-center gap-1 text-xs no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sl-accent ${
      active ? "font-semibold text-sl-accent" : "text-sl-neutral"
    }`;
  return (
    <nav
      aria-label={`${DESK_LABELS[desk]} desk`}
      data-testid={`phone-nav-${desk}`}
      className="z-40 grid min-h-16 shrink-0 grid-cols-5 border-t border-sl-line bg-sl-surface pb-[env(safe-area-inset-bottom)] print:hidden sm:hidden"
    >
      {bar.map((item) => {
        const Icon = PHONE_ICONS[item.key] ?? House;
        return (
          <DeskLink key={item.key} desk={desk} item={item} on={on === item.key} onNavigate={onNavigate} hooks={false} className={tab(on === item.key)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </DeskLink>
        );
      })}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger asChild>
          <button type="button" className={`${tab(moreOn)} bg-transparent`} aria-current={moreOn ? "page" : undefined}>
            <Ellipsis className="h-5 w-5" aria-hidden="true" />
            More
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-xl border-sl-line bg-sl-surface px-4 pb-8 pt-5">
          <SheetHeader className="text-left">
            <SheetTitle className="text-lg font-semibold text-sl-ink">More</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-1">
            {rest.map((item) => (
              <DeskLink
                key={item.key}
                desk={desk}
                item={item}
                on={on === item.key}
                onNavigate={onNavigate}
                onDone={() => setMoreOpen(false)}
                hooks={false}
                className={itemClass(on === item.key)}
              >
                {item.label}
              </DeskLink>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

/** The frame every desk shares (design/board/Shell.dc.html): header, side menu, and the page beside it. */
export function AcademyShell({
  title,
  userLabel,
  onLogout,
  actions,
  showAdminNav = false,
  desk: deskProp,
  current,
  onNavigate,
  children,
}: AcademyShellProps) {
  const desk = deskProp ?? (showAdminNav ? "admin" : undefined);
  const admin = desk === "admin";
  const { user, logoutMutation } = useAuth();
  const name = userLabel ?? (user ? deskName(user) : undefined);
  const logout = onLogout ?? (user ? () => logoutMutation.mutate() : undefined);

  // Only the main area scrolls (the header and the menu stay put), so a new page or section starts at its top here.
  const mainRef = useRef<HTMLElement>(null);
  const [location] = useLocation();
  const search = useSearch();
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location, search, current]);

  useEffect(() => {
    const before = document.title;
    document.title = title && title !== "Silverleaf Academy" ? `${title} · Silverleaf Academy` : "Silverleaf Academy";
    return () => {
      document.title = before;
    };
  }, [title]);

  return (
    <InsideShell.Provider value>
      <SceneBackdrop scene="library">
        {/* The frame fills the window and does not scroll; the header, the menu and the phone bar stay in place, and
            only <main> scrolls. When printing, everything flows on paper and the frame is hidden. */}
        <div className="flex h-dvh flex-col overflow-hidden print:h-auto print:overflow-visible">
          <header className="z-40 h-14 shrink-0 border-b border-sl-line bg-sl-surface text-sl-ink print:hidden sm:h-[68px]" data-tour={admin ? "admin-header" : undefined}>
            <div className="flex h-full flex-nowrap items-center justify-between gap-x-3 pl-4 pr-2 sm:px-6">
              <div className="flex min-w-0 items-center gap-3" data-tour={admin ? "admin-brand" : undefined}>
                <img src={logoImage} alt="" width={30} height={36} className="block h-[30px] w-[25px] object-contain sm:h-9 sm:w-[30px]" />
                <span className="truncate text-base font-semibold">
                  <span className="sm:hidden">Silverleaf</span>
                  <span className="hidden sm:inline">Silverleaf Academy</span>
                </span>
                {desk && (
                  <span className="hidden rounded-full bg-sl-accent-soft px-2.5 py-[3px] text-xs font-semibold text-sl-accent sm:inline">
                    {DESK_LABELS[desk]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-sl-neutral sm:gap-2">
                {actions && <div className="hidden items-center gap-1 sm:flex">{actions}</div>}
                <span className="inline-flex" data-tour={admin ? "admin-bell" : undefined}>
                  <NotificationBell tone="light" />
                </span>
                <div className="hidden sm:inline-flex" data-tour={admin ? "admin-theme" : undefined}>
                  <ThemeToggle />
                </div>
                {name && (
                  <span className="hidden max-w-[12rem] truncate px-2 text-sm font-semibold text-sl-ink sm:inline" data-tour={admin ? "admin-account" : undefined}>
                    {name}
                  </span>
                )}
                {logout && (
                  <Button variant="secondary" onClick={logout} data-tour={admin ? "admin-logout" : undefined} className="hidden min-h-11 px-3.5 text-sm font-normal sm:inline-flex">
                    Log out
                  </Button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Account, help and log out"
                      className="flex h-11 w-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sl-accent sm:hidden"
                    >
                      <span aria-hidden="true" className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-sl-accent-soft text-[13px] font-semibold text-sl-accent">
                        {initials(name)}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 rounded-xl border-sl-line bg-sl-surface p-3 text-sl-ink">
                    <div className="flex flex-col gap-2">
                      {name && <p className="px-1 text-sm font-semibold">{name}</p>}
                      {desk && <p className="px-1 text-xs text-sl-muted">{DESK_LABELS[desk]} desk</p>}
                      {actions && <div className="flex flex-wrap items-center gap-1 text-sl-neutral">{actions}</div>}
                      <ThemeToggle showLabel />
                      {logout && (
                        <Button variant="secondary" onClick={logout} className="min-h-11 justify-center">
                          Log out
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row print:block">
            {desk && <DeskNav desk={desk} current={current} onNavigate={onNavigate} />}
            <main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto lg:flex-[999_1_560px] print:overflow-visible">
              <div className={`max-w-[1120px] space-y-7 px-4 pb-12 pt-5 sm:px-6 sm:pt-6 lg:px-10 lg:pt-8 ${desk ? "" : "mx-auto w-full"}`}>
                {children}
              </div>
            </main>
          </div>
          {desk && <DeskPhoneBar desk={desk} current={current} onNavigate={onNavigate} />}
        </div>
      </SceneBackdrop>
    </InsideShell.Provider>
  );
}
