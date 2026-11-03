import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarPlus, Check, ChevronLeft, ChevronRight, Play, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildAudit, categoryOf, compareCodes, groupCodes, readInventoryFile, sourceFreshness } from "@/lib/inventory";
import { auditProgress, cn, dateKey } from "@/lib/utils";

const SCHEDULE_KEY = "inventory-audit-schedule";
const CODES_KEY = "inventory-audit-known-codes";
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const statusLabel = { scheduled: "Not started", progress: "In progress", research: "Closed · needs research", complete: "Complete", overdue: "Overdue" };
const statusStyle = {
  scheduled: "bg-indigo-100 text-indigo-800",
  progress: "bg-yellow-200 text-yellow-900",
  research: "bg-orange-200 text-orange-900",
  complete: "bg-emerald-100 text-emerald-800",
  overdue: "bg-rose-100 text-rose-800",
};

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const parseKey = (key) => new Date(`${key}T00:00:00`);
const longDate = (key) => parseKey(key).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function Chip({ code, status, className }) {
  return <span className={cn("block truncate rounded uppercase px-1.5 py-0.5 text-[10px] font-semibold", statusStyle[status], className)} title={`${code} · ${statusLabel[status]}`}>{code}</span>;
}

export function AuditCalendar({ state, update }) {
  const { audits, inventory, sourceName } = state;
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const today = new Date();
  const todayKey = dateKey(today);
  const [schedule, setSchedule] = useState(() => readJSON(SCHEDULE_KEY, {}));
  const [knownCodes, setKnownCodes] = useState(() => readJSON(CODES_KEY, []));
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(todayKey);
  const [dayOpen, setDayOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [pendingStart, setPendingStart] = useState(null);
  const [notice, setNotice] = useState("");

  const savedAt = state.sourceModifiedAt || state.sourceUploadedAt; const freshness = sourceFreshness(sourceName, inventory.length > 0, todayKey, savedAt ? dateKey(new Date(savedAt)) : null);
  const needsUpdate = freshness.status !== "fresh";

  const inventoryCodes = useMemo(() => [...new Set(inventory.map(categoryOf))], [inventory]);
  useEffect(() => {
    setKnownCodes((current) => {
      const merged = [...new Set([...current, ...inventoryCodes])];
      return merged.length === current.length ? current : merged;
    });
  }, [inventoryCodes]);
  useEffect(() => { localStorage.setItem(CODES_KEY, JSON.stringify(knownCodes)); }, [knownCodes]);

  const saveSchedule = (next) => { setSchedule(next); localStorage.setItem(SCHEDULE_KEY, JSON.stringify(next)); };

  const auditsFor = (code) => audits.filter((audit) => audit.category === code);
  const codeStatus = (code, key) => {
    const related = auditsFor(code);
    if (related.some((audit) => audit.status !== "completed")) return "progress";
    const closed = related.filter((audit) => audit.status === "completed");
    if (closed.length) return closed.some((audit) => auditProgress(audit) >= 100) ? "complete" : "research";
    return key < todayKey ? "overdue" : "scheduled";
  };

  const dayActivity = (key) => audits.flatMap((audit) => {
    const scans = audit.scans.filter((scan) => scan.timestamp && dateKey(new Date(scan.timestamp)) === key);
    const closed = Boolean(audit.completedAt) && dateKey(new Date(audit.completedAt)) === key;
    return scans.length || closed ? [{ audit, scans: scans.length, units: scans.reduce((total, scan) => total + (Number(scan.qty) || 0), 0), locations: [...new Set(scans.map((scan) => scan.location))], closed }] : [];
  });

  const byDay = useMemo(() => Object.entries(schedule).reduce((groups, [code, key]) => { (groups[key] ??= []).push(code); return groups; }, {}), [schedule]);
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const cells = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));

  const goTo = (key) => { setSelected(key); setDayOpen(true); const date = parseKey(key); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); };
  const shiftMonth = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const goToday = () => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(todayKey); };
  const closeDay = () => { setDayOpen(false); setPendingStart(null); };

  const dayCodes = Object.keys(schedule).filter((code) => schedule[code] === selected);
  const unscheduled = knownCodes.filter((code) => !schedule[code]).sort(compareCodes);
  const visibleUnscheduled = unscheduled.filter((code) => code.toLowerCase().includes(query.trim().toLowerCase()));
  const pickedCodes = [...checked].filter((code) => unscheduled.includes(code));
  const activity = dayActivity(selected);

  const toggleChecked = (code) => setChecked((current) => { const next = new Set(current); next.has(code) ? next.delete(code) : next.add(code); return next; });
  const addPicked = () => {
    if (!pickedCodes.length) return;
    saveSchedule({ ...schedule, ...Object.fromEntries(pickedCodes.map((code) => [code, selected])) });
    setChecked(new Set());
  };
  const unschedule = (code) => { const { [code]: _removed, ...rest } = schedule; saveSchedule(rest); };
  const clearDay = () => {
    if (!window.confirm(`Unschedule all ${dayCodes.length} case code(s) on this day?`)) return;
    saveSchedule(Object.fromEntries(Object.entries(schedule).filter(([, key]) => key !== selected)));
  };
  const move = (code, key) => { if (!key) return; saveSchedule({ ...schedule, [code]: key }); goTo(key); };

  const openAudit = (code, sourceInventory) => {
    const open = auditsFor(code).find((audit) => audit.status !== "completed");
    const closed = auditsFor(code).find((audit) => audit.status === "completed");
    const existing = open ?? closed;
    if (existing) return navigate(`/workspace/${existing.id}`);
    const audit = buildAudit(sourceInventory, code);
    if (!audit.items.length) return setNotice(`No inventory rows found for case code ${code.toUpperCase()}. Upload an inventory source that includes it.`);
    update((current) => ({ ...current, audits: [audit, ...current.audits] }));
    navigate(`/workspace/${audit.id}`);
  };

  const requestStart = (code) => {
    const hasAudit = auditsFor(code).length > 0;
    if (needsUpdate && !hasAudit) { setPendingStart(code); return; }
    openAudit(code, inventory);
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const { inventory: nextInventory, ...source } = await readInventoryFile(file); const nextName = source.sourceName;
    update((current) => ({ ...current, inventory: nextInventory, ...source }));
    const check = sourceFreshness(nextName, true, todayKey, dateKey(new Date(source.sourceModifiedAt || source.sourceUploadedAt)));
    setNotice(check.status === "fresh" ? `Inventory updated from ${nextName}.` : check.status === "stale" ? `Loaded ${nextName}, but it is dated ${longDate(check.sourceDate)}, not today.` : `Loaded ${nextName}, but no date was found in the file name.`);
    if (pendingStart) { const code = pendingStart; setPendingStart(null); openAudit(code, nextInventory); }
  };

  const freshnessMessage = {
    none: "No inventory source is loaded. Upload today's inventory file so audits can be started from the calendar.",
    unknown: `Couldn't find a date in "${sourceName}". Confirm the file is today's inventory, or upload an updated one.`,
    stale: `The inventory file "${sourceName}" is dated ${freshness.sourceDate && longDate(freshness.sourceDate)}, but today is ${longDate(todayKey)}. Upload today's file so inventory is updated daily.`,
  }[freshness.status];

  return <div className="space-y-6">
    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} />
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-slate-500">{scheduling ? "Scheduling mode: click a day to assign case codes to it." : "Click a day to see what needs to be done and start an audit."}</p></div>
      <Button variant={scheduling ? "default" : "outline"} onClick={() => { setScheduling((value) => !value); setPendingStart(null); }}>{scheduling ? <><Check className="h-4 w-4" />Done scheduling</> : <><CalendarPlus className="h-4 w-4" />Schedule</>}</Button>
    </div>

    {needsUpdate && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
      <AlertTriangle className="h-5 w-5 shrink-0" /><p className="min-w-0 flex-1">{freshnessMessage}</p>
      <Button size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload updated file</Button>
    </div>}
    {notice && <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm" role="status"><span>{notice}</span><Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setNotice("")}><X className="h-4 w-4" /></Button></div>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
      <Card className={cn(scheduling && "ring-2 ring-sky-500")}><CardContent className="p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <h3 className="flex-1 text-center text-lg font-semibold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={goToday}>Today</Button>
        </div>
        <div className="grid grid-cols-7 gap-1">{weekdays.map((day) => <span key={day} className="py-1 text-center text-xs font-medium text-slate-500">{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">{cells.map((date) => {
          const key = dateKey(date); const codes = byDay[key] ?? []; const hasActivity = dayActivity(key).length > 0;
          return <button key={key} type="button" onClick={() => { setSelected(key); setDayOpen(scheduling); setPendingStart(null); }} className={cn("flex min-h-[58px] flex-col items-stretch gap-0.5 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 text-left hover:border-sky-500 md:min-h-[96px] md:p-1.5", date.getMonth() !== month.getMonth() && "opacity-45", key === todayKey && "border-sky-600", key === selected && "outline outline-2 outline-sky-600")}>
            <b className={cn("text-xs", key === todayKey && "text-sky-700")}>{date.getDate()}</b>
            {codes.slice(0, 3).map((code) => <Chip key={code} code={code} status={codeStatus(code, key)} />)}
            {codes.length > 3 && <small className="text-[10px] text-slate-500">+{codes.length - 3} more</small>}
            {hasActivity && !codes.length && <small className="text-[10px] text-slate-500">activity</small>}
          </button>;
        })}</div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">{Object.entries(statusLabel).map(([status, label]) => <span key={status} className="flex items-center gap-1.5"><i className={cn("inline-block h-2.5 w-2.5 rounded-sm", statusStyle[status])} />{status === "complete" ? "Complete (100%)" : status === "research" ? "Closed · needs research (<100%)" : label}</span>)}</div>
      </CardContent></Card>
      <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>{selected === todayKey ? "Today" : parseKey(selected).toLocaleDateString("en-US", { weekday: "long" })}</CardTitle><p className="mt-1 text-xs text-slate-500">{longDate(selected)}</p></div><Badge>{dayCodes.length}</Badge></div></CardHeader><CardContent className="max-h-[40rem] space-y-4 overflow-y-auto">
        {!scheduling && pendingStart && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p className="font-semibold">Update the inventory file first?</p>
          <p className="mt-1">{freshnessMessage}</p>
          <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload updated file</Button><Button size="sm" variant="outline" onClick={() => { const code = pendingStart; setPendingStart(null); openAudit(code, inventory); }}>Start anyway</Button><Button size="sm" variant="ghost" onClick={() => setPendingStart(null)}>Cancel</Button></div>
        </div>}
        <div className="space-y-2">{dayCodes.length ? dayCodes.map((code) => {
          const status = codeStatus(code, selected); const related = auditsFor(code); const pct = related.length ? Math.max(...related.map(auditProgress)) : 0;
          const label = status === "progress" ? "Continue" : status === "complete" || status === "research" ? "View" : "Start";
          return <div key={code} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
            <span className={cn("min-w-0 flex-1 break-words rounded px-2 py-1 text-xs font-semibold uppercase", statusStyle[status])} title={statusLabel[status]}>{code}</span>
            <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-600">{pct}%</span>
            <Button size="sm" variant={status === "complete" || status === "research" ? "outline" : "default"} onClick={() => requestStart(code)}>{(status === "scheduled" || status === "overdue") && <Play className="h-3.5 w-3.5" />}{label}</Button>
          </div>;
        }) : <p className="text-sm text-slate-500">Nothing scheduled {selected === todayKey ? "today" : "this day"}. Use Schedule to assign case codes.</p>}</div>
        <div><h4 className="text-sm font-semibold">What was done</h4>
          <div className="mt-1 divide-y divide-slate-200">{activity.length ? activity.map(({ audit, scans, units, locations, closed }) => <div key={audit.id} className="grid gap-1 py-2 text-sm"><b className="uppercase">{audit.name}</b><span className="text-slate-500">{scans} scans · {units} units{locations.length ? ` · ${locations.join(", ")}` : ""}</span>{closed && <Badge variant={auditProgress(audit) >= 100 ? "success" : "warning"} className="w-fit">Closed at {auditProgress(audit)}%</Badge>}</div>) : <p className="py-2 text-sm text-slate-500">No audit activity recorded.</p>}</div></div>
      </CardContent></Card>
    </div>

    {dayOpen && scheduling && <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={closeDay} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl" role="dialog" aria-label="Selected day">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{scheduling ? "Scheduling" : "Selected day"}</p><h3 className="mt-1 text-lg font-semibold">{parseKey(selected).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h3></div><Button variant="outline" size="icon" aria-label="Close" onClick={closeDay}><X className="h-4 w-4" /></Button></div>

        {scheduling ? <>
          <div className="mt-5 flex items-center justify-between"><h4 className="text-sm font-semibold">Scheduled case codes</h4>{dayCodes.length > 0 && <Button variant="outline" size="sm" onClick={clearDay}>Clear day</Button>}</div>
          <div className="mt-2 space-y-2">{dayCodes.length ? dayCodes.map((code) => <div key={code} className="flex flex-wrap items-center gap-2"><Chip code={code} status={codeStatus(code, selected)} className="max-w-[9rem]" /><small className="text-slate-500">{statusLabel[codeStatus(code, selected)]}</small><input type="date" value={selected} onChange={(event) => move(code, event.target.value)} aria-label={`Reschedule ${code}`} className="ml-auto h-8 rounded-md border border-slate-300 bg-white px-2 text-xs" /><Button variant="outline" size="sm" aria-label={`Unschedule ${code}`} onClick={() => unschedule(code)}>×</Button></div>) : <p className="text-sm text-slate-500">Nothing scheduled this day.</p>}</div>
          <div className="mt-4">{unscheduled.length ? <details className="rounded-lg border border-slate-200 p-3" open><summary className="cursor-pointer text-sm font-semibold">Add case codes to this day ({unscheduled.length} unscheduled)</summary>
            <Input className="mt-3" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter case codes…" aria-label="Filter case codes" />
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={visibleUnscheduled.length > 0 && visibleUnscheduled.every((code) => checked.has(code))} onChange={(event) => setChecked(event.target.checked ? new Set([...checked, ...visibleUnscheduled]) : new Set([...checked].filter((code) => !visibleUnscheduled.includes(code))))} /> Select all</label>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{groupCodes(visibleUnscheduled).map(([group, codes]) => <div key={group}><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</p>{codes.map((code) => <label key={code} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-100"><input type="checkbox" checked={checked.has(code)} onChange={() => toggleChecked(code)} /><span className="uppercase">{code}</span></label>)}</div>)}</div>
            <Button className="mt-3 w-full" disabled={!pickedCodes.length} onClick={addPicked}>Add {pickedCodes.length || ""} selected to this day</Button></details>
            : <p className="text-sm text-slate-500">{knownCodes.length ? "All case codes are scheduled." : "Import an inventory source to load case codes."}</p>}</div>
        </> : <>
          <h4 className="mt-5 text-sm font-semibold">To do this day</h4>
          <div className="mt-2 space-y-2">{dayCodes.length ? dayCodes.map((code) => {
            const status = codeStatus(code, selected); const rows = inventory.filter((item) => categoryOf(item) === code);
            const label = status === "progress" ? "Continue audit" : status === "complete" || status === "research" ? "View audit" : "Start audit";
            return <div key={code} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <div className="min-w-0 flex-1"><Chip code={code} status={status} className="w-fit max-w-full text-xs" /><p className="mt-1 text-xs text-slate-500">{statusLabel[status]}{rows.length ? ` · ${rows.length} SKUs · ${rows.reduce((sum, item) => sum + item.quantity, 0)} units` : ""}</p></div>
              <Button size="sm" variant={status === "complete" || status === "research" ? "outline" : "default"} onClick={() => requestStart(code)}>{(status === "scheduled" || status === "overdue") && <Play className="h-3.5 w-3.5" />}{label}</Button>
            </div>;
          }) : <p className="text-sm text-slate-500">Nothing scheduled this day. Use Schedule to assign case codes.</p>}</div>
        </>}

        <h4 className="mt-6 text-sm font-semibold">What was done</h4>
        <div className="mt-2 divide-y divide-slate-200">{activity.length ? activity.map(({ audit, scans, units, locations, closed }) => <div key={audit.id} className="grid gap-1 py-2 text-sm"><b className="uppercase">{audit.name}</b><span className="text-slate-500">{scans} scans · {units} units{locations.length ? ` · ${locations.join(", ")}` : ""}</span>{closed && <Badge variant={auditProgress(audit) >= 100 ? "success" : "warning"} className="w-fit">Closed at {auditProgress(audit)}%{auditProgress(audit) < 100 ? " · needs research" : ""}</Badge>}</div>) : <p className="py-2 text-sm text-slate-500">No audit activity recorded.</p>}</div>
      </aside>
    </>}
  </div>;
}
