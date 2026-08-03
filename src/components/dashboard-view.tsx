"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip as RechartsTooltip, CartesianGrid, Legend, LineChart, Line,
} from "recharts";
import {
  AudioLines, FileText, CheckCircle2, XCircle, Clock, Loader2, Youtube,
  TrendingUp, Activity, AlertTriangle, Brain, Cookie, Server, Zap,
  ArrowLeft, Calendar, Cpu, HardDrive, ScrollText, BarChart3, PieChart as PieIcon,
  Power, Loader2 as Spinner,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

type WorkerDetail = {
  workerId: string;
  type: string;
  status: string;
  enabled: boolean;
  currentJobId: string | null;
  currentVideoId: string | null;
  lastHeartbeat: string | null;
  lastError: string | null;
};

interface Stats {
  videos: { total: number; pending: number; processing: number; completed: number; failed: number; successRate: number; avgProgress: number };
  playlists: number;
  formatJobs: { total: number; pending: number; processing: number; completed: number; failed: number };
  skills: { total: number; active: number };
  cookies: { total: number; active: number };
  logs: { total: number; errors: number };
  workers: {
    transcription: { total: number; enabled: number; active: number };
    format: { total: number; enabled: number; active: number };
    details?: Array<{
      workerId: string;
      type: string;
      status: string;
      enabled: boolean;
      currentJobId: string | null;
      currentVideoId: string | null;
      lastHeartbeat: string | null;
      lastError: string | null;
    }>;
  };
  recentVideos: Array<{ id: string; title: string; status: string; progress: number; statusText: string | null; youtubeId: string; createdAt: string }>;
  recentLogs: Array<{ id: string; level: string; source: string; message: string; createdAt: string }>;
  recentFormatJobs?: Array<{ id: string; skillName: string; status: string; modelProvider: string; modelName: string; createdAt: string }>;
  trend?: Array<{ date: string; label: string; videosCreated: number; videosCompleted: number; formatJobs: number }>;
  activity?: Array<{ id: string; type: "video" | "format" | "log"; title: string; subtitle: string; status?: string; level?: string; timestamp: string }>;
}

async function fetchStats(): Promise<Stats> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

const statusColors: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  downloading: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  uploading: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  transcribing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const statusLabels: Record<string, string> = {
  pending: "قيد الانتظار",
  downloading: "تنزيل الصوت",
  uploading: "رفع إلى Deepgram",
  transcribing: "جارٍ التفريغ",
  processing: "قيد المعالجة",
  completed: "مكتمل",
  failed: "فشل",
};

const levelColors: Record<string, string> = {
  info: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  warn: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  debug: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
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

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export function DashboardView() {
  const queryClient = useQueryClient();
  const [selectedWorker, setSelectedWorker] = React.useState<WorkerDetail | null>(null);
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: fetchStats,
    refetchInterval: 10000,
  });

  // Toggle worker enabled/disabled
  const toggleWorker = async (workerId: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/workers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, enabled }),
      });
      if (!res.ok) throw new Error("Failed to toggle worker");
      toast.success(enabled ? "تم تفعيل الـ worker" : "تم تعطيل الـ worker", {
        description: workerId,
      });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    } catch (err) {
      toast.error("فشل تحديث حالة الـ worker", { description: String(err) });
    }
  };

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const successRateColor =
    stats.videos.successRate >= 80 ? "text-emerald-600" :
    stats.videos.successRate >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
            <p className="text-sm text-muted-foreground">نظرة عامة شاملة على نشاط المنصة</p>
          </div>
        </div>
      </motion.div>

      {/* Main Stats Cards */}
      <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Videos Stat */}
        <Card className="relative overflow-hidden border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الفيديوهات</CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Youtube className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{stats.videos.total}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {stats.videos.completed} مكتمل
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                {stats.videos.processing} نشط
              </span>
            </div>
            <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-primary/5 blur-xl" />
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">معدل النجاح</CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold tabular-nums ${successRateColor}`}>{stats.videos.successRate}%</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              {stats.videos.failed > 0 ? (
                <span className="flex items-center gap-1 text-red-500">
                  <XCircle className="h-3 w-3" />
                  {stats.videos.failed} فشل
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" />
                  لا فشل
                </span>
              )}
            </div>
            <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-emerald-500/5 blur-xl" />
          </CardContent>
        </Card>

        {/* Format Jobs */}
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">مهام التنسيق</CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{stats.formatJobs.total}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {stats.formatJobs.completed} مكتمل
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-amber-500" />
                {stats.formatJobs.pending} انتظار
              </span>
            </div>
            <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-violet-500/5 blur-xl" />
          </CardContent>
        </Card>

        {/* Workers */}
        <Card className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">العمال النشطون</CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Server className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {stats.workers.transcription.active + stats.workers.format.active}
              <span className="text-base text-muted-foreground font-normal"> / {stats.workers.transcription.enabled + stats.workers.format.enabled}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <AudioLines className="h-3 w-3 text-primary" />
                {stats.workers.transcription.active}/{stats.workers.transcription.enabled} تفريغ
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3 text-violet-500" />
                {stats.workers.format.active}/{stats.workers.format.enabled} تنسيق
              </span>
            </div>
            <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-blue-500/5 blur-xl" />
          </CardContent>
        </Card>
      </motion.div>

      {/* Active Progress Bar (if processing) */}
      {stats.videos.processing > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-amber-500/30 bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-950/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div>
                    <CardTitle className="text-base">تفريغ نشط الآن</CardTitle>
                    <CardDescription>{stats.videos.processing} فيديو قيد المعالجة</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-amber-700 border-amber-500/30">
                  متوسط التقدم: {stats.videos.avgProgress}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={stats.videos.avgProgress} className="h-2.5" />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Charts row */}
      <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-2">
        {/* Video status donut chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PieIcon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">توزيع حالات الفيديوهات</CardTitle>
                  <CardDescription>النسبة حسب الحالة</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "مكتمل", value: stats.videos.completed, color: "#10b981" },
                      { name: "قيد المعالجة", value: stats.videos.processing, color: "#f59e0b" },
                      { name: "قيد الانتظار", value: stats.videos.pending, color: "#64748b" },
                      { name: "فشل", value: stats.videos.failed, color: "#ef4444" },
                    ].filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {[
                      { name: "مكتمل", value: stats.videos.completed, color: "#10b981" },
                      { name: "قيد المعالجة", value: stats.videos.processing, color: "#f59e0b" },
                      { name: "قيد الانتظار", value: stats.videos.pending, color: "#64748b" },
                      { name: "فشل", value: stats.videos.failed, color: "#ef4444" },
                    ].filter((d) => d.value > 0).map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      fontSize: "12px",
                      direction: "rtl",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
              <ChartLegend color="#10b981" label="مكتمل" value={stats.videos.completed} />
              <ChartLegend color="#f59e0b" label="معالجة" value={stats.videos.processing} />
              <ChartLegend color="#64748b" label="انتظار" value={stats.videos.pending} />
              <ChartLegend color="#ef4444" label="فشل" value={stats.videos.failed} />
            </div>
          </CardContent>
        </Card>

        {/* Format jobs bar chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">مهام التنسيق حسب الحالة</CardTitle>
                <CardDescription>عدد المهام في كل حالة</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "انتظار", value: stats.formatJobs.pending, fill: "#f59e0b" },
                    { name: "معالجة", value: stats.formatJobs.processing, fill: "#8b5cf6" },
                    { name: "مكتمل", value: stats.formatJobs.completed, fill: "#10b981" },
                    { name: "فشل", value: stats.formatJobs.failed, fill: "#ef4444" },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      fontSize: "12px",
                    }}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 7-day Trend Chart */}
      {stats.trend && stats.trend.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">الاتجاه خلال 7 أيام</CardTitle>
                    <CardDescription>الفيديوهات المنشأة والمكتملة ومهام التنسيق</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                    <span className="text-muted-foreground">منشأ</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">مكتمل</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                    <span className="text-muted-foreground">تنسيق</span>
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.trend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        fontSize: "12px",
                        direction: "rtl",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="videosCreated"
                      name="فيديوهات منشأة"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "hsl(var(--primary))" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="videosCompleted"
                      name="فيديوهات مكتملة"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#10b981" }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="formatJobs"
                      name="مهام تنسيق"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#8b5cf6" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Activity Timeline */}
      {stats.activity && stats.activity.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">النشاط الأخير</CardTitle>
                  <CardDescription>آخر العمليات عبر الفيديوهات والتنسيق والسجلات</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="max-h-[320px] overflow-y-auto">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute right-[15px] top-2 bottom-2 w-px bg-border" />
                {stats.activity.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="relative flex items-start gap-3 pb-4 last:pb-0"
                  >
                    {/* Timeline dot */}
                    <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full shrink-0 mt-0.5 ${
                      item.type === "video" ? "bg-primary/15 text-primary" :
                      item.type === "format" ? "bg-violet-500/15 text-violet-600" :
                      "bg-slate-500/15 text-slate-600"
                    }`}>
                      {item.type === "video" ? <Youtube className="h-3.5 w-3.5" /> :
                       item.type === "format" ? <FileText className="h-3.5 w-3.5" /> :
                       <ScrollText className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate" dir={item.type === "log" ? "ltr" : "rtl"}>
                          {item.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {timeAgo(item.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{item.subtitle}</span>
                        {item.status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[item.status] || statusColors.pending}`}>
                            {statusLabels[item.status] || item.status}
                          </span>
                        )}
                        {item.level && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${levelColors[item.level] || levelColors.info}`}>
                            {item.level.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Two columns: Recent Videos + System Status */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Videos */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Youtube className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">أحدث الفيديوهات</CardTitle>
                    <CardDescription>آخر 5 فيديوهات أُضيفت</CardDescription>
                  </div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/transcription">
                    عرض الكل
                    <ArrowLeft className="h-3.5 w-3.5 me-1" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[360px] overflow-y-auto">
              {stats.recentVideos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Youtube className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  لا توجد فيديوهات بعد
                </div>
              ) : (
                stats.recentVideos.map((video, idx) => (
                  <motion.div
                    key={video.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <Youtube className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href="/transcription" className="text-sm font-medium hover:text-primary transition-colors line-clamp-1">
                        {video.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono">{video.youtubeId}</span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(video.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[video.status] || statusColors.pending}`}>
                        {statusLabels[video.status] || video.status}
                      </span>
                      {video.status === "completed" || video.status === "failed" ? null : (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{video.progress}%</span>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* System Status */}
        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">حالة النظام</CardTitle>
                  <CardDescription>الموارد والإعدادات</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <SystemRow icon={Brain} label="المهارات النشطة" value={`${stats.skills.active} / ${stats.skills.total}`} color="violet" />
              <SystemRow icon={Cookie} label="ملفات الكوكيز" value={`${stats.cookies.active} / ${stats.cookies.total}`} color="amber" />
              <SystemRow icon={ScrollText} label="إجمالي السجلات" value={stats.logs.total.toLocaleString("ar-EG")} color="slate" />
              <SystemRow icon={AlertTriangle} label="أخطاء مسجلة" value={stats.logs.errors.toString()} color={stats.logs.errors > 0 ? "red" : "emerald"} />
              <SystemRow icon={HardDrive} label="قوائم التشغيل" value={stats.playlists.toString()} color="blue" />
              <SystemRow icon={Zap} label="مهام معلقة" value={`${stats.videos.pending + stats.formatJobs.pending}`} color="amber" />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* System Metrics */}
      <SystemMetrics />

      {/* Worker Heartbeats */}
      {stats.workers.details && stats.workers.details.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">نبضات الـ Workers</CardTitle>
                    <CardDescription>الحالة الحية للعمال</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-muted-foreground">نشط</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    <span className="text-muted-foreground">خامل</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-zinc-400" />
                    <span className="text-muted-foreground">معطّل</span>
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {stats.workers.details.map((w, idx) => (
                  <WorkerHeartbeat
                    key={w.workerId}
                    worker={w}
                    index={idx}
                    onToggle={toggleWorker}
                    onShowDetails={(worker) => setSelectedWorker(worker)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent Logs */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-500/10 text-slate-600">
                  <ScrollText className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">آخر السجلات</CardTitle>
                  <CardDescription>أحدث 8 عمليات موثقة</CardDescription>
                </div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/logs">
                  عرض الكل
                  <ArrowLeft className="h-3.5 w-3.5 me-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[280px] overflow-y-auto">
            {stats.recentLogs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                لا توجد سجلات بعد
              </div>
            ) : (
              stats.recentLogs.map((log, idx) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/40 transition-colors text-sm font-mono"
                  dir="ltr"
                >
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-sans font-medium shrink-0 ${levelColors[log.level] || levelColors.info}`}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 w-20">{log.source}</span>
                  <span className="flex-1 truncate text-xs">{log.message}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(log.createdAt)}</span>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Worker Details Sheet */}
      <WorkerDetailsSheet
        worker={selectedWorker}
        onClose={() => setSelectedWorker(null)}
        onToggle={toggleWorker}
      />
    </motion.div>
  );
}

function SystemRow({
  icon: Icon, label, value, color,
}: {
  icon: any; label: string; value: string; color: "violet" | "amber" | "slate" | "red" | "emerald" | "blue";
}) {
  const colors = {
    violet: "bg-violet-500/10 text-violet-600",
    amber: "bg-amber-500/10 text-amber-600",
    slate: "bg-slate-500/10 text-slate-600",
    red: "bg-red-500/10 text-red-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
    blue: "bg-blue-500/10 text-blue-600",
  };
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ChartLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function WorkerHeartbeat({
  worker,
  index,
  onToggle,
  onShowDetails,
}: {
  worker: {
    workerId: string;
    type: string;
    status: string;
    enabled: boolean;
    currentJobId: string | null;
    lastHeartbeat: string | null;
    lastError: string | null;
  };
  index: number;
  onToggle: (workerId: string, enabled: boolean) => Promise<void>;
  onShowDetails: (worker: WorkerDetail) => void;
}) {
  const [toggling, setToggling] = React.useState(false);
  const isActive = worker.status === "active" && worker.enabled;
  const isDisabled = !worker.enabled;
  const isError = worker.status === "error";

  const dotColor = isActive
    ? "bg-emerald-500"
    : isError
    ? "bg-red-500"
    : isDisabled
    ? "bg-zinc-400"
    : "bg-slate-400";

  const cardColor = isActive
    ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10"
    : isError
    ? "border-red-500/30 bg-red-50/50 dark:bg-red-950/10"
    : isDisabled
    ? "border-zinc-300/50 bg-zinc-50/30 dark:bg-zinc-900/10 opacity-60"
    : "border-slate-200 dark:border-slate-800";

  const statusLabel = isActive ? "نشط" : isError ? "خطأ" : isDisabled ? "معطّل" : "خامل";

  const heartbeatAgo = worker.lastHeartbeat ? timeAgo(worker.lastHeartbeat) : "—";
  const shortId = worker.workerId.replace("transcribe-", "T").replace("opencode-", "O");

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(worker.workerId, !worker.enabled);
    } finally {
      setToggling(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      onClick={() => onShowDetails(worker as WorkerDetail)}
      className={`group relative flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center ${cardColor} transition-all cursor-pointer hover:shadow-md hover:scale-[1.03]`}
    >
      {/* Toggle button (top-left corner) */}
      <button
        onClick={(e) => { e.stopPropagation(); handleToggle(); }}
        disabled={toggling}
        className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/80 disabled:opacity-50 z-10"
        title={worker.enabled ? "تعطيل" : "تفعيل"}
        aria-label={worker.enabled ? "تعطيل الـ worker" : "تفعيل الـ worker"}
      >
        {toggling ? (
          <Spinner className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <Power className={`h-3 w-3 ${worker.enabled ? "text-emerald-600" : "text-zinc-500"}`} />
        )}
      </button>

      {/* Status dot with pulse */}
      <div className="relative flex h-3 w-3 items-center justify-center">
        <span className={`absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75 ${isActive ? "animate-ping" : ""}`} />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`} />
      </div>

      {/* Worker ID badge */}
      <span className="text-xs font-bold tabular-nums">{shortId}</span>

      {/* Status label */}
      <span className="text-[10px] text-muted-foreground">{statusLabel}</span>

      {/* Heartbeat time */}
      <span className="text-[9px] text-muted-foreground/70" title={worker.lastHeartbeat || "No heartbeat"}>
        {heartbeatAgo}
      </span>

      {/* Type indicator */}
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
        worker.type === "transcribe"
          ? "bg-primary/10 text-primary"
          : "bg-violet-500/10 text-violet-600"
      }`}>
        {worker.type === "transcribe" ? "تفريغ" : "تنسيق"}
      </span>
    </motion.div>
  );
}

function WorkerDetailsSheet({
  worker,
  onClose,
  onToggle,
}: {
  worker: WorkerDetail | null;
  onClose: () => void;
  onToggle: (workerId: string, enabled: boolean) => Promise<void>;
}) {
  const [toggling, setToggling] = React.useState(false);
  const open = !!worker;

  // Fetch worker history when opened
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["worker-history", worker?.workerId],
    queryFn: async () => {
      if (!worker) return null;
      const res = await fetch(`/api/workers/${worker.workerId}/history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!worker,
    staleTime: 5000,
  });

  const isActive = worker?.status === "active" && worker?.enabled;
  const isDisabled = !worker?.enabled;
  const isError = worker?.status === "error";

  const statusLabel = isActive ? "نشط" : isError ? "خطأ" : isDisabled ? "معطّل" : "خامل";
  const statusColor = isActive
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
    : isError
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
    : isDisabled
    ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  async function handleToggle() {
    if (!worker) return;
    setToggling(true);
    try {
      await onToggle(worker.workerId, !worker.enabled);
    } finally {
      setToggling(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
        {worker && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  worker.type === "transcribe"
                    ? "bg-primary/10 text-primary"
                    : "bg-violet-500/10 text-violet-600"
                }`}>
                  {worker.type === "transcribe" ? <AudioLines className="h-6 w-6" /> : <Cpu className="h-6 w-6" />}
                </div>
                <div>
                  <SheetTitle className="text-lg">{worker.workerId}</SheetTitle>
                  <SheetDescription>
                    {worker.type === "transcribe" ? "عامل تفريغ" : "عامل تنسيق"}
                  </SheetDescription>
                </div>
                <span className={`ms-auto text-xs px-2 py-1 rounded-full font-medium ${statusColor}`}>
                  {statusLabel}
                </span>
              </div>
            </SheetHeader>

            <div className="px-4 pb-6 space-y-4 mt-4">
              {/* Status section */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  الحالة الحالية
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">الحالة</span>
                    <p className="font-medium">{statusLabel}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">مُفعّل</span>
                    <p className="font-medium">{worker.enabled ? "نعم" : "لا"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">النوع</span>
                    <p className="font-medium">{worker.type === "transcribe" ? "تفريغ" : "تنسيق"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">آخر نبضة</span>
                    <p className="font-medium">{worker.lastHeartbeat ? timeAgo(worker.lastHeartbeat) : "—"}</p>
                  </div>
                </div>
              </div>

              {/* Current job */}
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  المهمة الحالية
                </h3>
                {worker.currentJobId ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-mono text-xs">{worker.currentJobId}</p>
                    {worker.currentVideoId && (
                      <p className="text-muted-foreground text-xs">فيديو: {worker.currentVideoId}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">لا توجد مهمة حالية</p>
                )}
              </div>

              {/* Last error */}
              {worker.lastError && (
                <div className="rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-950/10 p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    آخر خطأ
                  </h3>
                  <p className="text-sm font-mono text-red-700 dark:text-red-300 break-all" dir="ltr">
                    {worker.lastError}
                  </p>
                </div>
              )}

              {/* Technical details */}
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  التفاصيل التقنية
                </h3>
                <div className="space-y-1 text-xs font-mono text-muted-foreground" dir="ltr">
                  <div className="flex justify-between"><span>workerId:</span><span>{worker.workerId}</span></div>
                  <div className="flex justify-between"><span>type:</span><span>{worker.type}</span></div>
                  <div className="flex justify-between"><span>status:</span><span>{worker.status}</span></div>
                  <div className="flex justify-between"><span>enabled:</span><span>{String(worker.enabled)}</span></div>
                  <div className="flex justify-between"><span>lastHeartbeat:</span><span>{worker.lastHeartbeat || "null"}</span></div>
                </div>
              </div>

              {/* Activity History */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    سجل النشاط
                  </h3>
                  {historyData?.stats && (
                    <span className="text-[10px] text-muted-foreground">
                      {historyData.stats.totalVideos + historyData.stats.totalFormatJobs} مهمة
                    </span>
                  )}
                </div>
                {historyLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8" />)}
                  </div>
                ) : historyData?.history?.length > 0 ? (
                  <div className="relative max-h-[200px] overflow-y-auto">
                    <div className="absolute right-[11px] top-2 bottom-2 w-px bg-border" />
                    {historyData.history.slice(0, 10).map((item: any, idx: number) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="relative flex items-start gap-2 pb-2 last:pb-0"
                      >
                        <div className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full shrink-0 mt-0.5 ${
                          item.type === "video" ? "bg-primary/15 text-primary" :
                          item.type === "format" ? "bg-violet-500/15 text-violet-600" :
                          "bg-slate-500/15 text-slate-600"
                        }`}>
                          {item.type === "video" ? <Youtube className="h-3 w-3" /> :
                           item.type === "format" ? <FileText className="h-3 w-3" /> :
                           <ScrollText className="h-3 w-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" dir={item.type === "log" ? "ltr" : "rtl"}>
                            {item.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate" dir="ltr">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {timeAgo(item.timestamp)}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    لا يوجد نشاط سابق
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  onClick={handleToggle}
                  disabled={toggling}
                  className="flex-1 gap-2"
                  variant={worker.enabled ? "destructive" : "default"}
                >
                  {toggling ? <Spinner className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  {worker.enabled ? "تعطيل الـ worker" : "تفعيل الـ worker"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                ملاحظة: تعطيل الـ worker لا يوقف الحاوية، فقط يمنع استلام مهام جديدة
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// System Metrics Component
// ─────────────────────────────────────────────────────────────
interface SystemMetricsData {
  database: {
    tables: Record<string, number>;
    completedVideos: number;
    failedVideos: number;
    completedJobs: number;
    failedJobs: number;
    estimatedSizeBytes: number;
    estimatedSizeMB: number;
  };
  system: {
    platform: string;
    nodeVersion: string;
    processUptime: string;
    systemUptime: string;
    cpuCount: number;
    loadAvg: number[];
    memory: {
      total: number;
      free: number;
      used: number;
      usedPercent: number;
      totalGB: number;
      usedGB: number;
    };
    process: {
      rssMB: number;
      heapUsedMB: number;
    };
  };
}

function SystemMetrics() {
  const { data, isLoading } = useQuery<SystemMetricsData>({
    queryKey: ["system-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/system");
      if (!res.ok) throw new Error("Failed to fetch system metrics");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading || !data) {
    return (
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-500/10 text-zinc-600">
                <Server className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">مقاييس النظام</CardTitle>
                <CardDescription>جاري التحميل...</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40" />
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const memPercent = data.system.memory.usedPercent;

  return (
    <motion.div variants={itemVariants}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-500/10 text-zinc-600">
                <Server className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">مقاييس النظام</CardTitle>
                <CardDescription>استخدام الموارد وقاعدة البيانات</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {data.system.nodeVersion}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Memory Usage */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                الذاكرة
              </h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">مستخدم</span>
                  <span className="font-semibold tabular-nums">{data.system.memory.usedGB} / {data.system.memory.totalGB} GB</span>
                </div>
                <Progress
                  value={memPercent}
                  className={`h-2 ${memPercent > 85 ? "[&>div]:bg-red-500" : memPercent > 70 ? "[&>div]:bg-amber-500" : ""}`}
                />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{memPercent}% مستخدم</span>
                  <span>{(data.system.memory.totalGB - data.system.memory.usedGB).toFixed(2)} GB متاح</span>
                </div>
              </div>
            </div>

            {/* CPU & Load */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                المعالج
              </h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">الأنوية</span>
                  <span className="font-semibold tabular-nums">{data.system.cpuCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">الحمل (1د)</span>
                  <span className="font-semibold tabular-nums">{data.system.loadAvg[0]}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">الحمل (5د)</span>
                  <span className="font-semibold tabular-nums">{data.system.loadAvg[1]}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">الحمل (15د)</span>
                  <span className="font-semibold tabular-nums">{data.system.loadAvg[2]}</span>
                </div>
              </div>
            </div>

            {/* Process & Uptime */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                العملية
              </h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">RSS</span>
                  <span className="font-semibold tabular-nums">{data.system.process.rssMB} MB</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Heap</span>
                  <span className="font-semibold tabular-nums">{data.system.process.heapUsedMB} MB</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">مدة التشغيل</span>
                  <span className="font-semibold">{data.system.processUptime}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">النظام</span>
                  <span className="font-semibold">{data.system.systemUptime}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Database size + tables */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                قاعدة البيانات
              </h4>
              <Badge variant="secondary" className="text-[10px]">
                ~{data.database.estimatedSizeMB} MB
              </Badge>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
              {Object.entries(data.database.tables).map(([table, count]) => (
                <div key={table} className="text-center p-2 rounded-md bg-muted/40">
                  <div className="text-[10px] text-muted-foreground mb-0.5">
                    {tableLabels[table] || table}
                  </div>
                  <div className="text-sm font-bold tabular-nums">{count}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const tableLabels: Record<string, string> = {
  videos: "فيديوهات",
  playlists: "قوائم",
  formatJobs: "تنسيق",
  skills: "مهارات",
  cookies: "كوكيز",
  logs: "سجلات",
  workers: "عمال",
  providers: "مزودات",
  settings: "إعدادات",
};
