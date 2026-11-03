import { useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { CalendarDays, CheckCircle2, ClipboardList, FileUp, LayoutDashboard, MapPin, PackageSearch, Plus, Settings, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { formatDate, identifiersMatch } from "@/lib/utils";

const defaultLocations = ["100", "101", "102", "200", "201", "300", "301", "Understock 1", "Vault Holds"];
const navigation = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/audits/new", "Build an audit", Plus],
  ["/workspace", "Audit workspace", ClipboardList],
  ["/calendar", "Calendar", CalendarDays],
  ["/settings", "Settings", Settings],
];
const storageKey = "inventory-audit-react-state";
const initialState = { inventory: [], audits: [], locations: defaultLocations, sourceName: "", mapping: {} };

function useAuditState() {
  const [state, setState] = useState(() => {
    try { return { ...initialState, ...JSON.parse(localStorage.getItem(storageKey)) }; } catch { return initialState; }
  });
  const update = (callback) => setState((current) => {
    const next = callback(current);
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  });
  return [state, update];
}

function AppShell({ state, children }) {
  return <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
    <aside className="hidden border-r border-slate-200 bg-white p-5 md:block">
      <div className="mb-9 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-sky-600 font-bold text-white">IA</div><div><strong className="text-sm tracking-wide">INVENTORY AUDIT</strong><p className="text-xs text-slate-500">Store operations</p></div></div>
      <nav className="space-y-1">{navigation.map(([to, label, Icon]) => <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${isActive ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="h-4 w-4" />{label}</NavLink>)}</nav>
      <p className="mt-10 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><b className="block text-slate-800">iPad-ready workflow</b>Import, build an audit, scan by location, then export results.</p>
    </aside>
    <main className="min-w-0"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:px-8"><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Store operations / inventory control</p><h1 className="mt-1 text-xl font-bold">Inventory Audit</h1></div><Badge variant={state.sourceName ? "success" : "secondary"}>{state.sourceName ? `Source: ${state.sourceName}` : "No source loaded"}</Badge></header><div className="mx-auto max-w-7xl p-5 md:p-8">{children}</div></main>
    <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t bg-white p-2 md:hidden">{navigation.map(([to, label, Icon]) => <NavLink key={to} to={to} className={({ isActive }) => `grid place-items-center gap-1 text-[10px] ${isActive ? "text-sky-700" : "text-slate-500"}`}><Icon className="h-4 w-4" />{label}</NavLink>)}</nav>
  </div>;
}

function Stat({ label, value, icon: Icon }) {
  return <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><Icon className="h-7 w-7 text-sky-600" /></CardContent></Card>;
}

function Dashboard({ state, update }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const open = state.audits.filter((audit) => audit.status === "in-progress");
  const closed = state.audits.filter((audit) => audit.status === "completed");
  const scans = state.audits.reduce((count, audit) => count + audit.scans.length, 0);
  const progress = (audit) => audit.items.length ? Math.round((new Set(audit.scans.filter((scan) => audit.items.some((item) => item.sku === scan.sku)).map((scan) => scan.sku)).size / audit.items.length) * 100) : 0;
  return <div className="space-y-8">
    <div><h2 className="text-2xl font-bold">Audit dashboard</h2><p className="mt-1 text-slate-500">Pick up where you left off or review completed work.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Audits completed" value={closed.length} icon={CheckCircle2} /><Stat label="In progress" value={open.length} icon={ClipboardList} /><Stat label="Reference SKUs" value={state.inventory.length.toLocaleString()} icon={PackageSearch} /><Stat label="Scans recorded" value={scans.toLocaleString()} icon={MapPin} /></div>
    <section><div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-semibold">Recent audits</h3><p className="text-sm text-slate-500">Select an audit to continue in the workspace.</p></div><Button onClick={() => navigate("/audits/new")}><Plus className="h-4 w-4" />New audit</Button></div>
    <div className="grid gap-4 lg:grid-cols-2">{open.length ? open.map((audit) => <Card key={audit.id} className={selected === audit.id ? "border-sky-500 ring-2 ring-sky-100" : ""}><CardHeader><div className="flex items-start justify-between"><div><Badge variant="warning">In progress</Badge><CardTitle className="mt-3">{audit.name}</CardTitle><CardDescription>{audit.category}</CardDescription></div><span className="text-lg font-bold text-sky-700">{progress(audit)}%</span></div></CardHeader><CardContent><div className="mb-4 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-sky-600" style={{ width: `${progress(audit)}%` }} /></div><div className="flex justify-between text-xs text-slate-500"><span>{audit.items.length} reference SKUs</span><span>{audit.completedLocations.length} locations</span></div><div className="mt-5 flex gap-2"><Button variant="outline" onClick={() => setSelected(audit.id)}>{selected === audit.id ? "Selected" : "Select audit"}</Button>{selected === audit.id && <Button onClick={() => navigate(`/workspace/${audit.id}`)}>Start audit</Button>}</div></CardContent></Card>) : <EmptyState title="No open audits" detail="Import inventory and build an audit to get started." />}</div></section>
    <section><h3 className="mb-4 text-lg font-semibold">Closed audits</h3><div className="grid gap-4 lg:grid-cols-2">{closed.length ? closed.map((audit) => <Card key={audit.id}><CardHeader><Badge variant="success">Closed</Badge><CardTitle className="mt-3">{audit.name}</CardTitle><CardDescription>{audit.category} · Closed {formatDate(audit.completedAt)}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => navigate(`/workspace/${audit.id}`)}>View snapshot</Button></CardContent></Card>) : <EmptyState title="No closed audits yet" detail="Completed audits will be archived here." />}</div></section>
  </div>;
}

function EmptyState({ title, detail }) { return <Card className="border-dashed"><CardContent className="p-8 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></CardContent></Card>; }

function AuditBuilder({ state, update }) {
  const navigate = useNavigate(); const fileRef = useRef(); const [name, setName] = useState(""); const [search, setSearch] = useState(""); const [chosen, setChosen] = useState([]);
  const categories = useMemo(() => Object.entries(state.inventory.reduce((groups, item) => { const key = item.category || "(BLANK)"; (groups[key] ??= []).push(item); return groups; }, {})).filter(([category]) => category.toLowerCase().includes(search.toLowerCase())), [state.inventory, search]);
  const importFile = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const inventory = rows.map((row, index) => {
      const get = (...names) => names.map((name) => Object.entries(row).find(([key]) => key.toLowerCase().replace(/[_-]/g, " ").includes(name))?.[1]).find((value) => value !== undefined) ?? "";
      return { id: `row-${index}`, sku: String(get("upc", "sku", "barcode")).trim(), description: String(get("description", "product name")).trim(), style: String(get("style", "clu")).trim(), quantity: Number(get("on hand", "quantity", "qty")) || 0, category: String(get("case code", "category")).trim() };
    }).filter((item) => item.sku);
    update((current) => ({ ...current, inventory, sourceName: file.name }));
  };
  const createAudits = () => { const now = new Date().toISOString(); update((current) => ({ ...current, audits: [...chosen.map((category, index) => ({ id: `audit-${Date.now()}-${index}`, name: name || `${category} audit`, category, items: current.inventory.filter((item) => (item.category || "(BLANK)") === category), scans: [], completedLocations: [], status: "in-progress", createdAt: now, completedAt: null })), ...current.audits] })); navigate("/dashboard"); };
  return <div className="space-y-6"><div><h2 className="text-2xl font-bold">Build an audit</h2><p className="mt-1 text-slate-500">Import a workbook and choose the categories to audit.</p></div>
    {!state.inventory.length ? <Card><CardContent className="grid min-h-64 place-items-center p-8 text-center"><div><FileUp className="mx-auto h-10 w-10 text-sky-600" /><h3 className="mt-4 font-semibold">No workbook loaded yet</h3><p className="mt-1 max-w-md text-sm text-slate-500">Import your inventory workbook to automatically group items by case code or category.</p><Button className="mt-5" onClick={() => fileRef.current.click()}>Import workbook</Button><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} /></div></CardContent></Card> : <Card><CardHeader><CardTitle>Choose categories</CardTitle><CardDescription>{state.inventory.length.toLocaleString()} inventory rows loaded from {state.sourceName}.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional shared audit name" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter categories..." /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map(([category, items]) => <button key={category} onClick={() => setChosen((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category])} className={`rounded-lg border p-4 text-left transition ${chosen.includes(category) ? "border-sky-600 bg-sky-50" : "border-slate-200 hover:border-slate-400"}`}><p className="font-semibold">{category}</p><p className="mt-1 text-sm text-slate-500">{items.length} rows · {items.reduce((sum, item) => sum + item.quantity, 0)} units</p></button>)}</div><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{chosen.length ? `${chosen.length} categories selected` : "Select one or more categories."}</p><Button disabled={!chosen.length} onClick={createAudits}>Create selected audits</Button></div></CardContent></Card>}</div>;
}

function Workspace({ state, update }) {
  const { id } = useParams(); const audit = state.audits.find((item) => item.id === id) ?? state.audits.find((item) => item.status === "in-progress");
  const [locationName, setLocationName] = useState(""); const [sku, setSku] = useState(""); const [initials, setInitials] = useState(""); const [quantity, setQuantity] = useState(1);
  if (!audit) return <EmptyState title="No audit selected" detail="Start an audit from the dashboard to begin scanning." />;
  const isClosed = audit.status === "completed";
  const progress = audit.items.length ? Math.round((new Set(audit.scans.filter((scan) => audit.items.some((item) => item.sku === scan.sku)).map((scan) => scan.sku)).size / audit.items.length) * 100) : 0;
  const addScan = () => { if (!locationName || !sku.trim()) return; const reference = audit.items.find((item) => identifiersMatch(item.sku, sku) || identifiersMatch(item.style, sku)); update((current) => ({ ...current, audits: current.audits.map((candidate) => candidate.id !== audit.id ? candidate : { ...candidate, scans: [...candidate.scans, { id: crypto.randomUUID(), sku: reference?.sku ?? sku, description: reference?.description ?? "", style: reference?.style ?? "", expected: reference?.quantity ?? null, qty: Number(quantity), location: locationName, initials, result: reference ? "Match" : "Not in audit", timestamp: new Date().toISOString() }] }) })); setSku(""); };
  const columns = [{ accessorKey: "sku", header: "SKU" }, { accessorKey: "description", header: "Description" }, { accessorKey: "style", header: "Style" }, { accessorKey: "expected", header: "Expected" }, { accessorKey: "qty", header: "Scanned" }, { accessorKey: "location", header: "Location" }, { accessorKey: "initials", header: "Initials" }, { accessorKey: "result", header: "Result", cell: ({ getValue }) => <Badge variant={getValue() === "Match" ? "success" : "warning"}>{getValue()}</Badge> }];
  const completeSection = () => {
    if (!locationName || !audit.scans.some((scan) => scan.location === locationName)) return;
    update((current) => ({ ...current, audits: current.audits.map((candidate) => candidate.id === audit.id ? { ...candidate, completedLocations: [...new Set([...candidate.completedLocations, locationName])] } : candidate) }));
  };
  const complete = () => update((current) => ({ ...current, audits: current.audits.map((candidate) => candidate.id === audit.id ? { ...candidate, status: "completed", completedAt: new Date().toISOString() } : candidate) }));
  return <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><Badge variant={isClosed ? "success" : "warning"}>{isClosed ? "Audit closed" : "Audit in progress"}</Badge><h2 className="mt-3 text-2xl font-bold">{audit.name}</h2><p className="mt-1 text-slate-500">{audit.category} · {audit.items.length} reference SKUs</p></div>{!isClosed && <Button onClick={complete}>Complete audit</Button>}</div>
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]"><div className="space-y-5"><Card><CardHeader><CardTitle>Scan items</CardTitle><CardDescription>Select a location and scan or enter an SKU.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-4"><select className="h-10 rounded-md border border-slate-300 px-3 text-sm" disabled={isClosed} value={locationName} onChange={(event) => setLocationName(event.target.value)}><option value="">Select a location...</option>{state.locations.map((value) => <option key={value}>{value}</option>)}</select><Input disabled={isClosed} value={sku} onChange={(event) => setSku(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addScan()} placeholder="Scan or type SKU" /><Input disabled={isClosed} min="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><Button disabled={isClosed || !locationName || !sku.trim()} onClick={addScan}>Add SKU</Button></div><div className="mt-3 flex flex-wrap gap-3"><Input className="max-w-xs" disabled={isClosed} value={initials} onChange={(event) => setInitials(event.target.value)} placeholder="Associate initials" /><Button variant="outline" disabled={isClosed || !locationName || !audit.scans.some((scan) => scan.location === locationName)} onClick={completeSection}>Complete section</Button></div></CardContent></Card><Card><CardHeader><CardTitle>Scan log</CardTitle></CardHeader><CardContent><DataTable columns={columns} data={audit.scans} searchPlaceholder="Search scanned items..." /></CardContent></Card></div>
      <div className="space-y-5"><Card className="bg-slate-900 text-white"><CardContent className="p-5"><p className="text-sm text-slate-300">Audit progress</p><p className="mt-2 text-4xl font-bold">{progress}%</p><div className="mt-4 h-2 overflow-hidden rounded bg-slate-700"><div className="h-full bg-sky-400" style={{ width: `${progress}%` }} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><span>{audit.items.length} reference</span><span>{new Set(audit.scans.map((scan) => scan.sku)).size} checked</span></div></CardContent></Card><Card><CardHeader><CardTitle>Completed sections</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-500">{audit.completedLocations.length ? audit.completedLocations.join(", ") : "No sections completed yet."}</p></CardContent></Card></div></div></div>;
}

function Calendar({ state }) {
  const scheduled = state.audits.filter((audit) => audit.status !== "completed");
  const columns = [{ accessorKey: "name", header: "Audit" }, { accessorKey: "category", header: "Category" }, { accessorKey: "createdAt", header: "Created", cell: ({ getValue }) => formatDate(getValue()) }, { accessorKey: "status", header: "Status", cell: ({ getValue }) => <Badge variant={getValue() === "completed" ? "success" : "warning"}>{getValue()}</Badge> }];
  return <div className="space-y-6"><div><h2 className="text-2xl font-bold">Audit calendar</h2><p className="mt-1 text-slate-500">Review scheduled and completed audit activity.</p></div><Card><CardHeader><CardTitle>Scheduled audits to complete</CardTitle><CardDescription>{scheduled.length} audits currently in progress.</CardDescription></CardHeader><CardContent><DataTable columns={columns} data={state.audits} searchPlaceholder="Search audits..." /></CardContent></Card></div>;
}

function SettingsPage({ state, update }) {
  const [newLocation, setNewLocation] = useState("");
  const add = () => { if (!newLocation.trim() || state.locations.includes(newLocation.trim())) return; update((current) => ({ ...current, locations: [...current.locations, newLocation.trim()] })); setNewLocation(""); };
  return <div className="space-y-6"><div><h2 className="text-2xl font-bold">Settings</h2><p className="mt-1 text-slate-500">Manage audit workspace preferences.</p></div><Card><CardHeader><CardTitle>Audit locations</CardTitle><CardDescription>Locations appear in the audit workspace.</CardDescription></CardHeader><CardContent><div className="flex max-w-md gap-2"><Input value={newLocation} onChange={(event) => setNewLocation(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="Add location or bin name" /><Button onClick={add}>Add</Button></div><div className="mt-5 divide-y">{state.locations.map((location) => <div key={location} className="flex items-center justify-between py-3 text-sm"><span>{location}</span><Button variant="ghost" size="icon" aria-label={`Remove ${location}`} onClick={() => update((current) => ({ ...current, locations: current.locations.filter((value) => value !== location) }))}><Trash2 className="h-4 w-4 text-rose-600" /></Button></div>)}</div></CardContent></Card></div>;
}

export default function App() {
  const [state, update] = useAuditState();
  return <AppShell state={state}><Routes><Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<Dashboard state={state} update={update} />} /><Route path="/audits/new" element={<AuditBuilder state={state} update={update} />} /><Route path="/workspace" element={<Workspace state={state} update={update} />} /><Route path="/workspace/:id" element={<Workspace state={state} update={update} />} /><Route path="/calendar" element={<Calendar state={state} />} /><Route path="/settings" element={<SettingsPage state={state} update={update} />} /></Routes></AppShell>;
}
