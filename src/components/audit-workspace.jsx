import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { CheckCircle2, Download, FlaskConical, Play, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DataTable } from "@/components/data-table";
import { auditProgress, auditTally, cn, formatDate, identifiersMatch, scanKey } from "@/lib/utils";
import { categoryOf, readInventoryFile } from "@/lib/inventory";

const compareKey = (value) => { const key = scanKey(value); return /^\d+$/.test(key) ? key.replace(/^0+(?=\d)/, "") : key; };

const rowTone = {
  extra: "bg-rose-100 text-rose-900 hover:bg-rose-100",
  match: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  short: "",
  over: "",
};
const resultLabel = { extra: "Not in audit", match: "Matched", short: "Short", over: "Over" };
const resultVariant = { extra: "destructive", match: "success", short: "warning", over: "warning" };

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
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState("scan");
  const [confirming, setConfirming] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [notice, setNotice] = useState("");
  const [uploaded, setUploaded] = useState(null);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    if (!audit) return;
    try {
      const recent = JSON.parse(localStorage.getItem("inventory-audit-recent")) ?? [];
      localStorage.setItem("inventory-audit-recent", JSON.stringify([audit.id, ...recent.filter((value) => value !== audit.id)].slice(0, 8)));
    } catch { /* recent list is optional */ }
  }, [audit?.id]);

  const tally = useMemo(() => (audit ? auditTally(audit) : null), [audit]);
  if (!audit) return <Empty title="No audit selected" detail="Start an audit from the dashboard or calendar to begin scanning." />;

  const closed = audit.status === "completed";
  const phase = closed ? "closed" : audit.phase ?? (audit.scans.length ? "paused" : "ready");
  const progress = auditProgress(audit);
  const expectedUnits = [...tally.expected.values()].reduce((sum, value) => sum + value, 0);
  const foundUnits = [...tally.scanned.values()].reduce((sum, value) => sum + value, 0);
  const cleanInitials = initials.trim().toUpperCase();

  const patch = (changes) => update((current) => ({ ...current, audits: current.audits.map((candidate) => candidate.id === audit.id ? { ...candidate, ...changes } : candidate) }));

  const start = () => { if (!cleanInitials) return; patch({ phase: "running", initials: cleanInitials, startedAt: audit.startedAt ?? new Date().toISOString() }); setNotice(""); };
  const saveAndClose = () => { patch({ phase: "paused" }); navigate("/dashboard"); requestAnimationFrame(() => document.getElementById("page-title")?.focus()); };
  const finish = () => { if (!cleanInitials) return; patch({ status: "completed", phase: "closed", initials: cleanInitials, completedBy: cleanInitials, completedAt: new Date().toISOString() }); setConfirming(false); setTab("scan"); requestAnimationFrame(() => document.getElementById("workspace-title")?.focus()); };
  const refreshItems = () => {
    const items = state.inventory.filter((item) => (item.category || "(BLANK)") === audit.category);
    if (!items.length) return setNotice(`No rows for ${String(audit.category).toUpperCase()} in the current inventory source (${state.sourceName || "none loaded"}). Upload an updated file from the calendar first.`);
    patch({ items });
    setNotice(`Audit updated from ${state.sourceName || "the current inventory"}: ${items.length} reference SKUs.`);
  };

  const addScan = () => {
    if (!locationName || !sku.trim() || !(Number(quantity) > 0)) return;
    const reference = audit.items.find((item) => identifiersMatch(item.sku, sku)) ?? audit.items.find((item) => identifiersMatch(item.style, sku));
    patch({ scans: [...audit.scans, { id: crypto.randomUUID(), sku: reference?.sku ?? sku.trim(), description: reference?.description ?? "", style: reference?.style ?? "", qty: Number(quantity), location: locationName, timestamp: new Date().toISOString() }] });
    setSku("");
  };
  const removeScan = (scan) => patch({ scans: audit.scans.filter((item) => item.id !== scan.id), completedLocations: audit.completedLocations.filter((location) => location !== scan.location) });
  const exportAudit = () => {
    const workbook = XLSX.utils.book_new();
    const auditRows = [...tally.expected].map(([sku, expected]) => {
      const scanned = tally.scanned.get(sku) ?? 0;
      return { SKU: sku, Expected: expected, Scanned: scanned, Variance: expected - scanned };
    });
    const scanRows = audit.scans.map((scan) => ({ SKU: scan.sku, Description: scan.description, Style: scan.style, Quantity: scan.qty, Location: scan.location, Timestamp: scan.timestamp, Result: tally.status(scan) }));
    const summaryRows = [
      { Field: "Audit", Value: audit.name },
      { Field: "Category", Value: audit.category },
      { Field: "Status", Value: "Closed" },
      { Field: "Progress", Value: `${progress}%` },
      { Field: "Completed", Value: audit.completedAt ?? "" },
      { Field: "Completed by", Value: audit.completedBy ?? audit.initials ?? "" },
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(auditRows), "Audit");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(scanRows), "Scan log");
    const filename = audit.name.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "audit";
    XLSX.writeFile(workbook, `${filename}-results.xlsx`);
  };
  const completeSection = () => {
    if (!locationName || !audit.scans.some((scan) => scan.location === locationName)) return;
    patch({ completedLocations: [...new Set([...audit.completedLocations, locationName])] });
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

  const columns = [
    { accessorKey: "sku", header: "SKU" },
    { accessorKey: "description", header: "Description", cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span> },
    { accessorKey: "style", header: "Style" },
    { accessorKey: "location", header: "Location" },
    { id: "case", header: "Case code", accessorFn: (scan) => tally.status(scan) === "extra" ? caseFor(scan) ?? "Unknown" : audit.category, cell: ({ row, getValue }) => tally.status(row.original) === "extra" ? <span className="font-semibold uppercase">{caseFor(row.original) ? `In ${getValue()}` : "Not in any inventory case"}</span> : <span className="uppercase">{getValue()}</span> },
    { accessorKey: "qty", header: "Scanned" },
    { id: "total", header: "Audit total", accessorFn: (scan) => tally.totalFor(scan).total, cell: ({ row }) => { const { total, expected } = tally.totalFor(row.original); return expected === null ? `${total} / —` : `${total} / ${expected}`; } },
    { id: "result", header: "Result", accessorFn: (scan) => tally.status(scan), cell: ({ getValue }) => <Badge variant={resultVariant[getValue()]}>{resultLabel[getValue()]}</Badge> },
    ...(!closed ? [{ id: "actions", header: "Actions", enableSorting: false, cell: ({ row }) => <Button variant="ghost" size="icon" aria-label={`Remove scan for ${row.original.sku}`} onClick={() => removeScan(row.original)}><Trash2 className="h-4 w-4 text-rose-600" /></Button> }] : []),
  ];

  const locationSummary = [...audit.scans.reduce((map, scan) => map.set(scan.location, (map.get(scan.location) ?? 0) + (Number(scan.qty) || 0)), new Map())];
  const others = state.audits.filter((item) => item.id !== audit.id && item.category === audit.category);

  const tabs = <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm" role="tablist">
    {[["scan", "Scan"], ["research", "Research"]].map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium", tab === value ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100")}>{value === "research" && <FlaskConical className="h-4 w-4" />}{label}</button>)}
  </div>;

  const scanPanel = <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white"><span className="text-xl font-bold">{progress}%</span><div className="h-2 min-w-32 flex-1 overflow-hidden rounded bg-slate-700"><div className="h-full bg-sky-400" style={{ width: `${progress}%` }} /></div><span>{expectedUnits} expected</span><span>{foundUnits} scanned</span><span>{audit.items.length} SKUs</span><span>{tally.extra.size} not in audit</span></div>
    <div className="space-y-5">
      {phase === "running" && <Card><CardHeader><CardTitle>Scan items</CardTitle><CardDescription>Quantities add up across every location against the imported quantity.</CardDescription></CardHeader><CardContent>
        <div className="grid gap-3 md:grid-cols-4">
          <select aria-label="Location" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={locationName} onChange={(event) => setLocationName(event.target.value)}><option value="">Select a location...</option>{state.locations.map((value) => <option key={value}>{value}</option>)}</select>
          <Input autoFocus value={sku} onChange={(event) => setSku(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addScan()} placeholder="Scan or type SKU" />
          <Input min="1" type="number" aria-label="Quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          <Button disabled={!locationName || !sku.trim()} onClick={addScan}>Add SKU</Button>
        </div>
        <div className="mt-3"><Button variant="outline" disabled={!locationName || !audit.scans.some((scan) => scan.location === locationName)} onClick={completeSection}>Complete section</Button></div>
      </CardContent></Card>}
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Scan log</CardTitle><div className="flex gap-3 text-xs text-slate-500"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-rose-300" />Not in audit</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />Quantity differs</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-300" />Quantity met</span></div></div></CardHeader><CardContent><DataTable columns={columns} data={[...audit.scans].reverse()} searchPlaceholder="Search scanned items..." rowClassName={(scan) => rowTone[tally.status(scan)]} /></CardContent></Card>
    </div>
    <div>
      <Card><CardHeader><CardTitle>Completed sections</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {locationSummary.length ? locationSummary.map(([name, units]) => <div key={name} className="flex items-center justify-between gap-2"><span>{name}</span><span className="flex items-center gap-2 text-slate-500">{units} units{audit.completedLocations.includes(name) ? <Badge variant="success">Done</Badge> : <Badge variant="secondary">Open</Badge>}</span></div>) : <p className="text-slate-500">No sections scanned yet.</p>}
      </CardContent></Card>
    </div>
  </div>;

  const reference = compareId === "uploaded" ? uploaded : others.find((item) => item.id === compareId) ? (() => { const past = others.find((item) => item.id === compareId); return { id: past.id, label: `${past.name.toUpperCase()} · ${formatDate(past.createdAt)}`, items: past.items, scans: past.scans }; })() : null;
  const comparison = reference ? (() => {
    const rows = new Map();
    const row = (sku) => { const key = compareKey(sku); if (!rows.has(key)) rows.set(key, { id: key, sku, now: 0, nowScanned: 0, before: 0, beforeScanned: 0, nowLocations: new Set(), beforeLocations: new Set() }); return rows.get(key); };
    audit.items.forEach((item) => { row(item.sku).now += Number(item.quantity) || 0; });
    audit.scans.forEach((scan) => { const r = row(scan.sku); r.nowScanned += Number(scan.qty) || 0; r.nowLocations.add(scan.location); });
    reference.items.forEach((item) => { row(item.sku).before += Number(item.quantity) || 0; });
    reference.scans.forEach((scan) => { const r = row(scan.sku); r.beforeScanned += Number(scan.qty) || 0; r.beforeLocations.add(scan.location); });
    return [...rows.values()].map((r) => {
      const nowLocations = [...r.nowLocations].sort().join(", ");
      const beforeLocations = [...r.beforeLocations].sort().join(", ");
      const changed = r.now !== r.before || (reference.scans.length > 0 && (nowLocations !== beforeLocations || r.nowScanned !== r.beforeScanned));
      return { ...r, nowLocations: nowLocations || "—", beforeLocations: beforeLocations || "—", changed };
    });
  })() : null;
  const researchColumns = [
    { accessorKey: "sku", header: "SKU" },
    { accessorKey: "now", header: "This audit expected" },
    { accessorKey: "nowScanned", header: "This audit scanned" },
    { accessorKey: "nowLocations", header: "This audit locations" },
    { accessorKey: "before", header: "Previous expected" },
    ...(reference?.scans.length ? [{ accessorKey: "beforeScanned", header: "Previous scanned" }, { accessorKey: "beforeLocations", header: "Previous locations" }] : []),
    { id: "change", header: "Change", accessorFn: (r) => r.changed ? "Changed" : "Same", cell: ({ getValue }) => <Badge variant={getValue() === "Same" ? "secondary" : "warning"}>{getValue()}</Badge> },
  ];

  const researchPanel = <Card><CardHeader><div className="flex items-center gap-2"><CardTitle>Research</CardTitle><Badge variant="secondary">Beta</Badge></div><CardDescription>Compare this audit with a previous audit of the same case code ({String(audit.category).toUpperCase()}) to spot product that moved or was sold incorrectly.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <div className="rounded-md border border-slate-200 p-3 text-sm"><p className="text-xs text-slate-500">This audit</p><b className="uppercase">{audit.name}</b></div>
      <select aria-label="Compare with" className="h-auto rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={compareId} onChange={(event) => setCompareId(event.target.value)}><option value="">Select a previous audit...</option>{uploaded && <option value="uploaded">Uploaded: {uploaded.label}</option>}{others.map((item) => <option key={item.id} value={item.id}>{item.name.toUpperCase()} · {formatDate(item.createdAt)}</option>)}</select>
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-100"><Upload className="h-4 w-4" />Upload past audit<input type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="Upload past audit" onChange={uploadPast} /></label>
    </div>
    {uploadError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{uploadError}</p>}
    {comparison ? <DataTable columns={researchColumns} data={comparison} searchPlaceholder="Search SKUs..." rowClassName={(r) => r.changed ? "bg-amber-50 hover:bg-amber-50" : ""} />
      : <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">Select a previous audit or upload one that matches this case code.{others.length || uploaded ? "" : " No previous audit of this case code exists yet."}</p>}
  </CardContent></Card>;

  const content = <div className="space-y-5">{tabs}{tab === "scan" ? scanPanel : researchPanel}</div>;

  const initialsField = (label) => <label className="grid gap-1 text-sm font-medium">{label}<Input className="w-48 uppercase" maxLength={5} value={initials} onChange={(event) => setInitials(event.target.value)} placeholder="e.g. AB" /></label>;

  if (phase === "running") {
    return <Sheet open onOpenChange={(open) => { if (!open) saveAndClose(); }}>
      <SheetContent side="top" className="!inset-0 !h-screen !w-screen !max-w-none !translate-y-0 overflow-y-auto rounded-none border-0 bg-slate-50 p-0 [&>button]:hidden">
        <SheetTitle className="sr-only">Audit in progress</SheetTitle>
        <SheetDescription className="sr-only">Scan inventory in the active audit, then save progress or complete the audit.</SheetDescription>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0 flex-1"><Badge variant="warning">Audit in progress</Badge><h2 className="mt-1 truncate text-xl font-bold uppercase">{audit.name}</h2><p className="text-xs text-slate-500"><span className="uppercase">{audit.category}</span> · Associate {audit.initials}</p></div>
        {confirming ? <div className="flex flex-wrap items-end gap-2">{initialsField("Associate initials")}<Button disabled={!cleanInitials} onClick={finish}><CheckCircle2 className="h-4 w-4" />Confirm complete</Button><Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button></div>
          : <div className="flex gap-2"><Button variant="outline" onClick={saveAndClose}><Save className="h-4 w-4" />Close &amp; save progress</Button><Button onClick={() => setConfirming(true)}><CheckCircle2 className="h-4 w-4" />Complete audit</Button></div>}
      </div>
      <div className="mx-auto w-full max-w-[110rem] p-4 md:p-6">{content}</div>
      </SheetContent>
    </Sheet>;
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Badge variant={closed ? "success" : "warning"}>{closed ? "Audit closed" : phase === "paused" ? "Progress saved" : "Ready to start"}</Badge><h2 id="workspace-title" tabIndex={-1} className="mt-3 text-2xl font-bold uppercase">{audit.name}</h2><p className="mt-1 text-slate-500"><span className="uppercase">{audit.category}</span> · {audit.items.length} reference SKUs{audit.initials ? ` · Associate ${closed ? audit.completedBy ?? audit.initials : audit.initials}` : ""}</p></div>{closed && <Button variant="outline" onClick={exportAudit}><Download className="h-4 w-4" />Export results</Button>}</div>
    {notice && <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm" role="status">{notice}</div>}
    {!closed && <Card><CardHeader><CardTitle>{phase === "paused" ? "Resume audit" : "Start audit"}</CardTitle><CardDescription>{phase === "paused" ? "Your progress is saved. Refresh the audit with the latest inventory before resuming if the source file changed." : "Enter the associate's initials, then start. The workspace stays focused until you complete or close the audit."}</CardDescription></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
      {initialsField("Associate initials")}
      <Button disabled={!cleanInitials} onClick={start}><Play className="h-4 w-4" />{phase === "paused" ? "Resume audit" : "Start audit"}</Button>
      {phase === "paused" && <Button variant="outline" onClick={refreshItems}><RefreshCw className="h-4 w-4" />Update audit from inventory</Button>}
    </CardContent></Card>}
    {closed || phase === "paused" ? content : null}
  </div>;
}
