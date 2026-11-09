import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDashed, ClipboardList, Loader2, PackageSearch, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuditPreview } from "@/components/audit-preview";
import { DeleteGesture } from "@/components/slide-to-delete";
import { buildAudit, categoryOf } from "@/lib/inventory";
import { auditProgress, cn, dateKey } from "@/lib/utils";
import { useTransition } from "@/components/ui/transition";

export const RECENT_KEY = "inventory-audit-recent";
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const shortDate = (value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const tones = {
  green: { card: "border-emerald-300 bg-emerald-50", icon: "bg-emerald-200 text-emerald-800", value: "text-emerald-900", label: "text-emerald-800" },
  yellow: { card: "border-yellow-300 bg-yellow-50", icon: "bg-yellow-200 text-yellow-900", value: "text-yellow-900", label: "text-yellow-800" },
  cyan: { card: "border-cyan-300 bg-cyan-50", icon: "bg-cyan-200 text-cyan-800", value: "text-cyan-900", label: "text-cyan-800" },
  indigo: { card: "border-indigo-300 bg-indigo-50", icon: "bg-indigo-200 text-indigo-800", value: "text-indigo-900", label: "text-indigo-800" },
};

const chips = {
  todo: { label: "Not started", icon: CircleDashed, chip: "bg-indigo-100 text-indigo-800" },
  progress: { label: "In progress", icon: Loader2, chip: "bg-yellow-200 text-yellow-900" },
  issues: { label: "Needs follow-up", icon: AlertTriangle, chip: "bg-orange-200 text-orange-900" },
  complete: { label: "Completed", icon: CheckCircle2, chip: "bg-emerald-100 text-emerald-800" },
};

function Stat({ label, value, detail, icon: Icon, tone }) {
  const color = tones[tone];
  return <Card className={color.card}><CardContent className="flex items-center justify-between p-5"><div><p className={`text-sm font-medium ${color.label}`}>{label}</p><p className={`mt-1 text-2xl font-bold ${color.value}`}>{value}</p>{detail && <p className={`mt-0.5 text-xs ${color.label}`}>{detail}</p>}</div><span className={`grid h-11 w-11 place-items-center rounded-lg ${color.icon}`}><Icon className="h-6 w-6" /></span></CardContent></Card>;
}

function Section({ title, description, count, empty, children }) {
  return <section>
    <div className="mb-2 flex items-baseline gap-2"><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h3><span className="text-sm text-slate-500">({count})</span>{description && <span className="ml-2 hidden text-xs text-slate-500 sm:inline">{description}</span>}</div>
    {count ? <Card><CardContent className="divide-y divide-slate-200 p-0">{children}</CardContent></Card> : <Card className="border-dashed"><CardContent className="p-4 text-center text-sm text-slate-500">{empty}</CardContent></Card>}
  </section>;
}

function Row({ kind, title, detail, action, onPreview }) {
  const meta = chips[kind]; const Icon = meta.icon;
  return <div className={cn("flex flex-wrap items-center gap-3 p-3 md:px-4", onPreview && "cursor-pointer hover:bg-slate-50")} {...(onPreview ? { role: "button", tabIndex: 0, "aria-label": `Preview ${title} audit`, onClick: onPreview, onKeyDown: (event) => event.target === event.currentTarget && (event.key === "Enter" || event.key === " ") && onPreview() } : {})}>
    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", meta.chip)}><Icon className={cn("h-4 w-4", kind === "progress" && "animate-spin")} /></span>
    <div className="min-w-0 flex-1"><p className="truncate font-semibold uppercase">{title}</p><p className="text-xs text-slate-500">{detail}</p></div>
    <Badge className={cn("border-transparent", meta.chip)}>{meta.label}</Badge>
    <div onClick={(event) => event.stopPropagation()}>{action}</div>
  </div>;
}

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
  const recentlyCompleted = [...closedAudits].sort(byClosed).slice(0, 3);

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

  return <div className="space-y-6">
    <p className="text-slate-500">What's scheduled today, what's still open, and what was finished recently.</p>
    <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 lg:gap-4 xl:grid-cols-4">
      <Stat label="Completed this month" value={`${completedThisMonth.size} / ${codes.size}`} detail={`${remaining} not completed`} icon={CheckCircle2} tone="green" />
      <Stat label="In progress" value={inProgress.length} icon={ClipboardList} tone="yellow" />
      <Stat label="Reference SKUs" value={state.inventory.length.toLocaleString()} icon={PackageSearch} tone="cyan" />
      <Stat label="Today" value={todayCodes.length} detail="audits scheduled" icon={CalendarDays} tone="indigo" />
    </div>

    <Section title="Scheduled today" description={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} count={todayCodes.length} empty="Nothing scheduled for today. Use Schedule on the calendar.">
      {todayCodes.map((code) => {
        const audit = auditFor(code); const done = audit?.status === "completed"; const running = audit && !done;
        return <Row key={code} onPreview={running ? () => setPreviewId(audit.id) : undefined} kind={done ? "complete" : running ? "progress" : "todo"} title={code} detail={audit ? `${auditProgress(audit)}% scanned` : "No activity yet"}
          action={done ? open(audit, "View", true) : running ? open(audit, "Continue") : <Button size="sm" onClick={() => start(code)}><Play className="h-3.5 w-3.5" />Start</Button>} />;
      })}
    </Section>

    <Section title="In progress" description="Right-click or swipe left to delete" count={inProgress.length} empty="No audits running right now.">
      {inProgress.map((audit) => <DeleteGesture key={audit.id} label={audit.category || audit.name} onDelete={() => deleteAudit(audit.id)}><Row onPreview={() => setPreviewId(audit.id)} kind="progress" title={audit.category || audit.name} detail={`${auditProgress(audit)}% scanned · started ${shortDate(audit.startedAt || audit.createdAt)}${audit.initials ? ` by ${audit.initials}` : ""}`} action={open(audit, "Continue")} /></DeleteGesture>)}
    </Section>

    <Section title="Recently completed" description="Your 3 most recent" count={recentlyCompleted.length} empty="No completed audits yet.">
      {recentlyCompleted.map((audit) => <Row key={audit.id} kind={auditProgress(audit) < 100 ? "issues" : "complete"} title={audit.category || audit.name} detail={`Completed ${audit.completedAt ? shortDate(audit.completedAt) : ""}${audit.completedBy ? ` by ${audit.completedBy}` : ""} · ${auditProgress(audit)}% scanned`} action={open(audit, "View", true)} />)}
    </Section>
    <AuditPreview audit={state.audits.find((audit) => audit.id === previewId)} onClose={() => setPreviewId(null)} />
  </div>;
}
