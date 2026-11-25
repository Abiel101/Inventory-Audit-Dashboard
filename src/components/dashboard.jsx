import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDashed, ClipboardList, Loader2, PackageSearch, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditPreview } from "@/components/audit-preview";
import { DeleteGesture } from "@/components/slide-to-delete";
import { buildAudit, categoryOf } from "@/lib/inventory";
import { auditProgress, cn, dateKey } from "@/lib/utils";
import { useTransition } from "@/components/ui/transition";

export const RECENT_KEY = "inventory-audit-recent";
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const shortDate = (value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const tones = {
  green: { card: "border-ok/40 bg-ok/10", icon: "bg-ok/25 text-ok-ink", value: "text-slate-900", label: "text-ok-ink" },
  yellow: { card: "border-warn/40 bg-warn/10", icon: "bg-warn/25 text-warn-ink", value: "text-slate-900", label: "text-warn-ink" },
  cyan: { card: "border-sky-400/50 bg-sky-500/10", icon: "bg-sky-500/20 text-sky-700", value: "text-slate-900", label: "text-sky-700" },
  indigo: { card: "border-slate-300 bg-slate-100", icon: "bg-slate-200 text-slate-700", value: "text-slate-900", label: "text-slate-600" },
};

const chips = {
  todo: { label: "Not started", icon: CircleDashed, chip: "bg-sky-500/15 text-sky-700" },
  progress: { label: "In progress", icon: Loader2, chip: "bg-warn/25 text-warn-ink" },
  issues: { label: "Needs follow-up", icon: AlertTriangle, chip: "bg-alert/25 text-alert-ink" },
  complete: { label: "Completed", icon: CheckCircle2, chip: "bg-ok/20 text-ok-ink" },
};

function Stat({ label, value, detail, icon: Icon, tone }) {
  const color = tones[tone];
  return <Card className={cn("aspect-square", color.card)}><CardContent className="flex h-full flex-col justify-between p-3 sm:p-4"><span className={`grid h-9 w-9 place-items-center rounded-lg ${color.icon}`}><Icon className="h-5 w-5" /></span><div><p className={`text-2xl font-bold leading-none ${color.value}`}>{value}</p><p className={`mt-1 text-xs font-medium leading-tight ${color.label}`}>{label}</p>{detail && <p className={`text-[11px] leading-tight ${color.label}`}>{detail}</p>}</div></CardContent></Card>;
}

function Row({ kind, title, detail, action, onPreview }) {
  const meta = chips[kind]; const Icon = meta.icon;
  return <div className={cn("flex flex-wrap items-center gap-3 p-3 md:px-4", onPreview && "cursor-pointer hover:bg-slate-50")} {...(onPreview ? { role: "button", tabIndex: 0, "aria-label": `Preview ${title} audit`, onClick: onPreview, onKeyDown: (event) => event.target === event.currentTarget && (event.key === "Enter" || event.key === " ") && onPreview() } : {})}>
    <Badge className={cn("w-32 shrink-0 justify-center gap-1 border-transparent", meta.chip)}><Icon className={cn("h-3.5 w-3.5", kind === "progress" && "animate-spin")} />{meta.label}</Badge>
    <div className="min-w-0 flex-1"><p className="truncate font-semibold uppercase">{title}</p><p className="text-xs text-slate-500">{detail}</p></div>
    <div onClick={(event) => event.stopPropagation()}>{action}</div>
  </div>;
}

const FILTERS = [["all", "All"], ["issues", "Not completed"], ["progress", "In progress"], ["complete", "Completed"]];

export function Dashboard({ state, update }) {
  const navigate = useNavigate();
  const transition = useTransition();
  const [previewId, setPreviewId] = useState(null);
  const now = new Date();
  const today = dateKey(now);
  const month = today.slice(0, 7);
  const schedule = readJSON("inventory-audit-schedule", {});

  const codes = useMemo(() => new Set([...state.inventory.map(categoryOf), ...state.audits.map((audit) => audit.category)]), [state.inventory, state.audits]);
  const closedAudits = state.audits.filter((audit) => audit.status === "completed");
  const completedThisMonth = new Set(closedAudits.filter((audit) => audit.completedAt && dateKey(new Date(audit.completedAt)).slice(0, 7) === month).map((audit) => audit.category));
  const inProgress = state.audits.filter((audit) => audit.status !== "completed");
  const remaining = Math.max(codes.size - completedThisMonth.size, 0);

  const byClosed = (a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0);
  const notCompleted = closedAudits.filter((audit) => auditProgress(audit) < 100).sort(byClosed);
  const recentlyCompleted = closedAudits.filter((audit) => auditProgress(audit) >= 100).sort(byClosed).slice(0, 8);

  const todayCodes = Object.keys(schedule).filter((code) => schedule[code] === today).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const auditFor = (code) => state.audits.find((audit) => audit.category === code && audit.status !== "completed") ?? state.audits.find((audit) => audit.category === code && audit.status === "completed" && audit.completedAt && dateKey(new Date(audit.completedAt)) === today);

  const start = (code) => {
    const audit = buildAudit(state.inventory, code, undefined, 0, state);
    if (!audit.items.length) return;
    transition("Starting audit", () => {
      update((current) => ({ ...current, audits: [audit, ...current.audits] }));
      navigate(`/workspace/${audit.id}`);
    }, { detail: "Preparing inventory snapshot…" });
  };
  const deleteAudit = (id) => update((current) => ({ ...current, audits: current.audits.filter((audit) => audit.id !== id) }));
  const open = (audit, label, outline) => <Button size="sm" variant={outline ? "outline" : "default"} onClick={() => navigate(`/workspace/${audit.id}`)}>{label}</Button>;

  const activity = [
    ...inProgress.map((audit) => ({ audit, kind: "progress", at: audit.startedAt || audit.createdAt, detail: `${auditProgress(audit)}% scanned · started ${shortDate(audit.startedAt || audit.createdAt)}${audit.initials ? ` by ${audit.initials}` : ""}`, action: open(audit, "Continue"), preview: true })),
    ...notCompleted.map((audit) => ({ audit, kind: "issues", at: audit.completedAt, detail: `Closed at ${auditProgress(audit)}%${audit.completedAt ? ` · ${shortDate(audit.completedAt)}` : ""}${audit.completedBy ? ` by ${audit.completedBy}` : ""}`, action: open(audit, "View", true) })),
    ...recentlyCompleted.map((audit) => ({ audit, kind: "complete", at: audit.completedAt, detail: `Completed ${audit.completedAt ? shortDate(audit.completedAt) : ""}${audit.completedBy ? ` by ${audit.completedBy}` : ""} · 100% scanned`, action: open(audit, "View", true) })),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  const counts = { all: activity.length, issues: notCompleted.length, progress: inProgress.length, complete: recentlyCompleted.length };

  return <div className="space-y-6">
    <p className="text-slate-500">What's scheduled today, what's still open, and what was finished recently.</p>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Completed this month" value={`${completedThisMonth.size} / ${codes.size}`} detail={`${remaining} not completed`} icon={CheckCircle2} tone="green" />
        <Stat label="In progress" value={inProgress.length} icon={ClipboardList} tone="yellow" />
        <Stat label="Reference SKUs" value={state.inventory.length.toLocaleString()} icon={PackageSearch} tone="cyan" />
        <Stat label="Today" value={todayCodes.length} detail="audits scheduled" icon={CalendarDays} tone="indigo" />
      </div>
      <Card className="flex max-h-[26rem] min-h-[12rem] flex-col md:max-h-none">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="flex items-baseline gap-2 border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Scheduled today</h3><span className="text-sm text-slate-500">({todayCodes.length})</span><span className="ml-auto text-xs text-slate-500">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span></div>
          {todayCodes.length ? <div className="min-h-0 flex-1 divide-y divide-slate-200 overflow-y-auto">{todayCodes.map((code) => {
            const audit = auditFor(code); const done = audit?.status === "completed"; const running = audit && !done;
            return <Row key={code} onPreview={running ? () => setPreviewId(audit.id) : undefined} kind={done ? "complete" : running ? "progress" : "todo"} title={code} detail={audit ? `${auditProgress(audit)}% scanned` : "No activity yet"}
              action={done ? open(audit, "View", true) : running ? open(audit, "Continue") : <Button size="sm" onClick={() => start(code)}><Play className="h-3.5 w-3.5" />Start</Button>} />;
          })}</div> : <p className="p-6 text-center text-sm text-slate-500">Nothing scheduled for today. Use Schedule on the calendar.</p>}
        </CardContent>
      </Card>
    </div>

    <Card>
      <Tabs defaultValue="all">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Recent activity</h3>
          <span className="hidden text-xs text-slate-500 sm:inline">Right-click or press and hold to delete</span>
          <TabsList className="ml-auto h-auto flex-wrap">{FILTERS.map(([value, label]) => <TabsTrigger key={value} value={value}>{label} ({counts[value]})</TabsTrigger>)}</TabsList>
        </div>
        {FILTERS.map(([value]) => {
          const rows = activity.filter((entry) => value === "all" || entry.kind === value).slice(0, 20);
          return <TabsContent key={value} value={value} className="mt-0">
            {rows.length ? <div className="divide-y divide-slate-200">{rows.map(({ audit, kind, detail, action, preview }) => <DeleteGesture key={audit.id} label={audit.category || audit.name} onDelete={() => deleteAudit(audit.id)}><Row onPreview={preview ? () => setPreviewId(audit.id) : undefined} kind={kind} title={audit.category || audit.name} detail={detail} action={action} /></DeleteGesture>)}</div>
              : <p className="p-6 text-center text-sm text-slate-500">No audits here yet.</p>}
          </TabsContent>;
        })}
      </Tabs>
    </Card>
    <AuditPreview audit={state.audits.find((audit) => audit.id === previewId)} onClose={() => setPreviewId(null)} />
  </div>;
}
