"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Loader2,
  Download,
  RotateCcw,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Loader,
  XCircle,
  Sparkles,
  Cpu,
  Film,
  Package,
  Archive,
  Filter,
  Info,
  Calendar,
  Hash,
  Brain,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ===== Types =====
interface Video {
  id: string;
  title: string;
  youtubeId: string;
  duration: number | null;
  status: string;
  transcriptText: string | null;
  createdAt: string;
}

interface FormatJob {
  id: string;
  videoId: string;
  skillId: string;
  skillName: string;
  modelProvider: string;
  modelName: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  statusText: string | null;
  error: string | null;
  outputPath: string | null;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  video: Video | null;
}

interface Skill {
  id: string;
  name: string;
  gitRepo: string;
  branch: string;
  description: string | null;
  defaultModelProvider: string | null;
  defaultModelName: string | null;
  isActive: boolean;
  createdAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  codex: "Codex",
  deepseek: "DeepSeek",
};

const PROVIDER_MODELS: Record<string, string[]> = {
  openrouter: [
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash-exp",
    "meta-llama/llama-3.3-70b",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "o1"],
  codex: ["codex-mini-latest"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
};

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  processing: "قيد المعالجة",
  completed: "مكتمل",
  failed: "فشل",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    pending: {
      label: "قيد الانتظار",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-900",
      icon: <Clock className="h-3 w-3" />,
    },
    processing: {
      label: "قيد المعالجة",
      className: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-900",
      icon: <Loader className="h-3 w-3 animate-spin" />,
    },
    completed: {
      label: "مكتمل",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    failed: {
      label: "فشل",
      className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-900",
      icon: <XCircle className="h-3 w-3" />,
    },
  };
  const cfg = map[status] || map.pending;
  return (
    <Badge variant="outline" className={cn("gap-1", cfg.className)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "قبل لحظات";
  const min = Math.floor(sec / 60);
  if (min < 60) return `قبل ${min} ${min === 1 ? "دقيقة" : min <= 10 ? "دقائق" : "دقيقة"}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} ${hr === 1 ? "ساعة" : "ساعات"}`;
  const day = Math.floor(hr / 24);
  return `قبل ${day} ${day === 1 ? "يوم" : "أيام"}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ===== Main View =====
export function FormattingView() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [selectedJob, setSelectedJob] = useState<FormatJob | null>(null);

  // ===== Queries =====
  const { data: jobsData, isLoading } = useQuery<{ jobs: FormatJob[] }>({
    queryKey: ["format-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/format-jobs");
      if (!res.ok) throw new Error("فشل تحميل الوظائف");
      return res.json();
    },
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs || [];
      const hasActive = jobs.some((j) => j.status === "pending" || j.status === "processing");
      return hasActive ? 3000 : false;
    },
  });

  const jobs = useMemo(() => jobsData?.jobs || [], [jobsData]);

  // Real-time socket for format:progress
  useEffect(() => {
    let socket: Socket | null = null;
    try {
      socket = io("/?XTransformPort=3001", {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1500,
      });
      socket.on("format:progress", () => {
        queryClient.invalidateQueries({ queryKey: ["format-jobs"] });
      });
    } catch {
      // ignore — polling fallback still works
    }
    return () => {
      socket?.disconnect();
    };
  }, [queryClient]);

  // ===== Keyboard shortcuts =====
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        if (e.key === "Escape" && target.tagName === "INPUT") {
          (target as HTMLInputElement).blur();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="بحث"]') as HTMLInputElement;
        searchInput?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        const btns = Array.from(document.querySelectorAll("button"));
        const target = btns.find((b) => b.textContent?.includes("تنسيق جديد")) as HTMLButtonElement | undefined;
        target?.click();
      } else if (e.key === "Escape") {
        if (search) setSearch("");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [search]);

  // ===== Derived =====
  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (activeTab !== "all") list = list.filter((j) => j.status === activeTab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (j) =>
          j.video?.title?.toLowerCase().includes(q) ||
          j.skillName.toLowerCase().includes(q) ||
          j.modelName.toLowerCase().includes(q) ||
          j.modelProvider.toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, activeTab, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: jobs.length, pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const j of jobs) c[j.status] = (c[j.status] || 0) + 1;
    return c;
  }, [jobs]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredJobs.length) return new Set();
      return new Set(filteredJobs.map((j) => j.id));
    });
  }, [filteredJobs]);

  // ===== Mutations =====
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/format-jobs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("فشل الحذف");
      return id;
    },
    onSuccess: () => {
      toast.success("تم حذف الوظيفة");
      queryClient.invalidateQueries({ queryKey: ["format-jobs"] });
    },
    onError: () => toast.error("فشل حذف الوظيفة"),
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/format-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      if (!res.ok) throw new Error("فشل إعادة المحاولة");
      return res.json();
    },
    onSuccess: () => {
      toast.success("تمت إعادة جدولة الوظيفة");
      queryClient.invalidateQueries({ queryKey: ["format-jobs"] });
    },
    onError: () => toast.error("فشلت إعادة المحاولة"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/format-jobs/${id}`, { method: "DELETE" }).then((r) => r.ok)
        )
      );
      return results;
    },
    onSuccess: () => {
      toast.success("تم حذف الوظائف المحددة");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["format-jobs"] });
    },
    onError: () => toast.error("فشل حذف بعض الوظائف"),
  });

  const bulkRetryMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/format-jobs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "retry" }),
          }).then((r) => r.ok)
        )
      );
      return results;
    },
    onSuccess: () => {
      toast.success("تمت إعادة جدولة الوظائف المحددة");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["format-jobs"] });
    },
    onError: () => toast.error("فشلت إعادة المحاولة"),
  });

  const handleDownload = useCallback((ids: string[]) => {
    if (ids.length === 1) {
      window.open(`/api/download/formatted?id=${encodeURIComponent(ids[0])}`, "_blank");
    } else {
      window.open(
        `/api/download/formatted?ids=${ids.map(encodeURIComponent).join(",")}`,
        "_blank"
      );
    }
  }, []);

  const selectedList = useMemo(
    () => jobs.filter((j) => selectedIds.has(j.id)),
    [jobs, selectedIds]
  );
  const selectedDownloadable = useMemo(
    () => selectedList.filter((j) => j.status === "completed" && j.outputPath).map((j) => j.id),
    [selectedList]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">التنسيق</h1>
              <p className="text-xs text-muted-foreground">تنسيق التفريغات بالذكاء الاصطناعي</p>
            </div>
          </div>
        </div>
        <Button onClick={() => setNewDialogOpen(true)} className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          تنسيق جديد
        </Button>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FmtQuickStat
          icon={<Package className="h-4 w-4" />}
          label="إجمالي"
          value={counts.all}
          color="violet"
        />
        <FmtQuickStat
          icon={<Clock className="h-4 w-4" />}
          label="انتظار"
          value={counts.pending}
          color="amber"
        />
        <FmtQuickStat
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="مكتمل"
          value={counts.completed}
          color="emerald"
        />
        <FmtQuickStat
          icon={<XCircle className="h-4 w-4" />}
          label="فشل"
          value={counts.failed}
          color="red"
        />
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="all" className="gap-1.5">
              الكل
              <span className="text-xs text-muted-foreground">({counts.all})</span>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5">
              قيد الانتظار
              <span className="text-xs text-muted-foreground">({counts.pending})</span>
            </TabsTrigger>
            <TabsTrigger value="processing" className="gap-1.5">
              قيد المعالجة
              <span className="text-xs text-muted-foreground">({counts.processing})</span>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              مكتمل
              <span className="text-xs text-muted-foreground">({counts.completed})</span>
            </TabsTrigger>
            <TabsTrigger value="failed" className="gap-1.5">
              فشل
              <span className="text-xs text-muted-foreground">({counts.failed})</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab} className="sr-only">
            <></>
          </TabsContent>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث في الوظائف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
      </div>

      {/* Bulk select all row */}
      {filteredJobs.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-card/50 px-4 py-2 text-sm">
          <Checkbox
            checked={selectedIds.size === filteredJobs.length && filteredJobs.length > 0}
            onCheckedChange={toggleSelectAll}
            aria-label="تحديد الكل"
          />
          <span className="text-muted-foreground">
            {selectedIds.size > 0
              ? `تم تحديد ${selectedIds.size} وظيفة`
              : `تحديد الكل (${filteredJobs.length})`}
          </span>
        </div>
      )}

      {/* Jobs list */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin me-2" />
          جاري التحميل...
        </div>
      ) : filteredJobs.length === 0 ? (
        <EmptyState onNew={() => setNewDialogOpen(true)} hasJobs={jobs.length > 0} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              selected={selectedIds.has(job.id)}
              onSelectChange={() => toggleSelect(job.id)}
              onDownload={() => handleDownload([job.id])}
              onRetry={() => retryMutation.mutate(job.id)}
              onDelete={() => setConfirmDeleteId(job.id)}
              onShowDetails={setSelectedJob}
            />
          ))}
        </div>
      )}

      {/* Sticky bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto w-full max-w-3xl rounded-xl border bg-background/95 shadow-lg backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Badge variant="secondary">{selectedIds.size} محدد</Badge>
              <span className="text-muted-foreground hidden sm:inline">
                {selectedDownloadable.length} جاهز للتنزيل
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(selectedDownloadable)}
                disabled={selectedDownloadable.length === 0}
                className="gap-1.5"
              >
                <FileText className="h-4 w-4" />
                تنزيل Word
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload(selectedDownloadable)}
                disabled={selectedDownloadable.length < 2}
                className="gap-1.5"
              >
                <Archive className="h-4 w-4" />
                تنزيل ZIP
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkRetryMutation.mutate(Array.from(selectedIds))}
                disabled={bulkRetryMutation.isPending}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmBulkDelete(true)}
                className="gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New format dialog (multi-step wizard) */}
      <NewFormatDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onCreated={() => {
          setNewDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["format-jobs"] });
        }}
      />

      {/* Confirm delete single */}
      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه الوظيفة؟ سيتم حذف الملف الناتج (إن وُجد) ولا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm bulk delete */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {selectedIds.size} وظيفة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الوظائف المحددة وملفاتها الناتجة. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                bulkDeleteMutation.mutate(Array.from(selectedIds));
                setConfirmBulkDelete(false);
              }}
            >
              حذف الكل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Job Details Sheet */}
      <JobDetailsSheet
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onDownload={() => {
          if (selectedJob) handleDownload([selectedJob.id]);
          setSelectedJob(null);
        }}
        onRetry={() => {
          if (selectedJob) retryMutation.mutate(selectedJob.id);
          setSelectedJob(null);
        }}
      />
    </div>
  );
}

// ===== Job Card =====
function JobCard({
  job,
  selected,
  onSelectChange,
  onDownload,
  onRetry,
  onDelete,
  onShowDetails,
}: {
  job: FormatJob;
  selected: boolean;
  onSelectChange: () => void;
  onDownload: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onShowDetails: (job: FormatJob) => void;
}) {
  const canDownload = job.status === "completed" && !!job.outputPath;
  return (
    <Card className={cn("relative gap-3 py-4 transition-shadow hover:shadow-md", selected && "ring-2 ring-primary")}>
      <CardHeader className="gap-2 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Checkbox checked={selected} onCheckedChange={onSelectChange} aria-label="تحديد" className="mt-1" />
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-sm font-semibold leading-snug line-clamp-2" title={job.video?.title || ""}>
                {job.video?.title || "فيديو محذوف"}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  <Sparkles className="h-3 w-3" />
                  {job.skillName}
                </Badge>
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Cpu className="h-3 w-3" />
                  {PROVIDER_LABELS[job.modelProvider] || job.modelProvider} · {job.modelName}
                </Badge>
              </div>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {job.statusText || (job.status === "completed" ? "اكتمل" : job.status === "failed" ? "فشل" : "—")}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">{job.progress}%</span>
          </div>
          <Progress
            value={job.progress}
            className={cn(
              "h-1.5",
              job.status === "completed" && "[&>[data-slot=progress-indicator]]:bg-emerald-500",
              job.status === "failed" && "[&>[data-slot=progress-indicator]]:bg-destructive",
              job.status === "processing" && "[&>[data-slot=progress-indicator]]:bg-sky-500"
            )}
          />
        </div>

        {job.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive line-clamp-2" title={job.error}>
            {job.error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{formatRelative(job.createdAt)}</span>
          {job.video?.duration ? <span className="font-mono">{formatDuration(job.video.duration)}</span> : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onShowDetails(job)}
                className="h-8 px-2"
                aria-label="تفاصيل"
              >
                <Info className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">عرض التفاصيل</TooltipContent>
          </Tooltip>
          <Button
            size="sm"
            variant="default"
            onClick={onDownload}
            disabled={!canDownload}
            className="gap-1.5 h-8"
          >
            <Download className="h-3.5 w-3.5" />
            تنزيل
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={job.status === "processing" || job.status === "pending"}
            className="gap-1.5 h-8"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            إعادة
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="gap-1.5 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            حذف
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Empty state =====
function EmptyState({ onNew, hasJobs }: { onNew: () => void; hasJobs: boolean }) {
  return (
    <Card className="border-dashed py-12">
      <CardContent className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
          {hasJobs ? (
            <Filter className="h-8 w-8 text-muted-foreground" />
          ) : (
            <Package className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-1">
          <p className="text-lg font-medium">
            {hasJobs ? "لا توجد وظائف مطابقة" : "لا توجد وظائف تنسيق بعد"}
          </p>
          <p className="text-sm text-muted-foreground">
            {hasJobs
              ? "جرّب تغيير عوامل التصفية أو البحث"
              : "ابدأ بإنشاء أول وظيفة تنسيق لتفريغ موجود"}
          </p>
        </div>
        {!hasJobs && (
          <Button onClick={onNew} className="gap-2">
            <Plus className="h-4 w-4" />
            تنسيق جديد
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ===== New Format Dialog (Multi-step wizard) =====
function NewFormatDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [pickedVideoIds, setPickedVideoIds] = useState<Set<string>>(new Set());
  const [pickedSkillId, setPickedSkillId] = useState<string>("");
  const [pickedProvider, setPickedProvider] = useState<string>("openrouter");
  const [pickedModelName, setPickedModelName] = useState<string>("");
  const [videoSearch, setVideoSearch] = useState("");

  // Reset on close
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep(1);
        setPickedVideoIds(new Set());
        setPickedSkillId("");
        setPickedProvider("openrouter");
        setPickedModelName("");
        setVideoSearch("");
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Fetch transcribed videos (completed)
  const { data: videosData, isLoading: videosLoading } = useQuery<{ videos: Video[] }>({
    queryKey: ["videos", "completed"],
    queryFn: async () => {
      const res = await fetch("/api/videos?status=completed");
      if (!res.ok) throw new Error("فشل تحميل الفيديوهات");
      return res.json();
    },
    enabled: open,
    staleTime: 30_000,
  });

  const videos = useMemo(() => videosData?.videos || [], [videosData]);
  const filteredVideos = useMemo(() => {
    if (!videoSearch.trim()) return videos;
    const q = videoSearch.trim().toLowerCase();
    return videos.filter((v) => v.title.toLowerCase().includes(q) || v.youtubeId.includes(q));
  }, [videos, videoSearch]);

  // Fetch skills
  const { data: skillsData } = useQuery<{ skills: Skill[] }>({
    queryKey: ["skills"],
    queryFn: async () => {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error("فشل تحميل المهارات");
      return res.json();
    },
    enabled: open,
    staleTime: 30_000,
  });

  const skills = useMemo(() => skillsData?.skills || [], [skillsData]);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === pickedSkillId),
    [skills, pickedSkillId]
  );

  // When skill selected (via handler, not effect), prefill provider + model
  const onSkillChange = useCallback((skillId: string) => {
    setPickedSkillId(skillId);
    const skill = skills.find((s) => s.id === skillId);
    if (skill?.defaultModelProvider) {
      setPickedProvider(skill.defaultModelProvider);
    }
    if (skill?.defaultModelName) {
      setPickedModelName(skill.defaultModelName);
    } else if (skill?.defaultModelProvider) {
      const defaults = PROVIDER_MODELS[skill.defaultModelProvider];
      if (defaults && defaults.length > 0) setPickedModelName(defaults[0]);
    }
  }, [skills]);

  // When provider changes manually, suggest default model if model is empty
  const onProviderChange = (provider: string) => {
    setPickedProvider(provider);
    if (!pickedModelName || !PROVIDER_MODELS[pickedProvider]?.includes(pickedModelName)) {
      const defaults = PROVIDER_MODELS[provider];
      if (defaults && defaults.length > 0) setPickedModelName(defaults[0]);
    }
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/format-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoIds: Array.from(pickedVideoIds),
          skillId: pickedSkillId,
          modelProvider: pickedProvider,
          modelName: pickedModelName,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل إنشاء الوظائف");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(`تم إنشاء ${pickedVideoIds.size} وظيفة تنسيق`);
      onCreated();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const canNext = step === 1 ? pickedVideoIds.size > 0 : step === 2 ? !!pickedSkillId : !!pickedModelName && !!pickedProvider;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            تنسيق جديد
          </DialogTitle>
          <DialogDescription>
            اختر الفيديوهات والمهارة والنموذج لإنشاء وظائف التنسيق
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-between gap-1 px-1 pb-2">
          {[
            { n: 1, label: "الفيديوهات" },
            { n: 2, label: "المهارة" },
            { n: 3, label: "النموذج" },
            { n: 4, label: "تأكيد" },
          ].map((s, idx) => (
            <div key={s.n} className="flex flex-1 items-center gap-1">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    step >= s.n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium hidden sm:inline",
                    step >= s.n ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {idx < 3 && <div className={cn("h-px flex-1 mx-1", step > s.n ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 min-h-0">
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">
                  اختر الفيديوهات المُفرّغة ({pickedVideoIds.size})
                </Label>
                <span className="text-xs text-muted-foreground">{videos.length} متاح</span>
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث في الفيديوهات..."
                  value={videoSearch}
                  onChange={(e) => setVideoSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
              <ScrollArea className="h-[300px] rounded-md border">
                {videosLoading ? (
                  <div className="flex h-full items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                    جاري التحميل...
                  </div>
                ) : filteredVideos.length === 0 ? (
                  <div className="flex h-full items-center justify-center py-12 text-sm text-muted-foreground">
                    {videos.length === 0
                      ? "لا توجد فيديوهات مُفرّغة بعد. أكمل التفريغ أولاً."
                      : "لا توجد نتائج مطابقة"}
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredVideos.map((v) => {
                      const checked = pickedVideoIds.has(v.id);
                      return (
                        <label
                          key={v.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50",
                            checked && "bg-accent/40"
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              setPickedVideoIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(v.id)) next.delete(v.id);
                                else next.add(v.id);
                                return next;
                              });
                            }}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug line-clamp-1">{v.title}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span className="font-mono">{v.youtubeId}</span>
                              {v.duration ? <span className="font-mono">{formatDuration(v.duration)}</span> : null}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">اختر المهارة</Label>
              {skills.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Package className="h-8 w-8" />
                  <p>لا توجد مهارات مضافة بعد.</p>
                  <p className="text-xs">أضف مهارة من صفحة الإعدادات أولاً.</p>
                </div>
              ) : (
                <>
                  <Select value={pickedSkillId} onValueChange={onSkillChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="اختر مهارة..." />
                    </SelectTrigger>
                    <SelectContent>
                      {skills.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSkill && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                      {selectedSkill.description && (
                        <p className="text-foreground leading-relaxed">{selectedSkill.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-mono">
                          {selectedSkill.gitRepo}
                        </Badge>
                        <Badge variant="secondary">{selectedSkill.branch}</Badge>
                        {selectedSkill.defaultModelProvider && (
                          <Badge variant="outline" className="gap-1">
                            <Cpu className="h-3 w-3" />
                            {PROVIDER_LABELS[selectedSkill.defaultModelProvider] || selectedSkill.defaultModelProvider}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">مزوّد النموذج</Label>
                <Select value={pickedProvider} onValueChange={onProviderChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">اسم النموذج</Label>
                <Input
                  value={pickedModelName}
                  onChange={(e) => setPickedModelName(e.target.value)}
                  placeholder="model-name"
                  className="font-mono"
                  dir="ltr"
                />
                {PROVIDER_MODELS[pickedProvider] && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {PROVIDER_MODELS[pickedProvider].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPickedModelName(m)}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-mono transition-colors",
                          pickedModelName === m
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">الفيديوهات المختارة</p>
                  <p className="text-sm font-medium">{pickedVideoIds.size} فيديو</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">المهارة</p>
                  <p className="text-sm font-medium">{selectedSkill?.name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">المزوّد والنموذج</p>
                  <p className="text-sm font-medium font-mono" dir="ltr">
                    {PROVIDER_LABELS[pickedProvider]} · {pickedModelName}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                سيتم إنشاء {pickedVideoIds.size} وظيفة تنسيق مستقلة. ستظهر في القائمة فوراً وتُعالج تباعاً حسب توفّر العمّال.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep(step - 1))}
            className="gap-1"
          >
            <ChevronRight className="h-4 w-4" />
            {step === 1 ? "إلغاء" : "السابق"}
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1">
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="gap-1.5"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الإنشاء...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  إنشاء {pickedVideoIds.size} وظيفة
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Quick Stat Card for Formatting
// ─────────────────────────────────────────────────────────────
function FmtQuickStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "violet" | "amber" | "emerald" | "red";
}) {
  const colors = {
    violet: "bg-violet-500/10 text-violet-600 border-violet-500/20",
    amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    red: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  return (
    <div className={`relative flex items-center gap-3 rounded-xl border p-3 ${colors[color]} overflow-hidden transition-transform hover:scale-[1.02]`}>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]}`}>
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] text-muted-foreground leading-none mb-1">{label}</span>
        <span className="text-xl font-bold tabular-nums leading-none">{value}</span>
      </div>
    </div>
  );
}

// ===== Job Details Sheet =====
function JobDetailsSheet({
  job,
  onClose,
  onDownload,
  onRetry,
}: {
  job: FormatJob | null;
  onClose: () => void;
  onDownload: () => void;
  onRetry: () => void;
}) {
  const open = !!job;

  if (!job) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="left" />
      </Sheet>
    );
  }

  const isProcessing = job.status === "processing";
  const isPending = job.status === "pending";
  const isCompleted = job.status === "completed" && !!job.outputPath;
  const isFailed = job.status === "failed";

  const statusLabel = isCompleted ? "مكتمل" : isProcessing ? "قيد المعالجة" : isPending ? "قيد الانتظار" : "فشل";
  const statusColor = isCompleted
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
    : isProcessing
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
    : isPending
    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";

  function formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `قبل ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `قبل ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `قبل ${days} يوم`;
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        <SheetHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 shrink-0">
              <FileText className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight line-clamp-2">
                {job.video?.title || "فيديو محذوف"}
              </SheetTitle>
              <SheetDescription className="text-xs flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {job.skillName}
              </SheetDescription>
            </div>
            <Badge variant="outline" className={statusColor}>
              {statusLabel}
            </Badge>
          </div>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4 mt-4">
          {/* Progress (if processing) */}
          {isProcessing && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                  قيد المعالجة
                </span>
                <span className="text-sm font-bold tabular-nums">{job.progress}%</span>
              </div>
              <Progress value={job.progress} className="h-2" />
              {job.statusText && (
                <p className="text-xs text-muted-foreground font-mono" dir="ltr">{job.statusText}</p>
              )}
            </div>
          )}

          {/* Error (if failed) */}
          {isFailed && job.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/10 p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                <XCircle className="h-4 w-4" />
                سبب الفشل
              </h3>
              <p className="text-sm font-mono text-red-700 dark:text-red-300 break-all" dir="ltr">
                {job.error}
              </p>
            </div>
          )}

          {/* AI Model info */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              إعدادات الذكاء الاصطناعي
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">المزوّد</span>
                <Badge variant="secondary" className="text-xs">
                  {PROVIDER_LABELS[job.modelProvider] || job.modelProvider}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">الموديل</span>
                <span className="font-mono text-xs" dir="ltr">{job.modelName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">المهارة</span>
                <span className="font-medium text-xs">{job.skillName}</span>
              </div>
            </div>
          </div>

          {/* Job info */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              معلومات المهمة
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> أُنشئت
                </span>
                <p className="font-medium">{formatRelative(job.createdAt)}</p>
              </div>
              {job.startedAt && (
                <div>
                  <span className="text-muted-foreground text-xs">بدأت</span>
                  <p className="font-medium">{formatRelative(job.startedAt)}</p>
                </div>
              )}
              {job.completedAt && (
                <div>
                  <span className="text-muted-foreground text-xs">اكتملت</span>
                  <p className="font-medium">{formatRelative(job.completedAt)}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground text-xs">المحاولات</span>
                <p className="font-medium">{job.attempts}</p>
              </div>
            </div>
          </div>

          {/* Video info */}
          {job.video && (
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Film className="h-4 w-4 text-muted-foreground" />
                الفيديو المصدر
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">العنوان</span>
                  <span className="font-medium text-xs truncate max-w-[250px]">{job.video.title}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs flex items-center gap-1">
                    <Hash className="h-3 w-3" /> معرّف يوتيوب
                  </span>
                  <a
                    href={`https://www.youtube.com/watch?v=${job.video.youtubeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs hover:text-primary inline-flex items-center gap-1"
                  >
                    {job.video.youtubeId}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Output file */}
          {isCompleted && job.outputPath && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10 p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                الملف الناتج
              </h3>
              <p className="text-xs font-mono text-emerald-700 dark:text-emerald-300 break-all" dir="ltr">
                {job.outputPath}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={onDownload}
              disabled={!isCompleted}
            >
              <Download className="h-3.5 w-3.5" />
              تنزيل Word
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={onRetry}
              disabled={isProcessing || isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              إعادة المحاولة
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
