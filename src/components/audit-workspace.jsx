import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, FlaskConical, Play, RefreshCw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { auditProgress, auditTally, cn, formatDate, identifiersMatch } from "@/lib/utils";

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
  const audit = state.audits.find((item) => item.id === id) ?? state.audits.find((item) => item.status === "in-progress");
  const [initials, setInitials] = useState(audit?.initials ?? "");
  const [locationName, setLocationName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState("scan");
  const [confirming, setConfirming] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [notice, setNotice] = useState("");

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
  const saveAndClose = () => { patch({ phase: "paused" }); navigate("/dashboard"); };
  const finish = () => { if (!cleanInitials) return; patch({ status: "completed", phase: "closed", initials: cleanInitials, completedBy: cleanInitials, completedAt: new Date().toISOString() }); setConfirming(false); setTab("scan"); };
  const refreshItems = () => {
    const items = state.inventory.filter((item) => (item.category || "(BLANK)") === audit.category);
    if (!items.length) return setNotice(`No rows for ${String(audit.category).toUpperCase()} in the current inventory source (${state.sourceName || "none loaded"}). Upload an updated file from the calendar first.`);
    patch({ items });
    setNotice(`Audit updated from ${state.sourceName || "the current inventory"}: ${items.length} reference SKUs.`);
  };

  const addScan = () => {
    if (!locationName || !sku.trim() || !(Number(quantity) > 0)) return;
    const reference = audit.items.find((item) => identifiersMatch(item.sku, sku) || identifiersMatch(item.style, sku));
    patch({ scans: [...audit.scans, { id: crypto.randomUUID(), sku: reference?.sku ?? sku.trim(), description: reference?.description ?? "", style: reference?.style ?? "", qty: Number(quantity), location: locationName, timestamp: new Date().toISOString() }] });
    setSku("");
  };
  const completeSection = () => {
    if (!locationName || !audit.scans.some((scan) => scan.location === locationName)) return;
    patch({ completedLocations: [...new Set([...audit.completedLocations, locationName])] });
  };

  const columns = [
    { accessorKey: "sku", header: "SKU" },
    { accessorKey: "description", header: "Description" },
    { accessorKey: "style", header: "Style" },
    { accessorKey: "location", header: "Location" },
    { accessorKey: "qty", header: "Scanned" },
    { id: "total", header: "Audit total", accessorFn: (scan) => tally.totalFor(scan).total, cell: ({ row }) => { const { total, expected } = tally.totalFor(row.original); return expected === null ? `${total} / —` : `${total} / ${expected}`; } },
    { id: "result", header: "Result", accessorFn: (scan) => tally.status(scan), cell: ({ getValue }) => <Badge variant={resultVariant[getValue()]}>{resultLabel[getValue()]}</Badge> },
  ];

  const locationSummary = [...audit.scans.reduce((map, scan) => map.set(scan.location, (map.get(scan.location) ?? 0) + (Number(scan.qty) || 0)), new Map())];
  const others = state.audits.filter((item) => item.id !== audit.id && item.category === audit.category);

  const tabs = <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm" role="tablist">
    {[["scan", "Scan"], ["research", "Research"]].map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium", tab === value ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100")}>{value === "research" && <FlaskConical className="h-4 w-4" />}{label}</button>)}
  </div>;

  const scanPanel = <div className="grid items-start gap-5 lg:grid-cols-[1fr_19rem]">
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
    <div className="space-y-5">
      <Card className="bg-slate-900 text-white"><CardContent className="p-5"><p className="text-sm text-slate-300">Audit progress</p><p className="mt-2 text-4xl font-bold">{progress}%</p><div className="mt-4 h-2 overflow-hidden rounded bg-slate-700"><div className="h-full bg-sky-400" style={{ width: `${progress}%` }} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><span>{expectedUnits} expected units</span><span>{foundUnits} scanned units</span><span>{audit.items.length} reference SKUs</span><span>{tally.extra.size} not in audit</span></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Completed sections</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {locationSummary.length ? locationSummary.map(([name, units]) => <div key={name} className="flex items-center justify-between gap-2"><span>{name}</span><span className="flex items-center gap-2 text-slate-500">{units} units{audit.completedLocations.includes(name) ? <Badge variant="success">Done</Badge> : <Badge variant="secondary">Open</Badge>}</span></div>) : <p className="text-slate-500">No sections scanned yet.</p>}
      </CardContent></Card>
    </div>
  </div>;

  const researchPanel = <Card><CardHeader><div className="flex items-center gap-2"><CardTitle>Research</CardTitle><Badge variant="secondary">Beta</Badge></div><CardDescription>Compare this audit with a previous audit of the same case code to spot product that moved or was sold incorrectly.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <div className="rounded-md border border-slate-200 p-3 text-sm"><p className="text-xs text-slate-500">This audit</p><b className="uppercase">{audit.name}</b></div>
      <select aria-label="Compare with" className="h-auto rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={compareId} onChange={(event) => setCompareId(event.target.value)}><option value="">Select a previous audit...</option>{others.map((item) => <option key={item.id} value={item.id}>{item.name.toUpperCase()} · {formatDate(item.createdAt)}</option>)}</select>
      <Button disabled>Compare</Button>
    </div>
    <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">Location-by-location comparison is coming soon. {others.length ? "" : "No previous audit of this case code exists yet."}</p>
  </CardContent></Card>;

  const content = <div className="space-y-5">{tabs}{tab === "scan" ? scanPanel : researchPanel}</div>;

  const initialsField = (label) => <label className="grid gap-1 text-sm font-medium">{label}<Input className="w-48 uppercase" maxLength={5} value={initials} onChange={(event) => setInitials(event.target.value)} placeholder="e.g. AB" /></label>;

  if (phase === "running") {
    return <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-50" role="dialog" aria-label="Audit in progress">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0 flex-1"><Badge variant="warning">Audit in progress</Badge><h2 className="mt-1 truncate text-xl font-bold uppercase">{audit.name}</h2><p className="text-xs text-slate-500"><span className="uppercase">{audit.category}</span> · Associate {audit.initials}</p></div>
        {confirming ? <div className="flex flex-wrap items-end gap-2">{initialsField("Associate initials")}<Button disabled={!cleanInitials} onClick={finish}><CheckCircle2 className="h-4 w-4" />Confirm complete</Button><Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button></div>
          : <div className="flex gap-2"><Button variant="outline" onClick={saveAndClose}><Save className="h-4 w-4" />Close &amp; save progress</Button><Button onClick={() => setConfirming(true)}><CheckCircle2 className="h-4 w-4" />Complete audit</Button></div>}
      </div>
      <div className="mx-auto w-full max-w-7xl p-5 md:p-8">{content}</div>
    </div>;
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Badge variant={closed ? "success" : "warning"}>{closed ? "Audit closed" : phase === "paused" ? "Progress saved" : "Ready to start"}</Badge><h2 className="mt-3 text-2xl font-bold uppercase">{audit.name}</h2><p className="mt-1 text-slate-500"><span className="uppercase">{audit.category}</span> · {audit.items.length} reference SKUs{audit.initials ? ` · Associate ${closed ? audit.completedBy ?? audit.initials : audit.initials}` : ""}</p></div></div>
    {notice && <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm" role="status">{notice}</div>}
    {!closed && <Card><CardHeader><CardTitle>{phase === "paused" ? "Resume audit" : "Start audit"}</CardTitle><CardDescription>{phase === "paused" ? "Your progress is saved. Refresh the audit with the latest inventory before resuming if the source file changed." : "Enter the associate's initials, then start. The workspace stays focused until you complete or close the audit."}</CardDescription></CardHeader><CardContent className="flex flex-wrap items-end gap-3">
      {initialsField("Associate initials")}
      <Button disabled={!cleanInitials} onClick={start}><Play className="h-4 w-4" />{phase === "paused" ? "Resume audit" : "Start audit"}</Button>
      {phase === "paused" && <Button variant="outline" onClick={refreshItems}><RefreshCw className="h-4 w-4" />Update audit from inventory</Button>}
    </CardContent></Card>}
    {closed || phase === "paused" ? content : null}
  </div>;
}
