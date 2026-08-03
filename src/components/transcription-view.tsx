"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { motion } from "framer-motion";
import {
  AudioLines,
  Plus,
  Download,
  RefreshCw,
  Trash2,
  FileText,
  Youtube,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ListVideo,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  Search,
  X,
  Info,
  Calendar,
  Cookie,
  Cpu,
  Hash,
  Clock3,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  REALTIME_URL,
  SOCKET_PATH,
  SOCKET_QUERY,
} from "@/lib/socket-client";

// ─────────────────────────────────────────────────────────────
// Types — matches the Prisma `Video` shape we return from /api/videos
// ─────────────────────────────────────────────────────────────
type VideoStatus =
  | "pending"
  | "downloading"
  | "uploading"
  | "transcribing"
  | "completed"
  | "failed";

interface PlaylistRef {
  id: string;
  title: string | null;
  url: string;
}
interface Video {
  id: string;
  youtubeId: string;
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  playlistId: string | null;
  playlist: PlaylistRef | null;
  status: VideoStatus;
  progress: number;
  statusText: string | null;
  audioPath: string | null;
  transcriptText: string | null;
  transcriptJson: string | null;
  workerId: string | null;
  attempts: number;
  maxAttempts: number;
  cookieUsed: string | null;
  deepgramKey: number | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VideosResponse {
  total: number;
  count: number;
  limit: number;
  offset: number;
  videos: Video[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const PROCESSING_STATUSES: VideoStatus[] = ["downloading", "uploading", "transcribing"];
const ACTIVE_STATUSES: VideoStatus[] = ["pending", ...PROCESSING_STATUSES];

function isProcessing(s: VideoStatus) {
  return PROCESSING_STATUSES.includes(s);
}

function statusLabel(s: VideoStatus): string {
  switch (s) {
    case "pending":
      return "قيد الانتظار";
    case "downloading":
      return "تنزيل الصوت";
    case "uploading":
      return "رفع إلى Deepgram";
    case "transcribing":
      return "جارٍ التفريغ";
    case "completed":
      return "مكتمل";
    case "failed":
      return "فشل";
    default:
      return s;
  }
}

function statusArabicStage(statusText: string | null, status: VideoStatus): string {
  if (status === "completed") return "اكتمل التفريغ بنجاح";
  if (status === "pending") return "بانتظار المعالجة";
  if (status === "failed") return "فشلت العملية";
  // Use the English statusText for processing stages but provide a generic Arabic fallback
  if (statusText) return statusText;
  return statusLabel(status);
}

function statusBadgeClass(s: VideoStatus): string {
  switch (s) {
    case "pending":
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800";
    case "downloading":
    case "uploading":
    case "transcribing":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900";
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900";
    default:
      return "";
  }
}

function StatusIcon({ status, className }: { status: VideoStatus; className?: string }) {
  if (status === "completed") return <CheckCircle2 className={className} />;
  if (status === "failed") return <XCircle className={className} />;
  if (isProcessing(status)) return <Loader2 className={`${className} animate-spin`} />;
  return <Clock className={className} />;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const days = Math.floor(h / 24);
  return `منذ ${days} يوم`;
}

function truncate(s: string | null, n = 90): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ─────────────────────────────────────────────────────────────
// Add-Video Dialog
// ─────────────────────────────────────────────────────────────
function AddVideoDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("الرجاء إدخال رابط فيديو يوتيوب");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "فشل في إضافة الفيديو", {
          description: data?.details,
        });
        return;
      }
      if (data.kind === "playlist") {
        toast.success("جاري جلب معلومات قائمة التشغيل...", {
          description: `تمت إضافة ${data.videoCount} فيديو من قائمة التشغيل`,
        });
      } else {
        toast.success("تمت إضافة الفيديو", {
          description: "سيبدأ التفريغ تلقائيًا قريبًا",
        });
      }
      setUrl("");
      setOpen(false);
      onAdded();
    } catch (err: any) {
      toast.error("خطأ في الشبكة", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          <span>إضافة تفريغ</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-primary" />
            إضافة تفريغ جديد
          </DialogTitle>
          <DialogDescription>
            أدخل رابط فيديو أو قائمة تشغيل من يوتيوب لبدء عملية التفريغ.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="yt-url">رابط يوتيوب</Label>
            <Input
              id="yt-url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              dir="ltr"
              className="text-right"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              يدعم النظام الفيديوهات المفردة وكذلك قوائم التشغيل الكاملة. سيتم
              إنشاء سجل لكل فيديو على حدة وبدء التفريغ تلقائيًا.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>إضافة وبدء التفريغ</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Bulk-Download format picker dialog
// ─────────────────────────────────────────────────────────────
type DownloadFormat = "txt" | "docx" | "json";

function BulkDownloadDialog({
  ids,
  open,
  onOpenChange,
  onDone,
}: {
  ids: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [format, setFormat] = React.useState<DownloadFormat>("txt");

  function triggerDownload() {
    if (ids.length === 0) return;
    const url = `/api/download/transcript?ids=${encodeURIComponent(
      ids.join(",")
    )}&format=${format}`;
    window.location.href = url;
    toast.success("جاري تنزيل الملفات المضغوطة...", {
      description:
        format === "txt" ? "صيغة نصية (TXT)" : format === "docx" ? "صيغة Word (DOCX)" : "صيغة JSON",
    });
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            تنزيل التفريغات المحددة
          </DialogTitle>
          <DialogDescription>
            تم تحديد {ids.length} عنصر. اختر صيغة التنزيل — سيتم إنشاء ملف مضغوط (ZIP).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>صيغة الملف</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as DownloadFormat)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر الصيغة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="txt">نص (TXT)</SelectItem>
              <SelectItem value="docx">Word (DOCX)</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              إلغاء
            </Button>
          </DialogClose>
          <Button type="button" onClick={triggerDownload} className="gap-2">
            <Download className="h-4 w-4" />
            تنزيل الملفات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Video Card
// ─────────────────────────────────────────────────────────────
function VideoCard({
  video,
  selected,
  onSelect,
  onAction,
  onShowDetails,
}: {
  video: Video;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onAction: (action: "retry" | "delete", id: string) => void;
  onShowDetails: (video: Video) => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  function triggerSingleDownload(format: DownloadFormat) {
    const url = `/api/download/transcript?id=${encodeURIComponent(video.id)}&format=${format}`;
    window.location.href = url;
    toast.success("جاري التنزيل...", {
      description: video.title,
    });
  }

  const canDownload = video.status === "completed" && !!video.transcriptText;
  const isProc = isProcessing(video.status);

  return (
    <Card
      className={`group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/30 ${
        selected ? "ring-2 ring-primary/40 border-primary/30" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Selection checkbox (right side in RTL = visually right) */}
          <div className="flex items-start pt-1">
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onSelect(!!v)}
              aria-label="تحديد الفيديو"
            />
          </div>

          {/* Thumbnail — appears on the right in RTL */}
          <div className="relative shrink-0">
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              title="فتح في يوتيوب"
            >
              {video.thumbnail ? (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="h-20 w-32 rounded-md object-cover border bg-muted"
                  loading="lazy"
                />
              ) : (
                <div className="h-20 w-32 rounded-md border bg-muted flex items-center justify-center">
                  <Youtube className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </a>
            {video.duration ? (
              <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
                {formatDuration(video.duration)}
              </span>
            ) : null}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start gap-2">
              <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">
                {video.title}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={`gap-1 ${statusBadgeClass(video.status)}`}>
                <StatusIcon status={video.status} className="h-3 w-3" />
                {statusLabel(video.status)}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] gap-1">
                <Youtube className="h-3 w-3" />
                {video.youtubeId}
              </Badge>
              {video.playlist && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <ListVideo className="h-3 w-3" />
                      <span className="max-w-[80px] truncate">
                        {video.playlist.title || "قائمة تشغيل"}
                      </span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {video.playlist.title || "قائمة تشغيل"}
                  </TooltipContent>
                </Tooltip>
              )}
              {video.attempts > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={`text-[10px] gap-1 ${
                        video.attempts >= video.maxAttempts
                          ? "border-red-200 text-red-700 dark:border-red-900 dark:text-red-300"
                          : "border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-300"
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      المحاولة {video.attempts}/{video.maxAttempts}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    عدد محاولات إعادة التفريغ
                  </TooltipContent>
                </Tooltip>
              )}
              {video.cookieUsed && (
                <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  {video.cookieUsed}
                </Badge>
              )}
            </div>

            {/* Progress bar (only for processing or completed) */}
            {(isProc || video.status === "completed") && (
              <div className="space-y-1">
                <Progress
                  value={video.progress}
                  className={`h-1.5 ${
                    video.status === "completed" ? "[&>div]:bg-emerald-500" : ""
                  }`}
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{statusArabicStage(video.statusText, video.status)}</span>
                  <span className="tabular-nums shrink-0 ms-2">{video.progress}%</span>
                </div>
              </div>
            )}

            {/* Error display */}
            {video.status === "failed" && video.error && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 p-2">
                <p className="text-[11px] text-red-700 dark:text-red-300 line-clamp-2">
                  <span className="font-medium">الخطأ: </span>
                  {truncate(video.error, 140)}
                </p>
              </div>
            )}

            {/* Footer row: time + actions */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-muted-foreground">
                {timeAgo(video.createdAt)}
              </span>
              <div className="flex items-center gap-1">
                {/* Details */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => onShowDetails(video)}
                      aria-label="تفاصيل"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">عرض التفاصيل</TooltipContent>
                </Tooltip>

                {/* Download dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      disabled={!canDownload}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">تنزيل</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="text-xs">اختر الصيغة</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => triggerSingleDownload("txt")} className="gap-2">
                      <FileText className="h-4 w-4" />
                      نص (TXT)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => triggerSingleDownload("docx")} className="gap-2">
                      <FileText className="h-4 w-4" />
                      Word (DOCX)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => triggerSingleDownload("json")} className="gap-2">
                      <FileText className="h-4 w-4" />
                      JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Format action — links to formatting page */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      asChild
                      disabled={!canDownload}
                    >
                      <Link href={`/formatting?video=${video.id}`} aria-label="تنسيق">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">تنسيق</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">تنسيق النص بالذكاء الاصطناعي</TooltipContent>
                </Tooltip>

                {/* Retry */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      disabled={isProc || video.status === "pending"}
                      onClick={() => onAction("retry", video.id)}
                      aria-label="إعادة المحاولة"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">إعادة المحاولة</TooltipContent>
                </Tooltip>

                {/* Delete with confirm */}
                <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDelete(true)}
                        aria-label="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">حذف</TooltipContent>
                  </Tooltip>
                  <AlertDialogContent dir="rtl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                      <AlertDialogDescription>
                        هل أنت متأكد من حذف هذا التفريغ؟ سيتم حذف النص والملف الصوتي نهائيًا ولا يمكن التراجع.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => {
                          setConfirmDelete(false);
                          onAction("delete", video.id);
                        }}
                      >
                        حذف نهائي
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────
function VideoCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <Skeleton className="h-5 w-5 rounded mt-1" />
          <Skeleton className="h-20 w-32 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="flex justify-between pt-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-4">
          <AudioLines className="h-10 w-10 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">لا توجد تفريغات بعد</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          ابدأ بإضافة رابط فيديو يوتيوب وسيقوم النظام بتفريغه تلقائيًا باستخدام
          Deepgram.
        </p>
        <Button onClick={onAdd} className="mt-6 gap-2">
          <Plus className="h-4 w-4" />
          إضافة أول تفريغ
        </Button>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────
type FilterTab = "all" | "pending" | "processing" | "completed" | "failed";

export function TranscriptionView() {
  const [filter, setFilter] = React.useState<FilterTab>("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkDownloadOpen, setBulkDownloadOpen] = React.useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);
  const [bulkActionLoading, setBulkActionLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedVideo, setSelectedVideo] = React.useState<Video | null>(null);
  const queryClient = useQueryClient();

  // ── Fetch videos ──
  const { data, isLoading, isFetching } = useQuery<VideosResponse>({
    queryKey: ["videos", filter],
    queryFn: async () => {
      const res = await fetch(`/api/videos?status=${filter}&limit=200`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("فشل تحميل القائمة");
      return res.json() as Promise<VideosResponse>;
    },
    refetchInterval: (query) => {
      // Poll every 3s when there are active jobs
      const data = query.state.data as VideosResponse | undefined;
      if (data?.videos?.some((v) => ACTIVE_STATUSES.includes(v.status))) {
        return 3000;
      }
      return false;
    },
    refetchOnWindowFocus: true,
  });

  const videos = data?.videos ?? [];
  const hasActive = videos.some((v) => ACTIVE_STATUSES.includes(v.status));

  // ── Search filter (client-side) ──
  const filteredVideos = React.useMemo(() => {
    if (!searchQuery.trim()) return videos;
    const q = searchQuery.trim().toLowerCase();
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.youtubeId.toLowerCase().includes(q) ||
        (v.statusText || "").toLowerCase().includes(q)
    );
  }, [videos, searchQuery]);

  // ── Socket.io for real-time progress ──
  React.useEffect(() => {
    let socket: Socket | null = null;
    try {
      socket = io(REALTIME_URL, {
        path: SOCKET_PATH,
        query: SOCKET_QUERY,
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1500,
      });
      socket.on("video:progress", () => {
        // Invalidate cache so refetch picks up new progress
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      });
      socket.on("connect_error", () => {
        // silent — polling will still work
      });
    } catch {
      // ignore
    }
    return () => {
      try {
        socket?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [queryClient]);

  // ── Keyboard shortcuts ──
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't trigger if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        // Escape blurs the search
        if (e.key === "Escape" && target.tagName === "INPUT") {
          (target as HTMLInputElement).blur();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="ابحث"]') as HTMLInputElement;
        searchInput?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        const addBtn = document.querySelector('button:has(> span:contains("إضافة تفريغ"))') as HTMLButtonElement;
        // Fallback: find by text
        if (!addBtn) {
          const btns = Array.from(document.querySelectorAll("button"));
          const target = btns.find((b) => b.textContent?.includes("إضافة تفريغ")) as HTMLButtonElement | undefined;
          target?.click();
        } else {
          addBtn.click();
        }
      } else if (e.key === "Escape") {
        if (searchQuery) setSearchQuery("");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchQuery]);

  // ── Selection handlers ──
  function toggleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function selectAll(checked: boolean) {
    if (checked) setSelected(new Set(videos.map((v) => v.id)));
    else setSelected(new Set());
  }
  const selectedIds = React.useMemo(() => Array.from(selected), [selected]);
  const allSelected = videos.length > 0 && selected.size === videos.length;
  const someSelected = selected.size > 0 && !allSelected;

  // ── Per-card action ──
  async function handleCardAction(action: "retry" | "delete", id: string) {
    try {
      if (action === "retry") {
        const res = await fetch(`/api/videos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retry" }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d?.error || "فشل");
        }
        toast.success("تمت إعادة الجدولة", { description: "سيبدأ التفريغ قريبًا" });
      } else {
        const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d?.error || "فشل");
        }
        toast.success("تم حذف التفريغ");
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ");
    }
  }

  // ── Bulk actions ──
  async function handleBulkAction(action: "retry" | "delete") {
    if (selectedIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      const res = await fetch("/api/videos/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "فشل");
      if (action === "delete") {
        toast.success(`تم حذف ${data.deleted} عنصر`);
        setSelected(new Set());
      } else {
        toast.success(`تمت إعادة جدولة ${data.retried} عنصر`);
      }
      queryClient.invalidateQueries({ queryKey: ["videos"] });
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ");
    } finally {
      setBulkActionLoading(false);
      setConfirmBulkDelete(false);
    }
  }

  function triggerBulkDownload() {
    if (selectedIds.length === 0) return;
    setBulkDownloadOpen(true);
  }

  // ── Counts per tab ──
  const counts = React.useMemo(() => {
    const all = videos.length;
    const pending = videos.filter((v) => v.status === "pending").length;
    const processing = videos.filter((v) => isProcessing(v.status)).length;
    const completed = videos.filter((v) => v.status === "completed").length;
    const failed = videos.filter((v) => v.status === "failed").length;
    return { all, pending, processing, completed, failed };
  }, [videos]);

  return (
    <div className="flex flex-col gap-4 pb-32">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md">
            <AudioLines className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">التفريغ</h1>
            <p className="text-sm text-muted-foreground">
              تفريغ فيديوهات يوتيوب تلقائيًا باستخدام Deepgram
            </p>
          </div>
        </div>
        <AddVideoDialog onAdded={() => queryClient.invalidateQueries({ queryKey: ["videos"] })} />
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStatCard
          icon={<Youtube className="h-4 w-4" />}
          label="إجمالي"
          value={counts.all}
          color="primary"
        />
        <QuickStatCard
          icon={<Loader2 className={`h-4 w-4 ${hasActive ? "animate-spin" : ""}`} />}
          label="نشط"
          value={counts.processing}
          color="amber"
          pulse={hasActive}
        />
        <QuickStatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="مكتمل"
          value={counts.completed}
          color="emerald"
        />
        <QuickStatCard
          icon={<XCircle className="h-4 w-4" />}
          label="فشل"
          value={counts.failed}
          color="red"
        />
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="ابحث بالعنوان أو معرّف الفيديو..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-9 ps-3 h-10 bg-background"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="مسح البحث"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="gap-1.5">
              الكل
              <span className="text-[10px] text-muted-foreground tabular-nums">
                ({counts.all})
              </span>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              قيد الانتظار
              <span className="text-[10px] text-muted-foreground tabular-nums">
                ({counts.pending})
              </span>
            </TabsTrigger>
            <TabsTrigger value="processing" className="gap-1.5">
              <Loader2 className={`h-3.5 w-3.5 ${hasActive ? "animate-spin" : ""}`} />
              قيد المعالجة
              <span className="text-[10px] text-muted-foreground tabular-nums">
                ({counts.processing})
              </span>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              مكتمل
              <span className="text-[10px] text-muted-foreground tabular-nums">
                ({counts.completed})
              </span>
            </TabsTrigger>
            <TabsTrigger value="failed" className="gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              فشل
              <span className="text-[10px] text-muted-foreground tabular-nums">
                ({counts.failed})
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Select-all checkbox (visible when there are items) */}
        {videos.length > 0 && (
          <div className="ms-2 flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(v) => selectAll(!!v)}
            />
            <Label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">
              تحديد الكل
            </Label>
          </div>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState onAdd={() => queryClient.invalidateQueries({ queryKey: ["videos"] })} />
      ) : filteredVideos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
            <Search className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">لا توجد نتائج مطابقة لبحثك</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearchQuery("")}>
            مسح البحث
          </Button>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-380px)] overflow-y-auto ps-1 pe-3 -ms-1 -me-3 custom-scroll">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVideos.map((v, idx) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.4) }}
              >
                <VideoCard
                  video={v}
                  selected={selected.has(v.id)}
                  onSelect={(c) => toggleSelect(v.id, c)}
                  onAction={handleCardAction}
                  onShowDetails={setSelectedVideo}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Sticky bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/95 backdrop-blur-md shadow-lg px-3 py-2">
            <span className="text-sm font-medium ps-2">
              {selectedIds.length} محدد
            </span>
            <div className="h-5 w-px bg-border mx-1" />
            <Button
              size="sm"
              variant="default"
              className="gap-1.5 rounded-full"
              onClick={triggerBulkDownload}
            >
              <Download className="h-3.5 w-3.5" />
              تنزيل المحدد
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-full"
              disabled={bulkActionLoading}
              onClick={() => handleBulkAction("retry")}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${bulkActionLoading ? "animate-spin" : ""}`} />
              إعادة المحاولة
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5 rounded-full"
              disabled={bulkActionLoading}
              onClick={() => setConfirmBulkDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full px-2"
              onClick={() => setSelected(new Set())}
              aria-label="إلغاء التحديد"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk download format dialog */}
      <BulkDownloadDialog
        ids={selectedIds}
        open={bulkDownloadOpen}
        onOpenChange={setBulkDownloadOpen}
        onDone={() => setSelected(new Set())}
      />

      {/* Bulk delete confirm */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف {selectedIds.length} عنصر</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف جميع التفريغات المحددة نهائيًا مع ملفاتها الصوتية. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={bulkActionLoading}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={bulkActionLoading}
              onClick={(e) => {
                e.preventDefault();
                handleBulkAction("delete");
              }}
            >
              {bulkActionLoading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Background refetch indicator */}
      {isFetching && !isLoading && (
        <div className="fixed bottom-4 start-4 z-30 flex items-center gap-1.5 rounded-full bg-background/80 backdrop-blur-md border px-3 py-1.5 shadow-sm text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>جاري التحديث...</span>
        </div>
      )}

      {/* Video Details Sheet */}
      <VideoDetailsSheet
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onAction={(action, id) => {
          handleCardAction(action, id);
          setSelectedVideo(null);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Quick Stat Card (inline component)
// ─────────────────────────────────────────────────────────────
function QuickStatCard({
  icon,
  label,
  value,
  color,
  pulse = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "primary" | "amber" | "emerald" | "red";
  pulse?: boolean;
}) {
  const colors = {
    primary: "bg-primary/10 text-primary border-primary/20",
    amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    red: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  return (
    <div className={`relative flex items-center gap-3 rounded-xl border p-3 ${colors[color]} overflow-hidden`}>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[color].split(" ").slice(0, 2).join(" ")}`}>
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] text-muted-foreground leading-none mb-1">{label}</span>
        <span className="text-xl font-bold tabular-nums leading-none">{value}</span>
      </div>
      {pulse && (
        <span className="absolute top-2 end-2 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Video Details Sheet
// ─────────────────────────────────────────────────────────────
function VideoDetailsSheet({
  video,
  onClose,
  onAction,
}: {
  video: Video | null;
  onClose: () => void;
  onAction: (action: "retry" | "delete", id: string) => void;
}) {
  const open = !!video;
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showTranscript, setShowTranscript] = React.useState(false);

  if (!video) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="left" />
      </Sheet>
    );
  }

  const isProc = isProcessing(video.status);
  const canDownload = video.status === "completed" && !!video.transcriptText;
  const statusLabelValue = statusLabel(video.status);

  function formatDuration(secs: number | null): string {
    if (!secs) return "—";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return "—";
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Youtube className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight line-clamp-2">{video.title}</SheetTitle>
              <SheetDescription className="text-xs">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary inline-flex items-center gap-1"
                >
                  <Hash className="h-3 w-3" />
                  {video.youtubeId}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </SheetDescription>
            </div>
            <Badge variant="outline" className={statusBadgeClass(video.status)}>
              {statusLabelValue}
            </Badge>
          </div>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-4 mt-4">
          {/* Progress (if processing) */}
          {isProc && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                  قيد المعالجة
                </span>
                <span className="text-sm font-bold tabular-nums">{video.progress}%</span>
              </div>
              <Progress value={video.progress} className="h-2" />
              {video.statusText && (
                <p className="text-xs text-muted-foreground font-mono" dir="ltr">{video.statusText}</p>
              )}
            </div>
          )}

          {/* Error (if failed) */}
          {video.status === "failed" && video.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/10 p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                سبب الفشل
              </h3>
              <p className="text-sm font-mono text-red-700 dark:text-red-300 break-all" dir="ltr">
                {video.error}
              </p>
            </div>
          )}

          {/* Video info */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              معلومات الفيديو
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs flex items-center gap-1">
                  <Clock3 className="h-3 w-3" /> المدة
                </span>
                <p className="font-medium">{formatDuration(video.duration)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> أُضيف
                </span>
                <p className="font-medium">{timeAgo(video.createdAt)}</p>
              </div>
              {video.startedAt && (
                <div>
                  <span className="text-muted-foreground text-xs">بدأ التفريغ</span>
                  <p className="font-medium">{timeAgo(video.startedAt)}</p>
                </div>
              )}
              {video.completedAt && (
                <div>
                  <span className="text-muted-foreground text-xs">اكتمل</span>
                  <p className="font-medium">{timeAgo(video.completedAt)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Processing details */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              تفاصيل المعالجة
            </h3>
            <div className="space-y-2 text-sm">
              <DetailRow label="الـ Worker" value={video.workerId || "—"} mono />
              <DetailRow label="المحاولات" value={`${video.attempts} / ${video.maxAttempts}`} />
              <DetailRow label="مفتاح Deepgram" value={video.deepgramKey ? `#${video.deepgramKey}` : "—"} />
              {video.cookieUsed && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs flex items-center gap-1">
                    <Cookie className="h-3 w-3" /> الكوكيز المستخدم
                  </span>
                  <span className="font-mono text-xs truncate max-w-[200px]">{video.cookieUsed}</span>
                </div>
              )}
            </div>
          </div>

          {/* Transcript preview */}
          {canDownload && video.transcriptText && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  معاينة النص المُفرّغ
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowTranscript(!showTranscript)}
                >
                  {showTranscript ? "إخفاء" : "عرض"}
                </Button>
              </div>
              {showTranscript && (
                <ScrollArea className="h-[200px] w-full rounded-md border p-3 bg-muted/30">
                  <p className="text-xs font-mono whitespace-pre-wrap leading-relaxed" dir="auto">
                    {video.transcriptText.slice(0, 2000)}
                    {video.transcriptText.length > 2000 && (
                      <span className="text-muted-foreground">... ({video.transcriptText.length.toLocaleString("ar-EG")} حرف إجمالاً)</span>
                    )}
                  </p>
                </ScrollArea>
              )}
              {!showTranscript && (
                <p className="text-xs text-muted-foreground">
                  {video.transcriptText.length.toLocaleString("ar-EG")} حرف • انقر على "عرض" لمعاينة النص
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {canDownload && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => {
                  window.location.href = `/api/download/transcript?id=${encodeURIComponent(video.id)}&format=txt`;
                }}
              >
                <Download className="h-3.5 w-3.5" />
                تنزيل TXT
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              disabled={isProc || video.status === "pending"}
              onClick={() => onAction("retry", video.id)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              إعادة المحاولة
            </Button>
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                  <AlertDialogDescription>
                    هل أنت متأكد من حذف هذا التفريغ؟ سيتم حذف النص والملف الصوتي نهائيًا.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => onAction("delete", video.id)}
                  >
                    حذف نهائي
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}
