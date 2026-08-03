"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  KeyRound,
  Cookie as CookieIcon,
  Brain,
  Cpu,
  HardDrive,
  Upload,
  Trash2,
  Plus,
  RefreshCw,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Power,
  Activity,
  Server,
  Loader2,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Github,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DEEPGRAM_MODELS, DEEPGRAM_LANGUAGES } from "@/lib/deepgram";

// ===== Types =====

export interface CookieItem {
  id: string;
  filename: string;
  order: number;
  isActive: boolean;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface SkillItem {
  id: string;
  name: string;
  gitRepo: string;
  branch: string;
  description: string | null;
  defaultModelProvider: string | null;
  defaultModelName: string | null;
  clonedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProviderItem {
  id: string;
  provider: string;
  apiKeyMasked: string;
  apiKeyLength: number;
  isActive: boolean;
  updatedAt: string;
}

export interface WorkerItem {
  workerId: string;
  type: "transcribe" | "format";
  status: string;
  enabled: boolean;
  currentJobId: string | null;
  currentVideoId: string | null;
  lastHeartbeat: string | null;
  lastError: string | null;
  isStale: boolean;
}

export interface SettingsViewProps {
  initialSettings: Record<string, string>;
  initialCookies: CookieItem[];
  initialSkills: SkillItem[];
  initialProviders: ProviderItem[];
  initialWorkers: WorkerItem[];
  opencodeAuthJsonEnvSet: boolean;
  opencodeAuthJsonFromDb: string;
  opencodeAuthJsonSet: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

const PROVIDER_GET_KEY_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/keys",
  openai: "https://platform.openai.com/api-keys",
  deepseek: "https://platform.deepseek.com/api_keys",
};

const MODEL_PROVIDERS = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "codex", label: "Codex (ChatGPT Plus)" },
];

// Relative time in Arabic
function relTimeAr(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return "الآن";
  if (sec < 60) return `منذ ${sec} ثانية`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  return `منذ ${day} يوم`;
}

// ===== Main component =====

export function SettingsView(props: SettingsViewProps) {
  return (
    <Tabs defaultValue="deepgram" className="w-full">
      <TabsList className="bg-muted/60 h-auto flex-wrap gap-1 p-1 overflow-x-auto">
        <TabsTrigger value="deepgram" className="gap-1.5">
          <HardDrive className="size-4" />
          <span>Deepgram</span>
        </TabsTrigger>
        <TabsTrigger value="audio" className="gap-1.5">
          <Activity className="size-4" />
          <span>جودة الصوت</span>
        </TabsTrigger>
        <TabsTrigger value="cookies" className="gap-1.5">
          <CookieIcon className="size-4" />
          <span>الكوكيز</span>
        </TabsTrigger>
        <TabsTrigger value="skills" className="gap-1.5">
          <Brain className="size-4" />
          <span>المهارات</span>
        </TabsTrigger>
        <TabsTrigger value="providers" className="gap-1.5">
          <KeyRound className="size-4" />
          <span>مفاتيح الذكاء</span>
        </TabsTrigger>
        <TabsTrigger value="workers" className="gap-1.5">
          <Cpu className="size-4" />
          <span>الـ Workers</span>
        </TabsTrigger>
        <TabsTrigger value="codex" className="gap-1.5">
          <Server className="size-4" />
          <span>Codex Plus</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="deepgram" className="mt-4">
        <SectionDeepgram initialSettings={props.initialSettings} />
      </TabsContent>
      <TabsContent value="audio" className="mt-4">
        <SectionAudio initialSettings={props.initialSettings} />
      </TabsContent>
      <TabsContent value="cookies" className="mt-4">
        <SectionCookies initialCookies={props.initialCookies} />
      </TabsContent>
      <TabsContent value="skills" className="mt-4">
        <SectionSkills initialSkills={props.initialSkills} />
      </TabsContent>
      <TabsContent value="providers" className="mt-4">
        <SectionProviders initialProviders={props.initialProviders} />
      </TabsContent>
      <TabsContent value="workers" className="mt-4">
        <SectionWorkers initialWorkers={props.initialWorkers} />
      </TabsContent>
      <TabsContent value="codex" className="mt-4">
        <SectionCodexPlus
          opencodeAuthJsonEnvSet={props.opencodeAuthJsonEnvSet}
          opencodeAuthJsonFromDb={props.opencodeAuthJsonFromDb}
          opencodeAuthJsonSet={props.opencodeAuthJsonSet}
        />
      </TabsContent>
    </Tabs>
  );
}

// ===== Section 1 — Deepgram =====

function SectionDeepgram({ initialSettings }: { initialSettings: Record<string, string> }) {
  const [model, setModel] = React.useState(initialSettings.deepgram_model || "whisper-large");
  const [language, setLanguage] = React.useState(initialSettings.deepgram_language || "ar");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deepgram_model: model, deepgram_language: language }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("تم حفظ إعدادات Deepgram");
    } catch {
      toast.error("تعذّر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-5 text-primary" />
          إعدادات Deepgram
        </CardTitle>
        <CardDescription>هذه الإعدادات تنطبق على التفريغات الجديدة فقط</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dg-model">النموذج</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger id="dg-model" className="w-full">
              <SelectValue placeholder="اختر النموذج" />
            </SelectTrigger>
            <SelectContent>
              {DEEPGRAM_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dg-lang">اللغة</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="dg-lang" className="w-full">
              <SelectValue placeholder="اختر اللغة" />
            </SelectTrigger>
            <SelectContent>
              {DEEPGRAM_LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          حفظ الإعدادات
        </Button>
      </CardFooter>
    </Card>
  );
}

// ===== Section 2 — Audio Quality =====

function SectionAudio({ initialSettings }: { initialSettings: Record<string, string> }) {
  const [channels, setChannels] = React.useState(initialSettings.audio_channels || "mono");
  const [bitrate, setBitrate] = React.useState(initialSettings.audio_bitrate || "64");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_channels: channels, audio_bitrate: bitrate }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("تم حفظ إعدادات جودة الصوت");
    } catch {
      toast.error("تعذّر حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          جودة المقطع الصوتي
        </CardTitle>
        <CardDescription>تحكّم في قنوات الصوت ومعدّل البت للملف الصوتي المُستخرج من الفيديو</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>القنوات</Label>
          <RadioGroup
            value={channels}
            onValueChange={setChannels}
            className="grid grid-cols-2 gap-3 max-w-sm"
          >
            <Label
              htmlFor="ch-mono"
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors"
            >
              <RadioGroupItem id="ch-mono" value="mono" />
              <div>
                <p className="text-sm font-medium">مونو (mono)</p>
                <p className="text-xs text-muted-foreground">قناة واحدة — مناسب للكلام</p>
              </div>
            </Label>
            <Label
              htmlFor="ch-stereo"
              className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors"
            >
              <RadioGroupItem id="ch-stereo" value="stereo" />
              <div>
                <p className="text-sm font-medium">ستيريو (stereo)</p>
                <p className="text-xs text-muted-foreground">قناتان — جودة أعلى وحجم أكبر</p>
              </div>
            </Label>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="audio-bitrate">معدّل البت (kbps)</Label>
          <Select value={bitrate} onValueChange={setBitrate}>
            <SelectTrigger id="audio-bitrate" className="w-full max-w-xs">
              <SelectValue placeholder="اختر المعدّل" />
            </SelectTrigger>
            <SelectContent>
              {["64", "96", "128", "192", "256"].map((b) => (
                <SelectItem key={b} value={b}>
                  {b} kbps
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            64 kbps يقلّل حجم الملف ويُسرّع التفريغ؛ 256 kbps جودة عالية وحجم أكبر.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          حفظ الإعدادات
        </Button>
      </CardFooter>
    </Card>
  );
}

// ===== Section 3 — Cookies =====

function SectionCookies({ initialCookies }: { initialCookies: CookieItem[] }) {
  const [cookies, setCookies] = React.useState<CookieItem[]>(initialCookies);
  const [uploading, setUploading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/cookies", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Upload failed");
        }
      }
      toast.success(`تم رفع ${files.length} ملف كوكيز`);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "تعذّر رفع الملف");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function refresh() {
    try {
      const res = await fetch("/api/cookies");
      if (!res.ok) return;
      const j = await res.json();
      setCookies(j.cookies);
    } catch {
      /* ignore */
    }
  }

  async function handleToggle(id: string, current: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/cookies?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      toast.error("تعذّر تحديث الكوكيز");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    const idx = cookies.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= cookies.length) return;
    const current = cookies[idx];
    const target = cookies[targetIdx];
    setBusyId(id);
    try {
      // Swap orders
      await Promise.all([
        fetch(`/api/cookies?id=${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: target.order }),
        }),
        fetch(`/api/cookies?id=${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: current.order }),
        }),
      ]);
      await refresh();
    } catch {
      toast.error("تعذّر إعادة الترتيب");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, filename: string) {
    if (!confirm(`حذف ملف الكوكيز "${filename}"؟`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/cookies?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("تم حذف الملف");
      await refresh();
    } catch {
      toast.error("تعذّر الحذف");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Alert className="border-primary/30 bg-primary/5">
        <AlertTriangle className="size-4 text-primary" />
        <AlertTitle>كيف أحصل على ملف الكوكيز؟</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal ps-5 space-y-1 mt-2">
            <li>
              ثبّت إضافة المتصفح{" "}
              <span className="font-mono text-xs">"Get cookies.txt LOCALLY"</span> (Chrome) أو{" "}
              <span className="font-mono text-xs">"cookies.txt"</span> (Firefox).
            </li>
            <li>سجّل الدخول إلى youtube.com في المتصفح الذي ثبّتت فيه الإضافة.</li>
            <li>اضغط على الإضافة واختر Export — سيُحفظ ملف cookies.txt.</li>
            <li>
              ارفع الملف هنا. يمكنك رفع عدّة ملفات؛ سيتم تجربتها بالترتيب عند فشل أحدها.
            </li>
          </ol>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CookieIcon className="size-5 text-primary" />
            رفع ملف كوكيز
          </CardTitle>
          <CardDescription>
            يُنصح برفع 2-3 ملفات كوكيز من حسابات مختلفة لضمان استمرار التنزيل
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full h-24 border-dashed flex-col gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                <span>جارٍ الرفع…</span>
              </>
            ) : (
              <>
                <Upload className="size-5" />
                <span>اختر ملفات الكوكيز (.txt) — يمكنك اختيار عدّة ملفات</span>
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ملفات الكوكيز المرفوعة</CardTitle>
          <CardDescription>{cookies.length} ملف</CardDescription>
        </CardHeader>
        <CardContent>
          {cookies.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <CookieIcon className="size-8 mx-auto mb-2 opacity-50" />
              لا توجد ملفات كوكيز بعد. ارفع ملفاً للبدء.
            </div>
          ) : (
            <div className="space-y-2">
              {cookies.map((c, idx) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      disabled={idx === 0 || busyId === c.id}
                      onClick={() => handleReorder(c.id, "up")}
                      aria-label="تحريك لأعلى"
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      disabled={idx === cookies.length - 1 || busyId === c.id}
                      onClick={() => handleReorder(c.id, "down")}
                      aria-label="تحريك لأسفل"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </div>

                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground text-xs font-bold shrink-0">
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.filename}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>آخر استخدام: {relTimeAr(c.lastUsedAt)}</span>
                      {c.lastError && (
                        <span className="text-destructive flex items-center gap-1">
                          <CircleAlert className="size-3" />
                          {c.lastError}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="text-xs text-muted-foreground hidden sm:inline">نشط</Label>
                    <Switch
                      checked={c.isActive}
                      disabled={busyId === c.id}
                      onCheckedChange={() => handleToggle(c.id, c.isActive)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:text-destructive"
                      disabled={busyId === c.id}
                      onClick={() => handleDelete(c.id, c.filename)}
                      aria-label="حذف"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Section 4 — Skills =====

function SectionSkills({ initialSkills }: { initialSkills: SkillItem[] }) {
  const [skills, setSkills] = React.useState<SkillItem[]>(initialSkills);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  // form state
  const [fName, setFName] = React.useState("");
  const [fRepo, setFRepo] = React.useState("");
  const [fBranch, setFBranch] = React.useState("main");
  const [fDesc, setFDesc] = React.useState("");
  const [fProvider, setFProvider] = React.useState("");
  const [fModel, setFModel] = React.useState("");

  async function refresh() {
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) return;
      const j = await res.json();
      setSkills(j.skills);
    } catch {
      /* ignore */
    }
  }

  function resetForm() {
    setFName("");
    setFRepo("");
    setFBranch("main");
    setFDesc("");
    setFProvider("");
    setFModel("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fName || !fRepo) {
      toast.error("يرجى إدخال الاسم ورابط المستودع");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fName,
          gitRepo: fRepo,
          branch: fBranch || "main",
          description: fDesc || undefined,
          defaultModelProvider: fProvider || undefined,
          defaultModelName: fModel || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed");
      }
      toast.success("تمت إضافة المهارة — سيتم استنساخها تلقائياً");
      resetForm();
      setDialogOpen(false);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "تعذّرت إضافة المهارة");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string, current: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/skills?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      toast.error("تعذّر تحديث المهارة");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReclone(id: string, name: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/skills/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: id }),
      });
      if (!res.ok) throw new Error();
      toast.success(`سيتم إعادة استنساخ "${name}" في أقرب وقت`);
      await refresh();
    } catch {
      toast.error("تعذّر طلب إعادة الاستنساخ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف المهارة "${name}"؟`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/skills?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("تم حذف المهارة");
      await refresh();
    } catch {
      toast.error("تعذّر الحذف");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="size-5 text-primary" />
                المهارات
              </CardTitle>
              <CardDescription className="mt-1">
                ربط مهارات التنسيق بمستودعات Git — سيتم استنساخها تلقائياً في الـ workers
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" />
                  إضافة مهارة
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>إضافة مهارة جديدة</DialogTitle>
                  <DialogDescription>اربط مستودع Git ك مهارة تنسيق</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="sk-name">اسم المهارة *</Label>
                    <Input
                      id="sk-name"
                      value={fName}
                      onChange={(e) => setFName(e.target.value)}
                      placeholder="مثال: تفريغ-تنسيق-افتراضي"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sk-repo">رابط مستودع Git *</Label>
                    <Input
                      id="sk-repo"
                      value={fRepo}
                      onChange={(e) => setFRepo(e.target.value)}
                      placeholder="https://github.com/user/skill-repo"
                      required
                      dir="ltr"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="sk-branch">الفرع</Label>
                      <Input
                        id="sk-branch"
                        value={fBranch}
                        onChange={(e) => setFBranch(e.target.value)}
                        placeholder="main"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sk-provider">مزود النموذج الافتراضي</Label>
                      <Select value={fProvider} onValueChange={setFProvider}>
                        <SelectTrigger id="sk-provider" className="w-full">
                          <SelectValue placeholder="اختر المزود" />
                        </SelectTrigger>
                        <SelectContent>
                          {MODEL_PROVIDERS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sk-model">اسم النموذج الافتراضي</Label>
                    <Input
                      id="sk-model"
                      value={fModel}
                      onChange={(e) => setFModel(e.target.value)}
                      placeholder="مثال: anthropic/claude-3.5-sonnet"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sk-desc">الوصف</Label>
                    <Textarea
                      id="sk-desc"
                      value={fDesc}
                      onChange={(e) => setFDesc(e.target.value)}
                      placeholder="وصف مختصر لما تفعله هذه المهارة"
                      className="min-h-20"
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={creating}
                    >
                      إلغاء
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      إضافة
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {skills.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Brain className="size-10 mx-auto mb-3 opacity-40" />
              <p>لا توجد مهارات بعد. أضف مهارة بربط مستودع Git.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {skills.map((s) => (
                <div key={s.id} className="rounded-lg border p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm">{s.name}</h4>
                        {s.clonedAt ? (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-600/30">
                            <CircleCheck className="size-3" />
                            مُستنسخة
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-600/30">
                            <RefreshCw className="size-3" />
                            بانتظار الاستنساخ
                          </Badge>
                        )}
                      </div>
                      <a
                        href={s.gitRepo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1 truncate"
                        dir="ltr"
                      >
                        <Github className="size-3 shrink-0" />
                        <span className="truncate">{s.gitRepo}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </div>
                    <Switch
                      checked={s.isActive}
                      disabled={busyId === s.id}
                      onCheckedChange={() => handleToggle(s.id, s.isActive)}
                    />
                  </div>

                  {s.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Badge variant="secondary">
                      <span className="font-mono">{s.branch}</span>
                    </Badge>
                    {s.defaultModelProvider && (
                      <Badge variant="secondary">{PROVIDER_LABELS[s.defaultModelProvider] || s.defaultModelProvider}</Badge>
                    )}
                    {s.defaultModelName && (
                      <Badge variant="outline" className="font-mono">
                        {s.defaultModelName}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-auto pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === s.id}
                      onClick={() => handleReclone(s.id, s.name)}
                    >
                      <RefreshCw className="size-3.5" />
                      إعادة الاستنساخ
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === s.id}
                      onClick={() => handleDelete(s.id, s.name)}
                    >
                      <Trash2 className="size-3.5" />
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Section 5 — AI Providers =====

function SectionProviders({ initialProviders }: { initialProviders: ProviderItem[] }) {
  const [providers, setProviders] = React.useState<ProviderItem[]>(initialProviders);
  const [keys, setKeys] = React.useState<Record<string, string>>({});
  const [show, setShow] = React.useState<Record<string, boolean>>({});
  const [savingProvider, setSavingProvider] = React.useState<string | null>(null);
  const [togglingProvider, setTogglingProvider] = React.useState<string | null>(null);

  const providerOrder = ["openrouter", "openai", "deepseek"];

  async function refresh() {
    try {
      const res = await fetch("/api/providers");
      if (!res.ok) return;
      const j = await res.json();
      setProviders(j.providers);
    } catch {
      /* ignore */
    }
  }

  async function handleSave(provider: string) {
    const key = keys[provider]?.trim();
    if (!key) {
      toast.error("أدخل مفتاح API أولاً");
      return;
    }
    setSavingProvider(provider);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed");
      }
      toast.success(`تم حفظ مفتاح ${PROVIDER_LABELS[provider] || provider}`);
      setKeys((k) => ({ ...k, [provider]: "" }));
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "تعذّر الحفظ");
    } finally {
      setSavingProvider(null);
    }
  }

  async function handleToggle(providerId: string, current: boolean) {
    setTogglingProvider(providerId);
    try {
      const res = await fetch("/api/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: providerId, isActive: !current }),
      });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      toast.error("تعذّر تحديث الحالة");
    } finally {
      setTogglingProvider(null);
    }
  }

  return (
    <div className="space-y-4">
      <Alert className="border-primary/30 bg-primary/5">
        <Server className="size-4 text-primary" />
        <AlertTitle>ملاحظة حول Codex</AlertTitle>
        <AlertDescription>
          Codex لا يحتاج مفتاح API — يستخدم تسجيل دخول ChatGPT Plus (انظر قسم{" "}
          <span className="font-medium">Codex Plus</span>).
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            مفاتيح الذكاء الاصطناعي
          </CardTitle>
          <CardDescription>
            مفاتيح API لمزوّدي النماذج — تُستخدم عند التنسيق عبر OpenCode
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {providerOrder.map((providerKey) => {
            const existing = providers.find((p) => p.provider === providerKey);
            const isSaving = savingProvider === providerKey;
            return (
              <div
                key={providerKey}
                className="rounded-lg border p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <KeyRound className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{PROVIDER_LABELS[providerKey]}</p>
                      {existing ? (
                        <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                          {existing.apiKeyMasked} ({existing.apiKeyLength} حرف)
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">لا يوجد مفتاح محفوظ</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {existing && (
                      <>
                        <Label className="text-xs text-muted-foreground">نشط</Label>
                        <Switch
                          checked={existing.isActive}
                          disabled={togglingProvider === existing.id}
                          onCheckedChange={() => handleToggle(existing.id, existing.isActive)}
                        />
                      </>
                    )}
                    <a
                      href={PROVIDER_GET_KEY_URLS[providerKey]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      احصل على مفتاح
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={show[providerKey] ? "text" : "password"}
                      placeholder={existing ? "أدخل مفتاحاً جديداً للاستبدال…" : "ألصق مفتاح API هنا"}
                      value={keys[providerKey] || ""}
                      onChange={(e) =>
                        setKeys((k) => ({ ...k, [providerKey]: e.target.value }))
                      }
                      dir="ltr"
                      className="pe-9 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute end-1 top-1/2 -translate-y-1/2 size-7"
                      onClick={() =>
                        setShow((s) => ({ ...s, [providerKey]: !s[providerKey] }))
                      }
                      aria-label={show[providerKey] ? "إخفاء" : "إظهار"}
                    >
                      {show[providerKey] ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </Button>
                  </div>
                  <Button onClick={() => handleSave(providerKey)} disabled={isSaving}>
                    {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    حفظ
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Section 6 — Workers Status =====

function SectionWorkers({ initialWorkers }: { initialWorkers: WorkerItem[] }) {
  const [workers, setWorkers] = React.useState<WorkerItem[]>(initialWorkers);
  const [toggling, setToggling] = React.useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<number>(Date.now());

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/workers");
      if (!res.ok) return;
      const j = await res.json();
      setWorkers(j.workers);
      setLastRefresh(Date.now());
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-refresh every 5s
  React.useEffect(() => {
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function handleToggle(workerId: string, current: boolean) {
    setToggling(workerId);
    try {
      const res = await fetch("/api/workers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, enabled: !current }),
      });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      toast.error("تعذّر تحديث حالة الـ worker");
    } finally {
      setToggling(null);
    }
  }

  const transcribeWorkers = workers.filter((w) => w.type === "transcribe");
  const formatWorkers = workers.filter((w) => w.type === "format");
  const activeTranscribe = transcribeWorkers.filter((w) => w.enabled && !w.isStale && w.status !== "disabled").length;
  const activeFormat = formatWorkers.filter((w) => w.enabled && !w.isStale && w.status !== "disabled").length;

  function statusBadge(w: WorkerItem) {
    if (!w.enabled || w.status === "disabled") {
      return (
        <Badge className="bg-zinc-200 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200">
          <Power className="size-3" />
          معطّل
        </Badge>
      );
    }
    if (w.isStale || w.status === "error") {
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300">
          <CircleAlert className="size-3" />
          خطأ/متوقف
        </Badge>
      );
    }
    if (w.status === "active") {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Activity className="size-3" />
          نشط
        </Badge>
      );
    }
    return (
      <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300">
        خامل
      </Badge>
    );
  }

  function WorkerCard({ w }: { w: WorkerItem }) {
    return (
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-md ${
                w.type === "transcribe"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
              }`}
            >
              {w.type === "transcribe" ? <HardDrive className="size-4" /> : <Server className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-semibold font-mono" dir="ltr">{w.workerId}</p>
              <p className="text-xs text-muted-foreground">
                {w.type === "transcribe" ? "تفريغ" : "تنسيق"}
              </p>
            </div>
          </div>
          {statusBadge(w)}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">المهمة الحالية</span>
            <span className="font-mono" dir="ltr">
              {w.currentJobId ? w.currentJobId.slice(0, 12) + "…" : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">آخر نبضة</span>
            <span>{relTimeAr(w.lastHeartbeat)}</span>
          </div>
          {w.lastError && (
            <div className="flex items-start gap-1 text-destructive pt-1">
              <CircleAlert className="size-3 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{w.lastError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 border-t">
          <Label className="text-xs text-muted-foreground">مُفعّل</Label>
          <Switch
            checked={w.enabled}
            disabled={toggling === w.workerId}
            onCheckedChange={() => handleToggle(w.workerId, w.enabled)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="size-5 text-primary" />
                حالة الـ Workers
              </CardTitle>
              <CardDescription className="mt-1">
                التحكم بتفعيل/تعطيل العمال (الحاويات تبقى قيد التشغيل)
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCw className="size-3.5" />
              تحديث
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-emerald-50/40 dark:bg-emerald-900/10 p-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <HardDrive className="size-4" />
                <span className="text-sm font-medium">عمال التفريغ النشطون</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
                {activeTranscribe}
                <span className="text-sm text-muted-foreground font-normal">/5</span>
              </p>
            </div>
            <div className="rounded-lg border bg-teal-50/40 dark:bg-teal-900/10 p-4">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
                <Server className="size-4" />
                <span className="text-sm font-medium">عمال التنسيق النشطون</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-teal-700 dark:text-teal-300">
                {activeFormat}
                <span className="text-sm text-muted-foreground font-normal">/2</span>
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            آخر تحديث: {relTimeAr(new Date(lastRefresh).toISOString())} — يتحدّث تلقائياً كل 5 ثوانٍ
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">عمال التفريغ (Transcription)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {transcribeWorkers.map((w) => (
              <WorkerCard key={w.workerId} w={w} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">عمال التنسيق (Formatting / OpenCode)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {formatWorkers.map((w) => (
              <WorkerCard key={w.workerId} w={w} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Section 7 — Codex Plus =====

function SectionCodexPlus({
  opencodeAuthJsonEnvSet,
  opencodeAuthJsonFromDb,
  opencodeAuthJsonSet,
}: {
  opencodeAuthJsonEnvSet: boolean;
  opencodeAuthJsonFromDb: string;
  opencodeAuthJsonSet: boolean;
}) {
  const [authJson, setAuthJson] = React.useState(opencodeAuthJsonFromDb);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const authPath = "~/.local/share/opencode/auth.json";

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opencode_auth_json: authJson }),
      });
      if (!res.ok) throw new Error();
      toast.success("تم حفظ محتوى OPENCODE_AUTH_JSON");
    } catch {
      toast.error("تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyPath() {
    try {
      await navigator.clipboard.writeText(authPath);
      setCopied(true);
      toast.success("تم نسخ المسار");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذّر النسخ");
    }
  }

  return (
    <div className="space-y-4">
      <Alert className="border-primary/30 bg-primary/5">
        <Server className="size-4 text-primary" />
        <AlertTitle>ربط اشتراك ChatGPT Plus / Codex Plus مع OpenCode</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal ps-5 space-y-2 mt-2 text-sm">
            <li>
              على جهازك المحلي (الذي به متصفح)، ثبّت OpenCode:{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded" dir="ltr">
                npm i -g opencode-ai@latest
              </code>
            </li>
            <li>
              شغّل تسجيل الدخول:{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all" dir="ltr">
                opencode auth login --provider openai --method "ChatGPT Plus/Pro"
              </code>
            </li>
            <li>سيفتح المتصفح — سجّل الدخول بحساب ChatGPT Plus الخاص بك وامنح الصلاحية.</li>
            <li>
              بعد النجاح، سيُحفظ ملف التوكن في:{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded" dir="ltr">
                {authPath}
              </code>
            </li>
            <li>انسخ محتوى هذا الملف بالكامل.</li>
            <li>
              الصق المحتوى في الحقل أدناه (متغير البيئة{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded" dir="ltr">
                OPENCODE_AUTH_JSON
              </code>
              ) — أو أضفه كمتغير بيئة في Coolify.
            </li>
          </ol>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                OPENCODE_AUTH_JSON
              </CardTitle>
              <CardDescription className="mt-1">
                محتوى ملف auth.json الناتج من تسجيل دخول ChatGPT Plus
              </CardDescription>
            </div>
            {opencodeAuthJsonSet ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                <CircleCheck className="size-3" />
                مُعدّ
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300">
                <AlertTriangle className="size-3" />
                غير مُعدّ
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {opencodeAuthJsonEnvSet && (
            <Alert className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/10">
              <CircleCheck className="size-4 text-emerald-600" />
              <AlertTitle>متغير البيئة مُعدّ</AlertTitle>
              <AlertDescription>
                متغير البيئة{" "}
                <code className="font-mono text-xs" dir="ltr">
                  OPENCODE_AUTH_JSON
                </code>{" "}
                مُعرّف في البيئة (الإعداد الموصى به للإنتاج). لا حاجة لإدخاله هنا.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="auth-json">محتوى auth.json</Label>
              <Button size="sm" variant="ghost" onClick={handleCopyPath} className="text-xs">
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                نسخ المسار
              </Button>
            </div>
            <Textarea
              id="auth-json"
              value={authJson}
              onChange={(e) => setAuthJson(e.target.value)}
              placeholder='{"token": "...", "account_id": "..."}'
              className="font-mono text-xs min-h-40"
              dir="ltr"
              disabled={opencodeAuthJsonEnvSet}
            />
            <p className="text-xs text-muted-foreground">
              في الإنتاج، يُفضّل ضبط هذا كمتغير بيئة{" "}
              <code className="font-mono" dir="ltr">
                OPENCODE_AUTH_JSON
              </code>{" "}
              في Coolify بدلاً من تخزينه في قاعدة البيانات.
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={saving || opencodeAuthJsonEnvSet}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            حفظ المحتوى
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
