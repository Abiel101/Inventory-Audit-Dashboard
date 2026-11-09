import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Download, FlaskConical, Pencil, Play, RefreshCw, Save, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useTransition } from "@/components/ui/transition";
import { DataTable } from "@/components/data-table";
import { auditProgress, auditTally, cn, formatDate, identifiersMatch, scanKey } from "@/lib/utils";
import { ItemSheet, resizeImage } from "@/components/item-sheet";
import { categoryOf, findKnownIssue, readInventoryFile } from "@/lib/inventory";
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

function NoteInput({ sku, value, onSave }) {
  return <Input className="h-8 min-w-48" defaultValue={value} placeholder="Add a note" aria-label={`Note for ${sku}`} onClick={(event) => event.stopPropagation()} onBlur={(event) => event.target.value.trim() !== value && onSave(event.target.value)} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} />;
}

function Empty({ title, detail }) {
  return <Card className="border-dashed"><CardContent className="p-8 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></CardContent></Card>;
}

export function AuditWorkspace({ state, update }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const audit = id ? state.audits.find((item) => item.id === id) : state.audits.find((item) => item.status === "in-progress");
  const [initials, setInitials] = useState(audit?.initials ?? "");
  const [locationName, setLocationName] = useState("");
  const [sku, setSku] = useState("");
  const toast = useToast();
  const transition = useTransition();
  const [tab, setTab] = useState("scan");
  const [confirming, setConfirming] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [notice, setNotice] = useState("");
  const [uploaded, setUploaded] = useState(null);
  const [uploadError, setUploadError] = useState("");
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
  const setItemNote = (key, text) => patch({ itemNotes: { ...audit.itemNotes, [key]: text.trim() } });

  const addScan = () => {
    if (!locationName || !sku.trim()) return;
    const lookup = (list) => byStyle ? list.find((item) => identifiersMatch(item.style, sku)) : list.find((item) => identifiersMatch(item.sku, sku)) ?? list.find((item) => identifiersMatch(item.style, sku));
    const reference = lookup(audit.items) ?? lookup(state.inventory ?? []);
    patch({ scans: [...audit.scans, { id: crypto.randomUUID(), sku: reference?.sku ?? sku.trim(), description: reference?.description ?? "", style: reference?.style ?? "", qty: 1, section: audit.scans.find((scan) => scan.location === locationName)?.section ?? audit.sectionsCompleted ?? 0, location: locationName, timestamp: new Date().toISOString() }] });
    setSku("");
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
      await exportAuditWorkbook(audit, { compareKey, format, caseFor });
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
    setSku("");
  };

  const caseFor = (scan) => {
    const match = state.inventory.find((item) => identifiersMatch(item.sku, scan.sku)) ?? state.inventory.find((item) => item.style && identifiersMatch(item.style, scan.sku));
    return match ? categoryOf(match) : null;
  };

  const uploadPast = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const { inventory } = await readInventoryFile(file);
      const items = inventory.filter((item) => categoryOf(item).trim().toUpperCase() === String(audit.category).trim().toUpperCase());
      if (!items.length) {
        const found = [...new Set(inventory.map(categoryOf))].slice(0, 5).join(", ");
        setUploaded(null);
        return setUploadError(`${file.name} doesn't match this audit (${String(audit.category).toUpperCase()}). It contains: ${found}. Upload a file for the same case code.`);
      }
      setUploadError("");
      setUploaded({ id: "uploaded", label: file.name, items, scans: [] });
      setCompareId("uploaded");
    } catch (error) { setUploaded(null); setUploadError(error.message); }
  };

  const detailKey = detail ? compareKey(detail.sku) : "";
  const addImages = async (files) => {
    try {
      const added = await Promise.all(files.filter((file) => file.type.startsWith("image/")).map((file) => resizeImage(file)));
      if (added.length) update((current) => ({ ...current, audits: current.audits.map((candidate) => candidate.id === audit.id ? { ...candidate, itemImages: { ...candidate.itemImages, [detailKey]: [...(candidate.itemImages?.[detailKey] ?? []), ...added] } } : candidate) }));
    } catch (error) { toast(error.message, { variant: "error" }); }
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

  const locationSummary = [...audit.scans.reduce((map, scan) => map.set(scan.location, (map.get(scan.location) ?? 0) + (Number(scan.qty) || 0)), new Map())];
  const others = state.audits.filter((item) => item.id !== audit.id && item.category === audit.category);

  const view = closed && tab === "scan" ? "items" : tab;
  const tabList = closed ? [["items", "Audit"], ["research", "Research"]] : [["scan", "Scan"], ["items", "Audit"], ["research", "Research"]];
  const tabs = <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-xs" role="tablist">
    {tabList.map(([value, label]) => <button key={value} role="tab" aria-selected={view === value} onClick={() => value === "research" && !closed ? toast("Not available until audit is completed", { variant: "error" }) : setTab(value)} className={cn("flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium", view === value ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100")}>{value === "research" && <FlaskConical className="h-3.5 w-3.5" />}{label}</button>)}
  </div>;

  const progressBar = <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white"><span className="text-xl font-bold">{progress}%</span><div className="h-2 min-w-32 flex-1 overflow-hidden rounded bg-slate-700"><div className="h-full bg-sky-400" style={{ width: `${progress}%` }} /></div><span>{expectedUnits} expected</span><span>{foundUnits} scanned</span><span>{audit.items.length} SKUs</span><span>{tally.extra.size} not in audit</span></div>;

  const sidebar = <div>
      <Card><CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Completed sections</CardTitle></CardHeader><CardContent className="space-y-1 p-3 pt-0 text-[11px] leading-tight">
        {locationSummary.length ? locationSummary.map(([name, units]) => <button key={name} type="button" disabled={phase !== "running"} onClick={() => reopenSection(name)} title="Select this section to add more scans" className={cn("flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left", phase === "running" && "hover:bg-slate-100", name === locationName && "bg-sky-50 ring-1 ring-sky-300")}><span>{name}</span><span className="flex items-center gap-2 text-slate-500">{units} units{audit.completedLocations.includes(name) ? <Badge variant="success">Done</Badge> : <Badge variant="secondary">Open</Badge>}</span></button>) : <p className="text-slate-500">No sections scanned yet.</p>}
      </CardContent></Card>
    </div>;

  const scanPanel = <div className="space-y-5">
      {phase === "running" && <Card><CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Scan items</CardTitle><CardDescription className="text-[11px]">Scan each item individually; every scan counts as one unit.</CardDescription></CardHeader><CardContent className="p-3 pt-0 text-xs">
        <div className="grid gap-2 md:grid-cols-3">
          <select aria-label="Location" className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs" value={locationName} onChange={(event) => setLocationName(event.target.value)}><option value="">Select a location...</option>{state.locations.map((value) => <option key={value}>{value}</option>)}</select>
          <Input autoFocus className="h-8 text-xs" inputMode={byStyle ? "text" : "numeric"} value={sku} onChange={(event) => setSku(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addScan()} placeholder={byStyle ? "Scan or type style number" : "Scan or type SKU"} />
          <Button size="sm" className="h-8 text-xs" disabled={!locationName || !sku.trim()} onClick={addScan}>{byStyle ? "Add style" : "Add SKU"}</Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><Button size="sm" className="h-8 text-xs" variant="outline" disabled={!locationName || !audit.scans.some((scan) => scan.location === locationName)} onClick={completeSection}>Complete section</Button><div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-xs" role="group" aria-label="Input type">{[["sku", "SKU"], ["style", "Style #"]].map(([value, label]) => <button key={value} type="button" aria-pressed={inputMode === value} onClick={() => setInputMode(value)} className={cn("rounded px-2.5 py-1 font-medium", inputMode === value ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100")}>{label}</button>)}</div></div>
      </CardContent></Card>}
      <Card><CardHeader className="p-3 pb-1"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm">Scan log</CardTitle><div className="flex gap-3 text-xs text-slate-500"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-rose-300" />Not in audit</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-300" />Known issue</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />Quantity differs</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-300" />Quantity met</span></div></div></CardHeader><CardContent className="p-3 pt-0 text-[11px] leading-tight [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:h-6 [&_th]:px-1.5 [&_th]:text-[11px]"><TooltipProvider delayDuration={100}><DataTable columns={columns} persistKey={`${audit.id}:scan`} data={[...audit.scans].reverse()} searchPlaceholder="Search scanned items..." onRowClick={openDetail} rowClassName={(scan, previous) => cn(issueFor(scan) ? issueTone : rowTone[tally.status(scan)], previous && (previous.section ?? previous.location) !== (scan.section ?? scan.location) && "border-t-[6px] border-t-slate-400")} /></TooltipProvider></CardContent></Card>
    </div>;

  const reference = compareId === "uploaded" ? uploaded : others.find((item) => item.id === compareId) ? (() => { const past = others.find((item) => item.id === compareId); return { id: past.id, label: `${past.name.toUpperCase()} · ${formatDate(past.createdAt)}`, items: past.items, scans: past.scans }; })() : null;
  const comparison = (() => {
    const rows = new Map();
    const row = (sku) => { const key = compareKey(sku); if (!rows.has(key)) rows.set(key, { id: key, sku, now: 0, nowScanned: 0, before: 0, beforeScanned: 0, nowLocations: new Set(), beforeLocations: new Set() }); return rows.get(key); };
    audit.items.forEach((item) => { row(item.sku).now += Number(item.quantity) || 0; });
    audit.scans.forEach((scan) => { const r = row(scan.sku); r.nowScanned += Number(scan.qty) || 0; r.nowLocations.add(scan.location); });
    (reference?.items ?? []).forEach((item) => { row(item.sku).before += Number(item.quantity) || 0; });
    (reference?.scans ?? []).forEach((scan) => { const r = row(scan.sku); r.beforeScanned += Number(scan.qty) || 0; r.beforeLocations.add(scan.location); });
    return [...rows.values()].map((r) => {
      const nowLocations = [...r.nowLocations].sort().join(", ");
      const beforeLocations = [...r.beforeLocations].sort().join(", ");
      const changed = !!reference && (r.now !== r.before || (reference.scans.length > 0 && (nowLocations !== beforeLocations || r.nowScanned !== r.beforeScanned)));
      return { ...r, nowLocations: nowLocations || "—", beforeLocations: beforeLocations || "—", changed, note: audit.itemNotes?.[r.id] ?? "", style: audit.items.find((item) => compareKey(item.sku) === r.id)?.style ?? "", description: audit.items.find((item) => compareKey(item.sku) === r.id)?.description ?? "" };
    });
  })();
  const researchColumns = [
    { accessorKey: "sku", header: "SKU" },
    { accessorKey: "now", header: "This audit expected" },
    { accessorKey: "nowScanned", header: "This audit scanned" },
    { accessorKey: "nowLocations", header: "This audit locations" },
    ...(reference ? [{ accessorKey: "before", header: "Previous expected" }] : []),
    ...(reference?.scans.length ? [{ accessorKey: "beforeScanned", header: "Previous scanned" }, { accessorKey: "beforeLocations", header: "Previous locations" }] : []),
    ...(reference ? [{ id: "change", header: "Change", accessorFn: (r) => r.changed ? "Changed" : "Same", cell: ({ getValue }) => <Badge variant={getValue() === "Same" ? "secondary" : "warning"}>{getValue()}</Badge> }] : []),
    { accessorKey: "note", header: "Notes", cell: ({ row }) => <NoteInput key={row.original.id} sku={row.original.sku} value={row.original.note} onSave={(text) => setItemNote(row.original.id, text)} /> },
  ];

  const itemRows = [...tally.expected].map(([sku, expected]) => {
    const item = audit.items.find((entry) => entry.sku === sku);
    const scanned = tally.scanned.get(sku) ?? 0;
    return { sku, description: item?.description ?? "", style: item?.style ?? "", expected, scanned, remaining: Math.max(expected - scanned, 0) };
  });
  const itemColumns = [
    { accessorKey: "sku", header: "SKU" },
    { accessorKey: "description", header: "Description", meta: "wide" },
    { accessorKey: "style", header: "Style" },
    { accessorKey: "expected", header: "Expected" },
    { accessorKey: "scanned", header: "Scanned" },
    { accessorKey: "remaining", header: "Remaining", cell: ({ getValue }) => getValue() ? <Badge variant="warning">{getValue()} missing</Badge> : <Badge variant="success">Found</Badge> },
  ];
  const itemsPanel = <Card><CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Audit Items</CardTitle><CardDescription className="text-xs">Everything expected in this audit. Sort by Remaining to see what is still missing.</CardDescription></CardHeader><CardContent className="p-3 pt-0 text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:h-7 [&_th]:px-2"><DataTable columns={itemColumns} persistKey={`${audit.id}:items`} data={itemRows} searchPlaceholder="Search audit items..." onRowClick={openDetail} rowClassName={(row) => issueFor(row) ? issueTone : row.remaining ? "" : "bg-emerald-50 hover:bg-emerald-50"} /></CardContent></Card>;

  const saveFinal = () => { patch({ finalNote: noteDraft.trim() }); toast("Final note saved", { variant: "success" }); };
  const finalPanel = <Card><CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Final note</CardTitle><CardDescription className="text-xs">Add a closing note. It appears on the Audit Info sheet of the export; review and update it here first.</CardDescription></CardHeader><CardContent className="grid gap-3 p-3 pt-0 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
    <label className="grid gap-1 font-medium">Final note<textarea className="min-h-16 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Summary, discrepancies, follow-ups…" /></label>
    <Button onClick={saveFinal} disabled={noteDraft.trim() === (audit.finalNote ?? "")}>Save</Button>
  </CardContent></Card>;

  const researchPanel = <Card><CardHeader><div className="flex items-center gap-2"><CardTitle>Research</CardTitle><Badge variant="secondary">Beta</Badge></div><CardDescription>Add notes on specific items below, or compare this audit with a previous audit of the same case code ({String(audit.category).toUpperCase()}) to spot product that moved or was sold incorrectly. Notes are saved with the audit.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm">
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <div className="rounded-md border border-slate-200 p-3 text-sm"><p className="text-xs text-slate-500">This audit</p><b className="uppercase">{audit.name}</b></div>
      <select aria-label="Compare with" className="h-auto rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={compareId} onChange={(event) => setCompareId(event.target.value)}><option value="">Select a previous audit...</option>{uploaded && <option value="uploaded">Uploaded: {uploaded.label}</option>}{others.map((item) => <option key={item.id} value={item.id}>{item.name.toUpperCase()} · {formatDate(item.createdAt)}</option>)}</select>
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100"><Upload className="h-4 w-4" />Upload past audit<input type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="Upload past audit" onChange={uploadPast} /></label>
    </div>
    {uploadError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{uploadError}</p>}
    {!reference && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">Optionally select a previous audit or upload one to compare.{others.length || uploaded ? "" : " No previous audit of this case code exists yet."}</p>}
    <DataTable columns={researchColumns} persistKey={`${audit.id}:research`} data={comparison} searchPlaceholder="Search SKUs..." onRowClick={openDetail} rowClassName={(r) => issueFor({ sku: r.sku, style: r.style }) ? issueTone : r.changed ? "bg-amber-50 hover:bg-amber-50" : ""} />
  </CardContent></Card>;

  const fullWidth = (panel, extra = null) => <div className="flex min-w-0 flex-col gap-3 pb-6">{!closed && phase === "paused" ? null : <div className="w-fit">{tabs}</div>}{progressBar}{panel}{extra}</div>;
  const baseContent = phase === "paused" ? fullWidth(itemsPanel)
    : closed ? (view === "research" ? fullWidth(researchPanel) : fullWidth(itemsPanel, finalPanel))
    : view === "items" ? fullWidth(itemsPanel)
    : <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]"><div className="flex flex-col gap-3">{tabs}{view === "scan" && sidebar}</div><div className="flex min-w-0 flex-col gap-5 pb-24">{progressBar}{view === "scan" ? scanPanel : researchPanel}</div></div>;

  const content = <>
    <div className={pinned ? "lg:pr-80" : ""}>{baseContent}</div>
    <ItemSheet item={detail} pinned={pinned} onPin={() => setPinned((value) => !value)} onClose={() => setDetail(null)} images={detail ? audit.itemImages?.[detailKey] ?? [] : []} onAddImages={detail ? addImages : undefined} onRemoveImage={removeImage} />
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
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Badge variant={closed ? "success" : "warning"}>{closed ? "Audit closed" : phase === "paused" ? "Progress saved" : "Ready to start"}</Badge><h2 id="workspace-title" tabIndex={-1} className="mt-3 text-2xl font-bold uppercase">{displayName}</h2><p className="mt-1 text-slate-500"><span className="uppercase">{caseAbbreviation(audit.category)}</span> · {audit.items.length} reference SKUs · {snapshotLabel}{audit.initials ? ` · Associate ${closed ? audit.completedBy ?? audit.initials : audit.initials}` : ""}</p></div>{closed && <div className="flex flex-wrap items-center gap-2">{unlocking ? <><Input autoFocus type="password" inputMode="numeric" className="h-9 w-36" value={unlockCode} placeholder="Manager code" aria-label="Manager code" onChange={(event) => setUnlockCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && reopen()} /><Button onClick={reopen}><Pencil className="h-4 w-4" />Unlock</Button><Button variant="ghost" onClick={() => { setUnlocking(false); setUnlockCode(""); }}>Cancel</Button></> : <Button onClick={() => setUnlocking(true)}><Pencil className="h-4 w-4" />Edit audit</Button>}<Button variant="outline" onClick={() => setExportOpen(true)}><Download className="h-4 w-4" />Export results</Button></div>}</div>
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
