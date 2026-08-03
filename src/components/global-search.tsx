"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Youtube,
  FileText,
  ScrollText,
  Brain,
  Search as SearchIcon,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SearchResult {
  type: "video" | "format" | "log" | "skill";
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  href: string;
  createdAt: string;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  counts?: {
    videos: number;
    formatJobs: number;
    logs: number;
    skills: number;
    total: number;
  };
}

const typeConfig = {
  video: { icon: Youtube, color: "text-primary bg-primary/10", label: "فيديو" },
  format: { icon: FileText, color: "text-violet-600 bg-violet-500/10", label: "تنسيق" },
  log: { icon: ScrollText, color: "text-slate-600 bg-slate-500/10", label: "سجل" },
  skill: { icon: Brain, color: "text-amber-600 bg-amber-500/10", label: "مهارة" },
};

const statusColors: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  inactive: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Debounced search
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      return;
    }
    // Focus input when opened
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  React.useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=15`);
        if (!res.ok) throw new Error("Search failed");
        const data: SearchResponse = await res.json();
        setResults(data.results);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      const r = results[selectedIndex];
      router.push(r.href);
      onOpenChange(false);
    }
  }

  // Scroll selected into view
  React.useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" dir="rtl">
        <DialogHeader className="sr-only">
          <DialogTitle>بحث شامل</DialogTitle>
        </DialogHeader>
        <div className="flex items-center border-b px-4">
          <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="ابحث في الفيديوهات، المهام، السجلات، المهارات..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
          {query && !loading && (
            <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {results.length} نتيجة
            </kbd>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto">
          {!query.trim() ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <SearchIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
              اكتب حرفين على الأقل للبحث
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
                  <Youtube className="h-3 w-3 text-primary" /> فيديوهات
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
                  <FileText className="h-3 w-3 text-violet-600" /> مهام تنسيق
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
                  <ScrollText className="h-3 w-3 text-slate-600" /> سجلات
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
                  <Brain className="h-3 w-3 text-amber-600" /> مهارات
                </span>
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <SearchIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
              لا توجد نتائج لـ &quot;{query}&quot;
            </div>
          ) : loading && results.length === 0 ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (
            <AnimatePresence>
              {results.map((r, idx) => {
                const cfg = typeConfig[r.type];
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={`${r.type}-${r.id}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    data-idx={idx}
                    onClick={() => {
                      router.push(r.href);
                      onOpenChange(false);
                    }}
                    className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border-b last:border-b-0 ${
                      idx === selectedIndex ? "bg-muted/60" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${cfg.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate" dir={r.type === "log" ? "ltr" : "rtl"}>
                          {r.title}
                        </span>
                        {r.status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                            statusColors[r.status] || statusColors.pending
                          }`}>
                            {r.status}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5" dir="ltr">
                        {r.subtitle}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                      <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-muted/30 px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="bg-background px-1.5 py-0.5 rounded border">↑↓</kbd>
              تنقّل
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-background px-1.5 py-0.5 rounded border">↵</kbd>
              فتح
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-background px-1.5 py-0.5 rounded border">Esc</kbd>
              إغلاق
            </span>
          </div>
          <span>بحث شامل</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
