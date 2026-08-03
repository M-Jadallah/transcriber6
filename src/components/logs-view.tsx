"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ScrollText,
  Search,
  Trash2,
  RefreshCw,
  ChevronDown,
  Info,
  AlertTriangle,
  AlertCircle,
  Bug,
  Filter,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  level: string;
  source: string;
  message: string;
  details: string | null;
  videoId: string | null;
  jobId: string | null;
  workerId: string | null;
  createdAt: string;
}

interface LogsResponse {
  logs: LogEntry[];
  total: number;
  hasMore: boolean;
}

const LEVEL_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  info: {
    label: "INFO",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    icon: <Info className="h-3 w-3" />,
  },
  warn: {
    label: "WARN",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  error: {
    label: "ERROR",
    className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-900",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  debug: {
    label: "DEBUG",
    className: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300 border-violet-200 dark:border-violet-900",
    icon: <Bug className="h-3 w-3" />,
  },
};

const SOURCE_OPTIONS = [
  { value: "all", label: "كل المصادر" },
  { value: "system", label: "system" },
  { value: "transcription", label: "transcription" },
  { value: "formatting", label: "formatting" },
  { value: "auth", label: "auth" },
  { value: "api", label: "api" },
  { value: "worker", label: "worker" },
  { value: "opencode", label: "opencode" },
  { value: "yt-dlp", label: "yt-dlp" },
  { value: "deepgram", label: "deepgram" },
];

const LEVEL_OPTIONS = [
  { value: "all", label: "كل المستويات" },
  { value: "info", label: "info" },
  { value: "warn", label: "warn" },
  { value: "error", label: "error" },
  { value: "debug", label: "debug" },
];

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

function formatExact(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function prettyPrintDetails(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function LogsView() {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 200;

  // Setter wrappers that reset pagination when filters change
  const onLevelChange = useCallback((v: string) => {
    setLevel(v);
    setOffset(0);
  }, []);
  const onSourceChange = useCallback((v: string) => {
    setSource(v);
    setOffset(0);
  }, []);
  const onSearchChange = useCallback((v: string) => {
    setSearch(v);
    setOffset(0);
  }, []);
  const onDateRangeChange = useCallback((v: string) => {
    setDateRange(v);
    setOffset(0);
  }, []);

  const queryKey = useMemo(
    () => ["logs", { level, source, search, dateRange, offset }],
    [level, source, search, dateRange, offset]
  );

  const { data, isLoading, isFetching } = useQuery<LogsResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (level !== "all") params.set("level", level);
      if (source !== "all") params.set("source", source);
      // Date range filter
      if (dateRange !== "all") {
        const now = new Date();
        const after = new Date(now);
        if (dateRange === "1h") after.setHours(now.getHours() - 1);
        else if (dateRange === "24h") after.setDate(now.getDate() - 1);
        else if (dateRange === "7d") after.setDate(now.getDate() - 7);
        else if (dateRange === "30d") after.setDate(now.getDate() - 30);
        params.set("after", after.toISOString());
      }
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) throw new Error("فشل تحميل السجلات");
      const json = await res.json();
      const totalCount = parseInt(res.headers.get("x-total-count") || "0", 10);
      return { ...json, total: totalCount || json.total || 0 };
    },
    refetchInterval: autoRefresh ? 5000 : false,
    placeholderData: (prev) => prev,
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const hasMore = data?.hasMore || false;

  // Clear all logs
  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/logs/clear", { method: "POST" });
      if (!res.ok) throw new Error("فشل مسح السجلات");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`تم مسح ${data.removed || 0} سجل`);
      setOffset(0);
      queryClient.invalidateQueries({ queryKey: ["logs"] });
    },
    onError: () => toast.error("فشل مسح السجلات"),
  });

  // Export logs
  const handleExport = useCallback((format: "csv" | "txt" | "json") => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (level !== "all") params.set("level", level);
    if (source !== "all") params.set("source", source);
    if (dateRange !== "all") {
      const now = new Date();
      const after = new Date(now);
      if (dateRange === "1h") after.setHours(now.getHours() - 1);
      else if (dateRange === "24h") after.setDate(now.getDate() - 1);
      else if (dateRange === "7d") after.setDate(now.getDate() - 7);
      else if (dateRange === "30d") after.setDate(now.getDate() - 30);
      params.set("after", after.toISOString());
    }
    window.location.href = `/api/logs/export?${params.toString()}`;
    toast.success("جاري تصدير السجلات", { description: `صيغة: ${format.toUpperCase()}` });
  }, [level, source, dateRange]);

  // Manual refresh
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["logs"] });
  }, [queryClient]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ScrollText className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">السجلات</h1>
          </div>
          <p className="text-sm text-muted-foreground">جميع العمليات الموثّقة</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="تحديث تلقائي"
            />
            <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">
              تحديث تلقائي
            </Label>
          </div>
          <Button variant="outline" size="icon" onClick={refresh} aria-label="تحديث">
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="py-4">
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" />
                المستوى
              </Label>
              <Select value={level} onValueChange={onLevelChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" />
                المصدر
              </Label>
              <Select value={source} onValueChange={onSourceChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Search className="h-3 w-3" />
                بحث في النص
              </Label>
              <Input
                placeholder="ابحث في رسائل السجل..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                الفترة
              </Label>
              <Select value={dateRange} onValueChange={onDateRangeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="1h">آخر ساعة</SelectItem>
                  <SelectItem value="24h">آخر 24 ساعة</SelectItem>
                  <SelectItem value="7d">آخر 7 أيام</SelectItem>
                  <SelectItem value="30d">آخر 30 يوم</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-xs text-muted-foreground">
              {isLoading ? (
                <span className="flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  جاري التحميل...
                </span>
              ) : (
                <span>
                  إجمالي: <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString("ar-EG")}</span> سجل
                  {logs.length > 0 && (
                    <span className="ms-2">· معروض: {logs.length.toLocaleString("ar-EG")}</span>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={total === 0}>
                    <Download className="h-3.5 w-3.5" />
                    تصدير
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>تصدير السجلات</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")}>
                    <FileSpreadsheet className="h-3.5 w-3.5 ms-1" />
                    CSV (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("txt")}>
                    <FileText className="h-3.5 w-3.5 ms-1" />
                    TXT (نص)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")}>
                    <FileJson className="h-3.5 w-3.5 ms-1" />
                    JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5" disabled={total === 0}>
                  <Trash2 className="h-3.5 w-3.5" />
                  مسح السجلات
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>مسح جميع السجلات؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حذف {total.toLocaleString("ar-EG")} سجل نهائياً. لا يمكن التراجع عن هذا الإجراء. سيُسجَّل حدث مسح واحد بعد التنفيذ.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => clearMutation.mutate()}
                    disabled={clearMutation.isPending}
                  >
                    {clearMutation.isPending ? "جاري المسح..." : "مسح الكل"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs list */}
      <Card className="py-0 overflow-hidden">
        <div
          className="overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 300px)" }}
        >
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin me-2" />
              جاري تحميل السجلات...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                <ScrollText className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">لا توجد سجلات</p>
                <p className="text-xs text-muted-foreground">
                  {search || level !== "all" || source !== "all"
                    ? "جرّب تعديل عوامل التصفية"
                    : "ستظهر السجلات هنا عند نشوئها"}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y font-mono text-xs">
              {logs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Pagination */}
      {logs.length > 0 && (hasMore || offset > 0) && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || isFetching}
          >
            السابق
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {offset + 1} - {offset + logs.length} من {total.toLocaleString("ar-EG")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={!hasMore || isFetching}
          >
            تحديث المزيد
          </Button>
        </div>
      )}
    </div>
  );
}

function LogRow({ log }: { log: LogEntry }) {
  const [open, setOpen] = useState(false);
  const levelCfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
  const prettyDetails = prettyPrintDetails(log.details);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="px-3 py-2 hover:bg-accent/30 transition-colors">
        <div className="flex items-start gap-3">
          {/* timestamp (relative + exact on hover) */}
          <div
            className="shrink-0 text-muted-foreground tabular-nums w-28 text-[11px] leading-5"
            title={formatExact(log.createdAt)}
          >
            {formatRelative(log.createdAt)}
          </div>

          {/* level badge */}
          <Badge variant="outline" className={cn("shrink-0 gap-0.5 font-mono text-[10px] px-1.5 py-0", levelCfg.className)}>
            {levelCfg.icon}
            {levelCfg.label}
          </Badge>

          {/* source badge */}
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px] px-1.5 py-0">
            {log.source}
          </Badge>

          {/* message (LTR for English) */}
          <div className="flex-1 min-w-0">
            <div
              dir="ltr"
              className="text-left text-foreground leading-5 break-words whitespace-pre-wrap"
            >
              {log.message}
            </div>
            {/* Context chips */}
            {(log.videoId || log.jobId || log.workerId) && (
              <div className="flex flex-wrap gap-1 mt-1" dir="ltr">
                {log.videoId && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    video:{log.videoId.slice(-8)}
                  </span>
                )}
                {log.jobId && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    job:{log.jobId.slice(-8)}
                  </span>
                )}
                {log.workerId && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    worker:{log.workerId}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* expand button */}
          {prettyDetails && (
            <CollapsibleTrigger asChild>
              <button
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
                aria-label="إظهار التفاصيل"
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
                />
              </button>
            </CollapsibleTrigger>
          )}
        </div>

        {/* Details (collapsible) */}
        {prettyDetails && (
          <CollapsibleContent>
            <pre
              dir="ltr"
              className="mt-2 ms-[7.75rem] rounded-md border bg-muted/50 p-3 text-[11px] leading-5 overflow-x-auto text-left"
            >
              {prettyDetails}
            </pre>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}
