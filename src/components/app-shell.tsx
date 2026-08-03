"use client";

import * as React from "react";
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AudioLines, FileText, ScrollText, Settings, Youtube, LayoutDashboard, LogOut, Sun, Moon, Bell, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { GlobalSearch } from "@/components/global-search";
import { toast } from "sonner";

const navItems = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/transcription", label: "التفريغ", icon: AudioLines },
  { href: "/formatting", label: "التنسيق", icon: FileText },
  { href: "/logs", label: "السجلات", icon: ScrollText },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "لوحة التحكم",
  "/transcription": "التفريغ",
  "/formatting": "التنسيق",
  "/logs": "السجلات",
  "/settings": "الإعدادات",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const [searchOpen, setSearchOpen] = React.useState(false);

  // Global keyboard shortcut: Ctrl+K / Cmd+K to open search
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Check for failed jobs notifications (polls every 30s)
  React.useEffect(() => {
    if (pathname === "/login") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        const data = await res.json();
        const newFailed = (data.videos?.failed || 0) + (data.formatJobs?.failed || 0);
        const lastNotified = sessionStorage.getItem("lastFailedNotification");
        const lastNotifiedCount = lastNotified ? parseInt(lastNotified, 10) : 0;
        if (newFailed > 0 && newFailed > lastNotifiedCount) {
          sessionStorage.setItem("lastFailedNotification", String(newFailed));
          toast.error("توجد مهام فاشلة", {
            description: `${newFailed} مهمة تحتاج لإعادة المحاولة`,
            action: { label: "عرض", onClick: () => window.location.href = "/transcription" },
          });
        }
      } catch {
        // silent
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [pathname]);

  // Don't show shell on login page
  if (pathname === "/login") {
    return <>{children}</>;
  }

  const currentPageTitle = pageTitles[pathname] || pageTitles[Object.keys(pageTitles).find(k => pathname.startsWith(k + "/")) || ""] || "";

  return (
    <SidebarProvider defaultOpen>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <Sidebar side="right" collapsible="icon" className="border-l">
        <SidebarHeader>
          <Link href="/dashboard" className="flex items-center gap-2 px-2 py-2 hover:opacity-90 transition-opacity">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shrink-0 shadow-sm">
              <Youtube className="h-5 w-5" />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-bold leading-tight">منصة التفريغ</span>
              <span className="text-xs text-muted-foreground leading-tight">وتنسيق الفيديو</span>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={item.href} className="relative">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        {active && (
                          <motion.div
                            layoutId="activeIndicator"
                            className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-primary"
                          />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-xs font-bold shrink-0 border border-primary/20">
                  {session?.user?.name?.[0]?.toUpperCase() || "A"}
                </div>
                <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                  <span className="text-xs font-medium">{session?.user?.name || "admin"}</span>
                  <span className="text-[10px] text-muted-foreground">مدير النظام</span>
                </div>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="تسجيل الخروج" className="text-destructive hover:text-destructive">
                <button onClick={() => signOut({ callbackUrl: "/login" })}>
                  <LogOut className="h-4 w-4" />
                  <span>تسجيل الخروج</span>
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger className="ms-0" />
          {/* Search trigger button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="gap-2 max-w-xs text-muted-foreground"
          >
            <SearchIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">بحث شامل</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2"
            >
              {currentPageTitle && (
                <>
                  <h1 className="text-sm font-semibold text-foreground hidden sm:inline">{currentPageTitle}</h1>
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 hidden lg:inline-flex">صفحة نشطة</Badge>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="الإشعارات"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="تبديل المظهر"
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="h-4 w-4 hidden dark:block" />
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-6 max-w-[1400px] mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="mt-auto border-t bg-background/60 py-4 px-6 text-center text-xs text-muted-foreground">
          منصة تفريغ وتنسيق فيديوهات يوتيوب — مدعومة بـ Deepgram و OpenCode © {new Date().getFullYear()}
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
