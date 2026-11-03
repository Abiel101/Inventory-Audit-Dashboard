import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Info, Loader2, NotebookPen, Play, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildAudit, categoryOf, groupCodes } from "@/lib/inventory";
import { auditProgress, cn, dateKey } from "@/lib/utils";

const SCHEDULE_KEY = "inventory-audit-schedule";
const NOTES_KEY = "inventory-audit-month-notes";

const statuses = {
  notStarted: { label: "Not started", icon: CircleDashed, chip: "bg-slate-100 text-slate-700", bar: "bg-slate-400" },
  scheduled: { label: "Scheduled", icon: CalendarDays, chip: "bg-indigo-100 text-indigo-800", bar: "bg-indigo-500" },
  progress: { label: "In progress", icon: Loader2, chip: "bg-yellow-200 text-yellow-900", bar: "bg-yellow-400" },
  complete: { label: "Completed", icon: CheckCircle2, chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
  issues: { label: "Closed with issues", icon: AlertTriangle, chip: "bg-orange-200 text-orange-900", bar: "bg-orange-500" },
};
const order = Object.keys(statuses);
const issueTypes = ["IMOD", "LOSS", "Other"];

const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const shiftMonth = (key, delta) => { const date = new Date(`${key}-01T00:00:00`); date.setMonth(date.getMonth() + delta); return dateKey(date).slice(0, 7); };
const inMonth = (value, month) => Boolean(value) && dateKey(new Date(value)).slice(0, 7) === month;

export function MonthStatus({ state, update }) {
  const navigate = useNavigate();
  const currentMonth = dateKey(new Date()).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const [schedule] = useState(() => readJSON(SCHEDULE_KEY, {}));
  const [allNotes, setAllNotes] = useState(() => readJSON(NOTES_KEY, {}));
  const [draft, setDraft] = useState({ type: issueTypes[0], text: "" });

  const monthNotes = allNotes[month] ?? {};
  const saveNotes = (next) => { setAllNotes(next); localStorage.setItem(NOTES_KEY, JSON.stringify(next)); };

  const rows = useMemo(() => {
    const codes = new Set([...state.inventory.map(categoryOf), ...state.audits.map((audit) => audit.category), ...Object.keys(schedule)]);
    return [...codes].map((code) => {
      const audits = state.audits.filter((audit) => audit.category === code && (audit.scheduledDate ? audit.scheduledDate.slice(0, 7) === month : inMonth(audit.createdAt, month) || inMonth(audit.startedAt, month) || inMonth(audit.completedAt, month)));
      const notes = monthNotes[code] ?? [];
      const running = audits.find((audit) => audit.status !== "completed");
      const closed = audits.filter((audit) => audit.status === "completed");
      const latest = running ?? closed.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0];
      const progress = latest ? auditProgress(latest) : 0;
      const scheduledOn = schedule[code]?.startsWith(month) ? schedule[code] : null;
      let status = "notStarted";
      if (running) status = "progress";
      else if (closed.length) status = progress >= 100 && !notes.length ? "complete" : "issues";
      else if (scheduledOn) status = "scheduled";
      return { code, status, audit: latest, progress, scheduledOn, notes, completedBy: latest?.completedBy, completedAt: latest?.completedAt };
    });
  }, [state.inventory, state.audits, schedule, month, monthNotes]);

  const counts = Object.fromEntries(order.map((status) => [status, rows.filter((row) => row.status === status).length]));
  const done = counts.complete + counts.issues;
  const percent = rows.length ? Math.round((done / rows.length) * 100) : 0;

  const terms = query.split(",").map((term) => term.trim().toLowerCase()).filter(Boolean);
  const visible = rows.filter((row) => (filter === "all" || row.status === filter) && (!terms.length || terms.some((term) => row.code.toLowerCase().includes(term))));
  const groups = groupCodes(visible.map((row) => row.code));
  const byCode = new Map(rows.map((row) => [row.code, row]));

  const startAudit = (code) => {
    const audit = buildAudit(state.inventory, code);
    if (!audit.items.length) return;
    update((current) => ({ ...current, audits: [audit, ...current.audits] }));
    navigate(`/workspace/${audit.id}`);
  };
  const addNote = (code) => {
    if (!draft.text.trim()) return;
    const note = { id: crypto.randomUUID(), type: draft.type, text: draft.text.trim(), createdAt: new Date().toISOString() };
    saveNotes({ ...allNotes, [month]: { ...monthNotes, [code]: [...(monthNotes[code] ?? []), note] } });
    setDraft({ ...draft, text: "" });
  };
  const removeNote = (code, id) => saveNotes({ ...allNotes, [month]: { ...monthNotes, [code]: (monthNotes[code] ?? []).filter((note) => note.id !== id) } });

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-slate-500">Every case code needs to be audited each month. Track what's left, what's in flight, and what was closed with issues.</p></div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-36 text-center font-semibold">{monthLabel(month)}</span>
        <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="outline" className={month === currentMonth ? "invisible" : ""} tabIndex={month === currentMonth ? -1 : 0} onClick={() => setMonth(currentMonth)}>This month</Button>
      </div>
    </div>

    {!rows.length ? <Card className="border-dashed"><CardContent className="p-8 text-center"><p className="font-semibold">No case codes yet</p><p className="mt-1 text-sm text-slate-500">Import an inventory source on the Build an audit page to load this month's checklist.</p></CardContent></Card> : <>
      <Card><CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm text-slate-500">{monthLabel(month)} completion</p><p className="text-3xl font-bold">{done}<span className="text-lg font-medium text-slate-500"> / {rows.length} audits closed</span></p></div><p className="text-3xl font-bold text-sky-700">{percent}%</p></div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Status breakdown">{order.slice().reverse().map((status) => counts[status] ? <div key={status} className={statuses[status].bar} style={{ width: `${(counts[status] / rows.length) * 100}%` }} title={`${statuses[status].label}: ${counts[status]}`} /> : null)}</div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">{order.map((status) => { const Icon = statuses[status].icon; return <button key={status} type="button" onClick={() => setFilter(filter === status ? "all" : status)} className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition hover:border-sky-500", filter === status ? "border-sky-600 ring-2 ring-sky-500/30" : "border-slate-200")}><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md", statuses[status].chip)}><Icon className="h-4 w-4" /></span><span><span className="block text-2xl font-bold leading-none">{counts[status]}</span><span className="text-xs text-slate-500">{statuses[status].label}</span></span></button>; })}</div>
      </CardContent></Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9 pr-10" placeholder="Search case codes, e.g. bridal, mens" aria-label="Search case codes" />
          <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><button type="button" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded text-slate-400 hover:text-slate-700" aria-label="Search tips"><Info className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="bottom" align="end" className="max-w-xs text-xs">Separate several searches with commas, e.g. <b>bridal, mens, silver ice</b>.</TooltipContent></Tooltip></TooltipProvider></div>
        {filter !== "all" && <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>Showing {statuses[filter].label} · Clear</Button>}
      </div>

      <div className="space-y-6">{groups.length ? groups.map(([group, codes]) => <section key={group}>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{group} <span className="font-normal">({codes.length})</span></h3>
        <Card><CardContent className="divide-y divide-slate-200 p-0">{codes.map((code) => { const row = byCode.get(code); const meta = statuses[row.status]; const Icon = meta.icon; const expanded = open === code;
          return <div key={code}>
            <div className="flex flex-wrap items-center gap-3 p-3 md:px-4">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", meta.chip)}><Icon className={cn("h-4 w-4", row.status === "progress" && "animate-spin")} /></span>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold uppercase">{code}</p><p className="text-xs text-slate-500">{[row.status === "scheduled" && row.scheduledOn && `Scheduled ${new Date(`${row.scheduledOn}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, row.audit && `${row.progress}% scanned`, row.completedAt && row.status !== "progress" && `Closed ${new Date(row.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${row.completedBy ? ` by ${row.completedBy}` : ""}`].filter(Boolean).join(" · ") || "No activity yet this month"}</p></div>
              <Badge className={cn("border-transparent", meta.chip)}>{meta.label}</Badge>
              {row.notes.length > 0 && <Badge variant="warning">{row.notes.length} {row.notes.length === 1 ? "issue" : "issues"}</Badge>}
              <div className="flex gap-2">
                {(row.status === "notStarted" || row.status === "scheduled") && <Button size="sm" onClick={() => startAudit(code)}><Play className="h-3.5 w-3.5" />Start</Button>}
                {row.status === "progress" && <Button size="sm" onClick={() => navigate(`/workspace/${row.audit.id}`)}>Continue</Button>}
                {(row.status === "complete" || row.status === "issues") && row.audit && <Button size="sm" variant="outline" onClick={() => navigate(`/workspace/${row.audit.id}`)}>View</Button>}
                <Button size="sm" variant={expanded ? "default" : "outline"} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : code)}><NotebookPen className="h-3.5 w-3.5" />Notes</Button>
              </div>
            </div>
            {expanded && <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-4">
              {row.notes.length ? row.notes.map((note) => <div key={note.id} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm"><Badge variant="warning" className="shrink-0">{note.type}</Badge><div className="min-w-0 flex-1"><p className="whitespace-pre-wrap break-words">{note.text}</p><p className="mt-1 text-xs text-slate-500">{new Date(note.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div><Button variant="ghost" size="icon" aria-label="Delete note" onClick={() => removeNote(code, note.id)}><Trash2 className="h-4 w-4" /></Button></div>) : <p className="text-sm text-slate-500">No issues logged for {monthLabel(month)}. Log an IMOD, a LOSS, or anything else under Other.</p>}
              <div className="grid gap-2 md:grid-cols-[12rem_1fr_auto]">
                <select aria-label="Issue type" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{issueTypes.map((type) => <option key={type}>{type}</option>)}</select>
                <Input value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} onKeyDown={(event) => event.key === "Enter" && addNote(code)} placeholder={draft.type === "Other" ? "Add any other notes…" : draft.type === "IMOD" ? "SKU and what was modded…" : "SKU, quantity, claim number…"} aria-label="Issue details" />
                <Button disabled={!draft.text.trim()} onClick={() => addNote(code)}>Add note</Button>
              </div>
            </div>}
          </div>; })}</CardContent></Card>
      </section>) : <p className="text-sm text-slate-500">No case codes match this filter.</p>}</div>
    </>}
  </div>;
}
