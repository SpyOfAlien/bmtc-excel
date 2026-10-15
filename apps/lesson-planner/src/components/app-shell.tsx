"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { SunflowerLogo } from "./sunflower-logo";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { currentUser } from "@/lib/storage-client";
import { fullName } from "@/lib/user-profile";
import { NotebookPen, Library, ChevronRight, UsersRound, PanelLeftOpen, PanelLeftClose } from "lucide-react";

const NavigationContext = createContext({
  navigate: (_href: string) => {},
  guard: (_dirty: boolean) => {},
});
export const useAppNavigation = () => useContext(NavigationContext);
const items = [
  { href: "/plans", label: "Kế hoạch", icon: NotebookPen },
  { href: "/students", label: "Học sinh", icon: UsersRound },
  { href: "/library", label: "Thư viện", icon: Library },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [profileName, setProfileName] = useState("");
  useEffect(() => { let cancelled = false; void currentUser().then(user => { if (!cancelled) setProfileName(fullName(user)); }).catch(() => {}); return () => { cancelled = true; }; }, []);
  const path = usePathname();
  const pathname = path === "/" ? path : path.replace(/\/+$/, "");
  const currentItem = items.find(item => item.href === pathname || pathname.startsWith(`${item.href}/`));
  const router = useRouter();
  const dirty = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const guard = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const navigate = useCallback(
    (href: string) => {
      if (dirty.current) {
        setPending(href);
        return;
      }
      dirty.current = false;
      router.push(href);
    },
    [router],
  );
  return (
    <NavigationContext.Provider value={{ navigate, guard }}>
      <div className="app-frame md:flex">
        <aside className={`app-sidebar ${expanded ? "is-expanded" : "is-collapsed"}`}>
          <div className="sidebar-toggle"><Button variant="ghost" size={expanded ? "default" : "icon"} aria-label={expanded ? "Thu gọn sidebar" : "Mở rộng sidebar"} aria-expanded={expanded} aria-controls="main-navigation" title={expanded ? "Thu gọn" : "Mở rộng"} onClick={() => setExpanded(value => !value)}>{expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}{expanded && <span>Thu gọn</span>}</Button></div>
          <div className="app-logo"><SunflowerLogo /><span className={expanded ? "" : "sr-only"}>Hoasalbee</span></div>
          <nav
            id="main-navigation"
            aria-label="Điều hướng chính"
            className="flex gap-1 px-3 pb-3 md:flex-col"
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={!expanded ? item.label : undefined}
                aria-current={currentItem?.href === item.href ? "page" : undefined}
                className="sidebar-link"
                onClick={(event) => {
                  event.preventDefault();
                  if (pathname !== item.href) navigate(item.href);
                }}
              >
                <item.icon className="size-4" aria-hidden="true" />
                <span className={expanded ? "" : "sr-only"}>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>
        <div className="app-content min-w-0 flex-1">
          <header className="app-header"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Kế hoạch giáo dục cá nhân</span><ChevronRight className="size-3" aria-hidden="true" /><span className="font-medium text-foreground">{currentItem?.label}</span></div>{profileName && <div className="flex items-center gap-2.5 text-xs"><span className="profile-avatar" aria-hidden="true">{profileName.split(" ").filter(Boolean).map(part => part[0]).slice(-2).join("")}</span><span>{profileName}</span></div>}</header>
          <div className="app-page">{children}</div>
        </div>
      </div>
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chuyển trang?</DialogTitle>
            <DialogDescription>
              Thay đổi chưa lưu sẽ bị bỏ. Bạn có thể giữ lại để tiếp tục chỉnh
              sửa và lưu kế hoạch.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPending(null)}>
              Giữ lại
            </Button>
            <Button
              onClick={() => {
                if (pending) {
                  dirty.current = false;
                  router.push(pending);
                  setPending(null);
                }
              }}
            >
              Chuyển trang
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </NavigationContext.Provider>
  );
}
