import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, ChevronRight, Download, FlaskConical, Pencil, Play, RefreshCw, Save, StickyNote, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useTransition } from "@/components/ui/transition";
import { DataTable } from "@/components/data-table";
import { auditProgress, auditTally, cn, identifiersMatch, scanKey } from "@/lib/utils";
import { ItemSheet, resizeImage } from "@/components/item-sheet";
import { categoryOf, findKnownIssue } from "@/lib/inventory";
import { caseAbbreviation, exportAuditWorkbook } from "@/lib/export";

const compareKey = (value) => { const key = scanKey(value); return /^\d+$/.test(key) ? key.replace(/^0+(?=\d)/, "") : key; };

const rowTone = {
  extra: "bg-rose-100 text-rose-900 hover:bg-rose-100",
  match: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  short: "",
  over: "",
};
const resultLabel = { extra: "Not in audit", match: "Matched", short: "Short", over: "Over" };
const issueTone = "bg-indigo-100 text-indigo-900 hover:bg-indigo-100";
const resultVariant = { extra: "destructive", match: "success", short: "warning", over: "warning" };

function Empty({ title, detail }) {
  return <Card className="border-dashed"><CardContent className="p-8 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></CardContent></Card>;
}

// Owns the typed value so keystrokes only re-render this input, not the whole audit.
function ScanInput({ byStyle, disabled, onSubmit }) {
  const [value, setValue] = useState("");
  const submit = () => { if (onSubmit(value)) setValue(""); };
  return <>
    <Input autoFocus className="h-8 text-xs" inputMode={byStyle ? "text" : "numeric"} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} placeholder={byStyle ? "Scan or type style number" : "Scan or type SKU"} />
    <Button size="sm" className="h-8 text-xs" disabled={disabled || !value.trim()} onClick={submit}>{byStyle ? "Add style" : "Add SKU"}</Button>
  </>;
}

export function AuditWorkspace({ state, update }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const audit = id ? state.audits.find((item) => item.id === id) : state.audits.find((item) => item.status === "in-progress");
  const [initials, setInitials] = useState(audit?.initials ?? "");
  const [locationName, setLocationName] = useState("");
  const toast = useToast();
  const transition = useTransition();
  const [tab, setTab] = useState("scan");
  const [showSections, setShowSections] = useState(true);
  const [controlsEl, setControlsEl] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const [inputMode, setInputMode] = useState("sku");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const [noteDraft, setNoteDraft] = useState(audit?.finalNote ?? "");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!audit) return;
    try {
      const recent = JSON.parse(localStorage.getItem("inventory-audit-recent")) ?? [];
      localStorage.setItem("inventory-audit-recent", JSON.stringify([audit.id, ...recent.filter((value) => value !== audit.id)].slice(0, 8)));
    } catch { /* recent list is optional */ }
  }, [audit?.id]);

  const tally = useMemo(() => (audit ? auditTally(audit) : null), [audit]);
  if (!audit) return <Empty title="No audit selected" detail="Start an audit from the dashboard or calendar to begin scanning." />;

  const displayName = String(audit.name).startsWith(audit.category) ? String(audit.name).replace(audit.category, caseAbbreviation(audit.category)) : audit.name;
  const byStyle = inputMode === "style";
  const closed = audit.status === "completed";
  const phase = closed ? "closed" : audit.phase ?? (audit.scans.length ? "paused" : "ready");
  const progress = auditProgress(audit);
  const expectedUnits = [...tally.expected.values()].reduce((sum, value) => sum + value, 0);
  const foundUnits = [...tally.scanned.values()].reduce((sum, value) => sum + value, 0);
  const cleanInitials = initials.trim().toUpperCase();

  const patch = (changes) => update((current) => ({ ...current, audits: current.audits.map((candidate) => candidate.id === audit.id ? { ...candidate, ...changes } : candidate) }));

  const start = () => { if (!cleanInitials) return; transition(phase === "paused" ? "Resuming audit" : "Starting audit", () => { patch({ phase: "running", initials: cleanInitials, startedAt: audit.startedAt ?? new Date().toISOString() }); setNotice(""); }, { detail: phase === "paused" ? "Restoring your saved progress…" : "Setting up your scan session…" }); };
  const saveAndClose = () => transition("Saving progress", () => { patch({ phase: "paused" }); navigate("/dashboard"); requestAnimationFrame(() => document.getElementById("page-title")?.focus()); }, { detail: "Closing audit and returning to dashboard…" });
  const finish = () => { if (!cleanInitials) return; transition("Completing audit", () => { patch({ status: "completed", phase: "closed", initials: cleanInitials, completedBy: cleanInitials, completedAt: new Date().toISOString() }); setConfirming(false); setTab("scan"); requestAnimationFrame(() => document.getElementById("workspace-title")?.focus()); }, { detail: "Finalizing results and archiving…" }); };
  const reopen = () => { if (unlockCode.trim() !== "0808") return toast("Incorrect code", { variant: "error" }); setUnlocking(false); setUnlockCode(""); transition("Reopening audit", () => { patch({ status: "in-progress", phase: "running", completedAt: null, completedBy: null }); setTab("scan"); }, { detail: "Restoring audit for editing…" }); };
  const snapshot = audit.snapshot ?? { sourceName: "", sourceUploadedAt: "", takenAt: audit.createdAt };
  const snapshotLabel = `Snapshot of ${snapshot.sourceName || "inventory source"} taken ${new Date(snapshot.takenAt || audit.createdAt).toLocaleString()}`;
  const refreshItems = () => {
    const items = state.inventory.filter((item) => categoryOf(item) === audit.category).map((item) => ({ ...item }));
    if (!items.length) return toast(`No rows for ${String(audit.category).toUpperCase()} in the current source (${state.sourceName || "none loaded"}). Upload an updated file from the sidebar first.`, { variant: "error", duration: 6000 });
    if (!window.confirm(`Replace this audit's inventory snapshot with the current source (${state.sourceName})? Scans are kept, but expected quantities will change.`)) return;
    patch({ items, snapshot: { sourceName: state.sourceName, sourceUploadedAt: state.sourceUploadedAt ?? "", takenAt: new Date().toISOString() } });
    toast(`Audit updated from ${state.sourceName}: ${items.length} reference SKUs.`, { variant: "success" });
  };
  const updateButton = (size) => <Button variant="outline" size={size} title={snapshotLabel} onClick={refreshItems}><RefreshCw className="h-4 w-4" />Update audit with current source</Button>;

  const addScan = (sku) => {
    if (!locationName || !sku.trim()) return false;
    const lookup = (list) => byStyle ? list.find((item) => identifiersMatch(item.style, sku)) : list.find((item) => identifiersMatch(item.sku, sku)) ?? list.find((item) => identifiersMatch(item.style, sku));
    const reference = lookup(audit.items) ?? lookup(state.inventory ?? []);
    patch({ scans: [...audit.scans, { id: crypto.randomUUID(), sku: reference?.sku ?? sku.trim(), description: reference?.description ?? "", style: reference?.style ?? "", qty: 1, section: audit.scans.find((scan) => scan.location === locationName)?.section ?? audit.sectionsCompleted ?? 0, location: locationName, timestamp: new Date().toISOString() }] });
    return true;
  };
  const reopenSection = (name) => {
    if (phase !== "running") return;
    setLocationName(name);
    if (audit.completedLocations.includes(name)) {
      patch({ completedLocations: audit.completedLocations.filter((location) => location !== name) });
      toast(`Section "${name}" reopened. Add your scans, then complete it again.`, { variant: "success" });
    }
  };
  const removeScan = (scan) => patch({ scans: audit.scans.filter((item) => item.id !== scan.id), completedLocations: audit.completedLocations.filter((location) => location !== scan.location) });
  const exportAudit = async (format) => {
    setExporting(true);
    try {
      await exportAuditWorkbook(audit, { compareKey, format, caseFor, inventoryFor });
      setExportOpen(false);
    } catch (error) {
      toast(error.message || "Could not export this audit.", { variant: "error" });
    } finally {
      setExporting(false);
    }
  };
  const completeSection = () => {
    if (!locationName || !audit.scans.some((scan) => scan.location === locationName)) return;
    patch({ completedLocations: [...new Set([...audit.completedLocations, locationName])], sectionsCompleted: (audit.sectionsCompleted ?? 0) + 1 });
    toast(`Section "${locationName}" has been completed.`, { variant: "success" });
    setLocationName("");
  };

  const inventoryFor = (scan) => state.inventory.find((item) => identifiersMatch(item.sku, scan.sku)) ?? state.inventory.find((item) => item.style && identifiersMatch(item.style, scan.sku));
  const caseFor = (scan) => {
    const match = inventoryFor(scan);
    return match ? categoryOf(match) : null;
  };

  const detailKey = detail ? compareKey(detail.sku) : "";
  const addImages = async (files) => {
    try {
      const added = await Promise.all(files.filter((file) => file.type.startsWith("image/")).map((file) => resizeImage(file)));
      if (added.length) update((current) => ({ ...current, audits: current.audits.map((candidate) => candidate.id === audit.id ? { ...candidate, itemImages: { ...candidate.itemImages, [detailKey]: [...(candidate.itemImages?.[detailKey] ?? []), ...added] } } : candidate) }));
    } catch (error) { toast(error.message, { variant: "error" }); }
  };
  const saveNote = (sku, text) => {
    const key = compareKey(sku);
    const notes = { ...audit.itemNotes };
    if (text.trim()) notes[key] = text.trim(); else delete notes[key];
    patch({ itemNotes: notes });
    setDetail((current) => current && compareKey(current.sku) === key ? { ...current, auditNote: text.trim() } : current);
  };
  const removeImage = (index) => patch({ itemImages: { ...audit.itemImages, [detailKey]: (audit.itemImages?.[detailKey] ?? []).filter((_, position) => position !== index) } });
  const issueFor = (entry) => findKnownIssue(state.knownIssues, entry);
  const openDetail = (entry) => {
    const sku = entry.sku;
    const item = audit.items.find((candidate) => identifiersMatch(candidate.sku, sku)) ?? state.inventory.find((candidate) => identifiersMatch(candidate.sku, sku)) ?? {};
    const scans = audit.scans.filter((scan) => identifiersMatch(scan.sku, sku));
    setDetail({
      ...item,
      sku,
      description: entry.description || item.description || "",
      style: entry.style || item.style || "",
      expected: tally.expected.get(sku) ?? tally.expected.get(item.sku) ?? null,
      scanned: scans.reduce((sum, scan) => sum + (Number(scan.qty) || 0), 0),
      locations: [...new Set(scans.map((scan) => scan.location))].join(", "),
      issue: issueFor({ sku, style: entry.style || item.style }),
      auditNote: audit.itemNotes?.[compareKey(sku)] ?? "",
    });
  };

  const columns = [
    { accessorKey: "sku", header: "SKU" },
    { accessorKey: "description", header: "Description", meta: "wide", cell: ({ getValue }) => getValue() ? <Tooltip><TooltipTrigger asChild><span className="block w-[16rem] max-w-[16rem] cursor-default truncate whitespace-nowrap">{getValue()}</span></TooltipTrigger><TooltipContent className="max-w-md">{getValue()}</TooltipContent></Tooltip> : null },
    { accessorKey: "style", header: "Style" },
    { accessorKey: "location", header: "Location" },
    { id: "case", header: "Case code", accessorFn: (scan) => tally.status(scan) === "extra" ? caseFor(scan) ? caseAbbreviation(caseFor(scan)) : "Unknown" : caseAbbreviation(audit.category), cell: ({ row, getValue }) => tally.status(row.original) === "extra" ? <span className="font-semibold uppercase">{caseFor(row.original) ? `In ${getValue()}` : "Not in any inventory case"}</span> : <span className="uppercase">{getValue()}</span> },
    { accessorKey: "qty", header: "Scanned" },
    { id: "total", header: "Audit total", accessorFn: (scan) => tally.totalFor(scan).total, cell: ({ row }) => { const { total, expected } = tally.totalFor(row.original); return expected === null ? `${total} / —` : `${total} / ${expected}`; } },
    { id: "result", header: "Result", accessorFn: (scan) => tally.status(scan), cell: ({ getValue }) => <Badge variant={resultVariant[getValue()]}>{resultLabel[getValue()]}</Badge> },
    ...(!closed ? [{ id: "remove", header: "", enableSorting: false, cell: ({ row }) => <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove scan for ${row.original.sku}`} onClick={(event) => { event.stopPropagation(); removeScan(row.original); }}><X className="h-4 w-4 text-rose-600" /></Button> }] : []),
  ];

  const doneVariant = (name) => {
    const scans = audit.scans.filter((scan) => scan.location === name);
    if (scans.some((scan) => tally.status(scan) === "extra" && !issueFor(scan))) return "destructive";
    return scans.some((scan) => issueFor(scan)) ? "indigo" : "success";
  };
  const locationSummary = [...audit.scans.reduce((map, scan) => map.set(scan.location, (map.get(scan.location) ?? 0) + (Number(scan.qty) || 0)), new Map())];

  const view = closed && tab === "scan" ? "items" : phase === "paused" ? "items" : tab;
  const tabList = closed ? [["items", "Audit"], ["sections", "Sections"]] : [["scan", "Scan"], ["items", "Audit"], ["sections", "Sections"]];
  const tabs = <AnimatedTabs id="audit-workspace" tabs={tabList} value={view} onChange={setTab} className="w-[18rem] max-w-full" />;

  const toolbar = <div className={cn("flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-2 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none", view === "sections" ? "pointer-events-none translate-x-4 opacity-0" : "translate-x-0 opacity-100")} aria-hidden={view === "sections"} inert={view === "sections"}><div className="flex flex-wrap gap-3 text-xs text-slate-500">{view === "items" ? <><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-200" />Has note / known issue</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-200" />Complete</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />Still missing</span></> : <><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-rose-300" />Not in audit</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-300" />Known issue</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />Quantity differs</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-300" />Quantity met</span></>}</div><div ref={setControlsEl} className="flex items-center" /></div>;

  const progressBar = <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 h-11 rounded-lg bg-slate-900 px-4 text-sm text-white"><span className="text-xl font-bold">{progress}%</span><div className="h-2 min-w-32 flex-1 overflow-hidden rounded bg-slate-700"><div className="h-full bg-sky-400" style={{ width: `${progress}%` }} /></div><span>{expectedUnits} expected</span><span>{foundUnits} scanned</span><span>{audit.items.length} SKUs</span><span>{tally.extra.size} not in audit</span></div>;

  const sidebar = <div className="relative">
      <Card className="relative min-h-[100px] overflow-hidden">
        <div aria-hidden={showSections} className={cn("absolute inset-y-0 left-0 flex w-12 flex-col items-center gap-2.5 pt-4 transition-[opacity,visibility] duration-300 max-lg:hidden", showSections ? "invisible opacity-0" : "visible opacity-100")}>
          {locationSummary.map(([name, units]) => <span key={name} title={`${name} · ${units} units · ${audit.completedLocations.includes(name) ? "Completed" : "Open"}`} className={cn("h-2.5 w-2.5 rounded-full", audit.completedLocations.includes(name) ? "bg-emerald-500" : "bg-red-500")} />)}
        </div>
        <div aria-hidden={!showSections} className={cn("w-full transition-[opacity,visibility] duration-300 max-lg:visible max-lg:opacity-100 lg:w-[18rem]", showSections ? "visible opacity-100" : "invisible opacity-0")}>
      <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Completed sections</CardTitle></CardHeader><CardContent className="stagger space-y-1 p-3 pt-0 text-[11px] leading-tight">
        {locationSummary.length ? locationSummary.map(([name, units]) => <button key={name} type="button" disabled={phase !== "running"} onClick={() => reopenSection(name)} title="Select this section to add more scans" className={cn("flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left", phase === "running" && "hover:bg-slate-100", name === locationName && "bg-sky-50 ring-1 ring-sky-300")}><span>{name}</span><span className="flex items-center gap-2 text-slate-500">{units} units{audit.completedLocations.includes(name) ? <Badge variant={doneVariant(name)}>Done</Badge> : <Badge variant="secondary">Open</Badge>}</span></button>) : <p className="text-slate-400">No sections started</p>}
      </CardContent>
        </div>
      </Card>
      <button type="button" aria-expanded={showSections} aria-label={showSections ? "Hide completed sections" : "Show completed sections"} title={showSections ? "Hide completed sections" : "Show completed sections"} onClick={() => setShowSections((value) => !value)} className="absolute -right-3 top-1/2 z-10 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-100 max-lg:hidden"><ChevronRight className={cn("h-4 w-4 transition-transform duration-300 motion-reduce:transition-none", showSections && "rotate-180")} /></button>
    </div>;

  const scanPanel = <div className="stagger space-y-5">
      {phase === "running" && <Card><CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Scan items</CardTitle><CardDescription className="text-[11px]">Scan each item individually; every scan counts as one unit.</CardDescription></CardHeader><CardContent className="p-3 pt-0 text-xs">
        <div className="grid gap-2 md:grid-cols-3">
          <select aria-label="Location" className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs" value={locationName} onChange={(event) => setLocationName(event.target.value)}><option value="">Select a location...</option>{state.locations.map((value) => <option key={value}>{value}</option>)}</select>
          <ScanInput byStyle={byStyle} disabled={!locationName} onSubmit={addScan} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><Button size="sm" className="h-8 text-xs" variant="outline" disabled={!locationName || !audit.scans.some((scan) => scan.location === locationName)} onClick={completeSection}>Complete section</Button><AnimatedTabs tabs={[["sku", "SKU"], ["style", "Style #"]]} value={inputMode} onChange={setInputMode} className="w-44" listClassName="border-slate-300" /></div>
      </CardContent></Card>}
      <Card><CardHeader className="p-3 pb-1"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm">Scan log</CardTitle></div></CardHeader><CardContent className="p-3 pt-0 text-[11px] leading-tight [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:h-6 [&_th]:px-1.5 [&_th]:text-[11px]"><TooltipProvider delayDuration={100}><DataTable fillScreen controlsTarget={controlsEl} columns={columns} persistKey={`${audit.id}:scan`} columnsKey="scan-log" data={[...audit.scans].reverse()} searchPlaceholder="Search scanned items..." rowClassName={(scan, previous) => cn(issueFor(scan) ? issueTone : rowTone[tally.status(scan)], previous && (previous.section ?? previous.location) !== (scan.section ?? scan.location) && "border-t-[6px] border-t-slate-400")} /></TooltipProvider></CardContent></Card>
    </div>;

  const stockByKey = audit.items.reduce((map, entry) => {
    const key = compareKey(entry.sku);
    const total = map.get(key) ?? { onHand: 0, availableToSell: null };
    total.onHand += Number(entry.quantity) || 0;
    if (entry.salesFloor != null) total.availableToSell = (total.availableToSell ?? 0) + entry.salesFloor;
    return map.set(key, total);
  }, new Map());
  const itemRows = [...tally.expected].map(([sku, expected]) => {
    const item = audit.items.find((entry) => entry.sku === sku);
    const stock = stockByKey.get(compareKey(sku));
    const scanned = tally.scanned.get(sku) ?? 0;
    return { sku, note: audit.itemNotes?.[compareKey(sku)] ?? "", description: item?.description ?? "", style: item?.style ?? "", onHand: stock?.onHand ?? null, availableToSell: stock?.availableToSell ?? null, expected, scanned, remaining: Math.max(expected - scanned, 0) };
  });
  const itemColumns = [
    { accessorKey: "sku", header: "SKU" },
    { accessorKey: "description", header: "Description", meta: "wide" },
    { accessorKey: "style", header: "Style" },
    { accessorKey: "onHand", header: "On hand", cell: ({ getValue }) => getValue() ?? "—" },
    { accessorKey: "availableToSell", header: "Available to sell", cell: ({ getValue }) => getValue() ?? "—" },
    { accessorKey: "expected", header: "Expected" },
    { accessorKey: "scanned", header: "Scanned" },
    { accessorKey: "remaining", header: "Remaining", cell: ({ getValue }) => getValue() ? <Badge variant="warning">{getValue()} missing</Badge> : <Badge variant="success">Found</Badge> },
    { id: "note", header: "", enableSorting: false, cell: ({ row }) => <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${row.original.note ? "Edit" : "Add"} note for ${row.original.sku}`} title={row.original.note || "Add note"} onClick={(event) => { event.stopPropagation(); openDetail(row.original); }}><StickyNote className={cn("h-4 w-4", row.original.note ? "text-indigo-600" : "text-slate-400")} /></Button> },
  ];
  const itemsPanel = <Card><CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Audit Items</CardTitle><CardDescription className="text-xs">Everything expected in this audit. Sort by Remaining to see what is still missing.</CardDescription></CardHeader><CardContent className="p-3 pt-0 text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-7 [&_th]:px-2"><DataTable fillScreen controlsTarget={controlsEl} columns={itemColumns} persistKey={`${audit.id}:items`} columnsKey="audit-items" data={itemRows} searchPlaceholder="Search audit items..." onRowClick={openDetail} rowClassName={(row) => row.note ? "bg-indigo-100 hover:bg-indigo-200" : issueFor(row) ? issueTone : row.remaining ? "" : "bg-emerald-50 hover:bg-emerald-50"} /></CardContent></Card>;

  const sectionGroups = [...audit.scans.reduce((map, scan) => {
    const section = map.get(scan.location) ?? new Map();
    const row = section.get(scan.sku) ?? { sku: scan.sku, description: scan.description, style: scan.style, qty: 0 };
    row.qty += Number(scan.qty) || 0;
    return map.set(scan.location, section.set(scan.sku, row));
  }, new Map())].map(([name, rows]) => ({ name, rows: [...rows.values()].sort((a, b) => b.qty - a.qty), units: [...rows.values()].reduce((sum, row) => sum + row.qty, 0) }));
  const sectionColumns = [
    ["Top stock", (name) => /^\s*[1-5]\d\d\s*$/.test(name)],
    ["Understock", (name) => /understock/i.test(name)],
    ["Vault", () => true],
  ];
  const sectionsByColumn = sectionColumns.map(([title]) => ({ title, groups: [] }));
  [...sectionGroups].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true })).forEach((group) => sectionsByColumn[sectionColumns.findIndex(([, match]) => match(group.name))].groups.push(group));
  const sectionsPanel = sectionGroups.length ? <div className="stagger grid items-start gap-4 md:grid-cols-3">
    {sectionsByColumn.map(({ title, groups }) => <Card key={title}>
      <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="stagger space-y-1 p-3 pt-0 text-[11px] leading-tight">
        {groups.length ? groups.map(({ name, units }) => <div key={name} className="flex w-full items-center justify-between gap-2 px-1 py-0.5"><span>{name}</span><span className="flex items-center gap-2 text-slate-500">{units} units{audit.completedLocations?.includes(name) ? <Badge variant={doneVariant(name)}>Done</Badge> : <Badge variant="secondary">Open</Badge>}</span></div>) : <p className="text-slate-500">Nothing scanned here.</p>}
      </CardContent>
    </Card>)}
  </div> : <Empty title="No sections scanned" detail="This audit has no scanned sections." />;

  const saveFinal = () => { patch({ finalNote: noteDraft.trim() }); toast("Final note saved", { variant: "success" }); };
  const finalPanel = <Card><CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Final note</CardTitle><CardDescription className="text-xs">Add a closing note. It appears on the Audit Info sheet of the export; review and update it here first.</CardDescription></CardHeader><CardContent className="grid gap-3 p-3 pt-0 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
    <label className="grid gap-1 font-medium">Final note<textarea className="min-h-16 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Summary, discrepancies, follow-ups…" /></label>
    <Button onClick={saveFinal} disabled={noteDraft.trim() === (audit.finalNote ?? "")}>Save</Button>
  </CardContent></Card>;


  const fullWidth = (panel, extra = null) => <div className="stagger flex min-w-0 flex-col gap-3 pb-6">{panel}{extra}</div>;
  const baseContent = phase === "paused" ? fullWidth(itemsPanel)
    : closed ? (view === "sections" ? fullWidth(sectionsPanel) : fullWidth(itemsPanel, finalPanel))
    : view === "items" ? fullWidth(itemsPanel)
    : view === "sections" ? fullWidth(sectionsPanel)
    : <div className={cn("grid items-start transition-[grid-template-columns] duration-300 ease-out max-lg:gap-5 motion-reduce:transition-none", showSections ? "lg:grid-cols-[19.25rem_minmax(0,1fr)]" : "lg:grid-cols-[4.25rem_minmax(0,1fr)]")}>{sidebar}<div className="min-w-0 pb-24">{scanPanel}</div></div>;

  const content = <>
    <div className={pinned && view === "items" ? "flex items-start gap-4" : ""}>
    <div className="flex min-w-0 flex-1 flex-col gap-3"><div className="enter">{progressBar}</div>{!closed && phase === "paused" ? null : <div className="enter flex flex-wrap items-center justify-between gap-3" style={{ "--enter-delay": "50ms" }}>{tabs}{toolbar}</div>}<div key={view} className="stagger" data-hide-scrollbar="">{baseContent}</div></div>
    {view === "items" && <ItemSheet item={detail} pinned={pinned} onPin={() => setPinned((value) => !value)} onClose={() => setDetail(null)} images={detail ? audit.itemImages?.[detailKey] ?? [] : []} onAddImages={detail ? addImages : undefined} onRemoveImage={removeImage} onSaveNote={detail && !closed ? saveNote : undefined} />}
    </div>
  </>;

  const initialsField = (label) => <label className="grid gap-1 text-sm font-medium">{label}<Input className="w-48 uppercase" maxLength={5} value={initials} onChange={(event) => setInitials(event.target.value)} placeholder="e.g. AB" /></label>;

  if (phase === "running") {
    return <Sheet open onOpenChange={(open) => { if (!open) saveAndClose(); }}>
      <SheetContent side="top" className="!inset-0 !h-screen !w-screen !max-w-none !translate-y-0 overflow-y-auto rounded-none border-0 bg-slate-50 p-0 [&>button]:hidden">
        <SheetTitle className="sr-only">Audit in progress</SheetTitle>
        <SheetDescription className="sr-only">Scan inventory in the active audit, then save progress or complete the audit.</SheetDescription>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0 flex-1"><Badge variant="warning">Audit in progress</Badge><h2 className="mt-1 truncate text-xl font-bold uppercase">{displayName}</h2><p className="text-xs text-slate-500"><span className="uppercase">{caseAbbreviation(audit.category)}</span> · Associate {audit.initials}</p></div>
        {confirming ? <div className="flex flex-wrap items-end gap-2">{initialsField("Associate initials")}<Button disabled={!cleanInitials} onClick={finish}><CheckCircle2 className="h-4 w-4" />Confirm complete</Button><Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button></div>
          : <div className="flex flex-wrap gap-2">{updateButton()}<Button variant="outline" onClick={saveAndClose}><Save className="h-4 w-4" />Close &amp; save progress</Button><Button onClick={() => setConfirming(true)}><CheckCircle2 className="h-4 w-4" />Complete audit</Button></div>}
      </div>
      <div className="mx-auto w-full max-w-[110rem] p-4 md:p-6">{content}</div>
      </SheetContent>
    </Sheet>;
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Badge variant={closed ? "success" : "warning"}>{closed ? "Audit closed" : phase === "paused" ? "Progress saved" : "Ready to start"}</Badge><h2 id="workspace-title" tabIndex={-1} className="mt-3 text-2xl font-bold uppercase">{displayName}</h2><p className="mt-1 text-slate-500"><span className="uppercase">{caseAbbreviation(audit.category)}</span> · {audit.items.length} reference SKUs · {snapshotLabel}{audit.initials ? ` · Associate ${closed ? audit.completedBy ?? audit.initials : audit.initials}` : ""}</p></div>{closed && <div className="flex flex-wrap items-center gap-2">{unlocking ? <><Input autoFocus type="password" inputMode="numeric" className="h-9 w-36" value={unlockCode} placeholder="Manager code" aria-label="Manager code" onChange={(event) => setUnlockCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && reopen()} /><Button onClick={reopen}><Pencil className="h-4 w-4" />Unlock</Button><Button variant="ghost" onClick={() => { setUnlocking(false); setUnlockCode(""); }}>Cancel</Button></> : <Button onClick={() => setUnlocking(true)}><Pencil className="h-4 w-4" />Edit audit</Button>}<Button variant="outline" onClick={() => setExportOpen(true)}><Download className="h-4 w-4" />Export results</Button>{audit.research ? <Button variant="outline" onClick={() => navigate("/research")}><FlaskConical className="h-4 w-4" />In research</Button> : <Button variant="outline" onClick={() => { patch({ research: "queued" }); toast("Added to research", { variant: "success" }); }}><FlaskConical className="h-4 w-4" />Add to research</Button>}</div>}</div>
    <Sheet open={exportOpen} onOpenChange={setExportOpen}>
      <SheetContent>
        <SheetTitle>Choose export format</SheetTitle>
        <SheetDescription className="mt-2">Both formats use the same filename. Choose the version your reviewer needs.</SheetDescription>
        <div className="mt-6 grid gap-3">
          <Button disabled={exporting} onClick={() => exportAudit("new")}>New version</Button>
          <Button variant="outline" disabled={exporting} onClick={() => exportAudit("twc")}>TWC (old version)</Button>
          <p className="text-sm text-slate-500">TWC uses the original Scan and Audit layout, with locations marked beside the scans.</p>
        </div>
      </SheetContent>
    </Sheet>
    {notice && <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm" role="status">{notice}</div>}
    {!closed && <Card><CardHeader><CardTitle>{phase === "paused" ? "Resume audit" : "Start audit"}</CardTitle><CardDescription>{phase === "paused" ? "Your progress is saved. This audit keeps its own snapshot of the inventory; use the update button only if you want the latest source." : "This audit uses a snapshot of the inventory taken when it was started, so new source uploads won't change it. Enter the associate's initials, then start. The workspace stays focused until you complete or close the audit."}</CardDescription></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
      {initialsField("Associate initials")}
      <Button disabled={!cleanInitials} onClick={start}><Play className="h-4 w-4" />{phase === "paused" ? "Resume audit" : "Start audit"}</Button>
      {updateButton()}
    </CardContent></Card>}
    {closed || phase === "paused" ? content : null}
  </div>;
}
