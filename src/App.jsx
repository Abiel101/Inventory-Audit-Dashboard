import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, CheckCircle2, ClipboardList, FileUp, FlaskConical, LayoutDashboard, MapPin, Info, ListChecks, PackageSearch, Plus, Search, Settings, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { TransitionProvider } from "@/components/ui/transition";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table";
import { formatDate, identifiersMatch, defaultLocations, themes, applyTheme, getSavedTheme } from "@/lib/utils";
import { AuditCalendar } from "@/components/audit-calendar";
import { Dashboard } from "@/components/dashboard";
import { KnownIssues } from "@/components/known-issues";
import { MonthStatus } from "@/components/month-status";
import { AnimatedTabs } from "@/components/ui/animated-tabs";
import { Research } from "@/components/research";
import { AuditWorkspace } from "@/components/audit-workspace";
import { buildAudit, groupCodes, readInventoryFile, sourceAge } from "@/lib/inventory";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

const legacyLocations = ["100", "101", "102", "200", "201", "300", "301", "Understock 1", "Vault Holds"];
const navigation = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/audits/new", "Build an audit", Plus],
  ["/workspace", "Audit workspace", ClipboardList],
  ["/calendar", "Calendar", CalendarDays],
  ["/status", "Monthly status", ListChecks],
  ["/research", "Research", FlaskConical],
  ["/settings", "Settings", Settings],
];
const pageTitles = { "/dashboard": "Audit dashboard", "/audits/new": "Build an audit", "/workspace": "Audit workspace", "/calendar": "Audit calendar", "/status": "Monthly status", "/research": "Research", "/settings": "Settings" };
const pageTitle = (pathname) => pageTitles[Object.keys(pageTitles).find((path) => pathname === path || pathname.startsWith(`${path}/`))] ?? "Inventory Audit";
const storageKey = "inventory-audit-react-state";
const initialState = { inventory: [], audits: [], locations: defaultLocations, sourceName: "", mapping: {} };

function useAuditState() {
  const [state, setState] = useState(() => {
    try {
      const saved = { ...initialState, ...JSON.parse(localStorage.getItem(storageKey)) };
      const isLegacyList = saved.locations.length === legacyLocations.length && legacyLocations.every((value, index) => saved.locations[index] === value);
      if (isLegacyList) return { ...saved, locations: defaultLocations };
      if (!saved.bopisAdded) return { ...saved, bopisAdded: true, locations: saved.locations.some((value) => value.toLowerCase() === "bopis") ? saved.locations : [...saved.locations, "BOPIS"] };
      return saved;
    } catch { return initialState; }
  });
  const stateRef = useRef(state);
  const [storageError, setStorageError] = useState(false);
  const update = (callback) => {
    const next = callback(stateRef.current);
    stateRef.current = next;
    setState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  return [state, update, storageError];
}

function SourceBadge({ state }) {
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick((value) => value + 1), 60000); return () => clearInterval(timer); }, []);
  if (!state.sourceName) return <Badge variant="secondary">No source loaded</Badge>;
  const age = sourceAge(state);
  const variant = { fresh: "success", aging: "warning", stale: "destructive", unknown: "secondary" }[age.tone];
  const when = age.days === 0 ? "today" : age.days === 1 ? "1 day old" : age.days > 1 ? `${age.days} days old` : "";
  const detail = [age.time && `uploaded ${age.time}`, when].filter(Boolean).join(" · ");
  const hover = [`File: ${state.sourceName}`, state.sourceModifiedAt && `File saved: ${new Date(state.sourceModifiedAt).toLocaleString()}`, state.sourceUploadedAt && `Uploaded: ${new Date(state.sourceUploadedAt).toLocaleString()}`, age.tone === "fresh" ? "Re-upload if inventory may have changed since this time." : age.tone === "unknown" ? "No date found for this source." : "Source is out of date. Upload a fresh file."].filter(Boolean).join("\n");
  return <Badge variant={variant} className="max-w-[55vw] truncate" title={hover}>Source: {state.sourceName}{detail ? ` · ${detail}` : ""}</Badge>;
}

// Keeps the sidebar closed on tablet-sized and portrait screens (e.g. iPad) so content gets the full width.
function CollapseOnTablet() {
  const { setOpen } = useSidebar();
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const collapse = () => query.matches && setOpen(false);
    query.addEventListener("change", collapse);
    return () => query.removeEventListener("change", collapse);
  }, []);
  return null;
}

function AppShell({ state, update, storageError, children }) {
  const { pathname } = useLocation();
  return <SidebarProvider defaultOpen={false} className="h-svh overflow-hidden">
    <CollapseOnTablet />
    <AppSidebar state={state} update={update} />
    <SidebarInset className="min-w-0 overflow-y-auto overflow-x-hidden bg-slate-50 [scrollbar-gutter:stable]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <SidebarTrigger className="h-6 w-6 [&_svg]:size-3.5" />
        <div className="min-w-0 flex-1"><h1 id="page-title" tabIndex={-1} className="truncate text-xl font-bold">{pageTitle(pathname)}</h1></div>
        <SourceBadge state={state} />
      </header>
      {storageError && <p role="alert" className="border-b border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">The latest changes could not be saved in this browser (storage may be full). They will be lost when this tab closes; export any needed audits and free browser storage before continuing.</p>}
      <div key={pathname} className="mx-auto w-full min-w-0 max-w-7xl p-3 sm:p-4 lg:p-8">{children}</div>
    </SidebarInset>
  </SidebarProvider>;
}

function AppSidebar({ state, update }) {
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const toast = useToast();
  const fileRef = useRef(null);
  const importSource = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      const { inventory, ...source } = await readInventoryFile(file);
      update((current) => ({ ...current, inventory, ...source }));
      toast(`Source updated from ${source.sourceName}. Started audits keep their own snapshot.`, { variant: "success" });
    } catch (error) {
      toast(error.message || "Could not read this inventory file. The current source was not changed.", { variant: "error", duration: 6000 });
    }
  };
  return <Sidebar collapsible="icon">
    <SidebarHeader><div className="flex items-center gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-600 text-sm font-bold text-white">IA</div><div className="min-w-0 group-data-[collapsible=icon]:hidden"><strong className="block truncate text-sm tracking-wide">INVENTORY AUDIT</strong><p className="truncate text-xs text-slate-500">Store operations</p></div></div></SidebarHeader>
    <SidebarContent className="overflow-hidden">
      <SidebarGroup><SidebarGroupLabel>Navigate</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{navigation.map(([to, label, Icon]) => <SidebarMenuItem key={to}><SidebarMenuButton asChild tooltip={label} isActive={pathname === to || pathname.startsWith(`${to}/`)}><NavLink to={to} onClick={() => isMobile && setOpenMobile(false)}><Icon /><span>{label}</span></NavLink></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>
      <SidebarGroup><SidebarGroupLabel>Inventory source</SidebarGroupLabel><SidebarGroupContent><SidebarMenu><SidebarMenuItem>
        <SidebarMenuButton tooltip="Upload DY inventory by location" onClick={() => fileRef.current?.click()}><FileUp /><span>Upload inventory</span></SidebarMenuButton>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Upload inventory by location file" onChange={importSource} />
      </SidebarMenuItem></SidebarMenu>
      <p className="truncate px-2 pt-1 text-xs text-slate-500 group-data-[collapsible=icon]:hidden" title={state.sourceName}>{state.sourceName ? `${state.inventory.length.toLocaleString()} rows · ${state.sourceName}` : "No source loaded"}</p></SidebarGroupContent></SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="group-data-[collapsible=icon]:hidden"><p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><b className="block text-slate-800">iPad-ready workflow</b>Import, build an audit, scan by location, then export results.</p></SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}
function EmptyState({ title, detail }) { return <Card className="border-dashed"><CardContent className="p-8 text-center"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></CardContent></Card>; }

function AuditBuilder({ state, update }) {
  const navigate = useNavigate(); const fileRef = useRef(); const [search, setSearch] = useState(""); const [chosen, setChosen] = useState([]); const [importError, setImportError] = useState("");
  const terms = useMemo(() => search.split(",").map((term) => term.trim().toLowerCase()).filter(Boolean), [search]);
  const categories = useMemo(() => Object.entries(state.inventory.reduce((groups, item) => { const key = item.category || "(BLANK)"; (groups[key] ??= []).push(item); return groups; }, {})).filter(([category]) => !terms.length || terms.some((term) => category.toLowerCase().includes(term))), [state.inventory, terms]);
  const byCategory = useMemo(() => new Map(categories), [categories]);
  const importFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const { inventory, ...source } = await readInventoryFile(file);
      update((current) => ({ ...current, inventory, ...source }));
      setImportError("");
    } catch (error) {
      setImportError(error.message || "Could not read this inventory file.");
    }
  };
  const createAudits = () => { update((current) => ({ ...current, audits: [...chosen.map((category, index) => buildAudit(current.inventory, category, undefined, index, current)), ...current.audits] })); navigate("/dashboard"); };  return <div className="space-y-6"><div><p className="text-slate-500">Import a workbook and choose the categories to audit.</p></div><div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="note"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p><b>Manual redos only.</b> Regular monthly audits are started from Monthly status or the Calendar. Use this page only to redo an audit by hand.</p></div>
    {importError && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{importError}</p>}
    {!state.inventory.length ? <Card><CardContent className="grid min-h-64 place-items-center p-8 text-center"><div><FileUp className="mx-auto h-10 w-10 text-sky-600" /><h3 className="mt-4 font-semibold">No workbook loaded yet</h3><p className="mt-1 max-w-md text-sm text-slate-500">Import your inventory workbook to automatically group items by case code or category.</p><Button className="mt-5" onClick={() => fileRef.current.click()}>Import workbook</Button><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} /></div></CardContent></Card> : <Card><CardHeader><CardTitle>Choose categories</CardTitle><CardDescription>{state.inventory.length.toLocaleString()} inventory rows loaded from {state.sourceName}.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="relative max-w-xl"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9 pr-10" placeholder="Search case codes, e.g. bridal, mens, silver ice" aria-label="Search case codes" /><TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><button type="button" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded text-slate-400 hover:text-slate-700" aria-label="Search tips"><Info className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="bottom" align="end" className="max-w-xs text-xs"><p className="font-semibold">Search tips</p><p>Type part of a case code to filter the list.</p><p>Separate several searches with commas to show them together, e.g. <b>bridal, mens, silver ice</b>.</p></TooltipContent></Tooltip></TooltipProvider></div><div className="space-y-6">{groupCodes(categories.map(([category]) => category)).map(([group, codes]) => <section key={group}><div className="mb-2"><h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group} <span className="font-normal">({codes.length})</span></h4></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{codes.map((category) => { const items = byCategory.get(category); return <button key={category} onClick={() => setChosen((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category])} className={`rounded-lg border p-4 text-left transition ${chosen.includes(category) ? "border-sky-600 bg-sky-50" : "border-slate-200 hover:border-slate-400"}`}><p className="font-semibold uppercase">{category}</p><p className="mt-1 text-sm text-slate-500">{items.length} rows · {items.reduce((sum, item) => sum + item.quantity, 0)} units</p></button>; })}</div></section>)}</div><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{chosen.length ? `${chosen.length} categories selected` : "Select one or more categories."}</p><Button disabled={!chosen.length} onClick={createAudits}>Create selected audits</Button></div></CardContent></Card>}</div>;
}

function Workspace({ state, update }) {
  return <AuditWorkspace state={state} update={update} />;
}

function Calendar({ state, update }) {
  return <AuditCalendar state={state} update={update} />;
}

function SettingsPage({ state, update }) {
  const [newLocation, setNewLocation] = useState("");
  const [theme, setTheme] = useState(getSavedTheme);
  const [message, setMessage] = useState("");
  const [settingsTab, setSettingsTab] = useState("general");
  const add = () => {
    const value = newLocation.trim();
    if (!value) return setMessage("Enter a location name");
    if (state.locations.some((location) => location.toLowerCase() === value.toLowerCase())) return setMessage("That location already exists");
    update((current) => ({ ...current, locations: [...current.locations, value] })); setNewLocation(""); setMessage("Location added");
  };
  const rename = (index) => {
    const value = window.prompt("Rename location", state.locations[index])?.trim();
    if (value) {
      if (state.locations.some((location, position) => position !== index && location.toLowerCase() === value.toLowerCase())) return setMessage("That location already exists");
      update((current) => ({ ...current, locations: current.locations.map((location, position) => position === index ? value : location) }));
      setMessage("Location renamed");
    }
  };
  const remove = (index) => {
    if (window.confirm(`Remove location “${state.locations[index]}” from the dropdown? Existing scan history will be preserved.`)) update((current) => ({ ...current, locations: current.locations.filter((_, position) => position !== index) }));
  };
  return <div className="space-y-6"><div><p className="text-slate-500">Manage audit workspace preferences.</p></div>
    <AnimatedTabs tabs={[["general", "General"], ["issues", "Known issues"]]} value={settingsTab} onChange={setSettingsTab} className="w-64 max-w-full" listClassName="h-9 text-sm" triggerClassName="text-sm" />
    {settingsTab === "issues" ? <KnownIssues state={state} update={update} /> : <>
    <Card><CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Choose a color theme for the dashboard. Your preference is saved on this device.</CardDescription></CardHeader><CardContent><label className="block max-w-xs text-sm font-medium" htmlFor="theme-select">Color theme<select id="theme-select" className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={theme} onChange={(event) => setTheme(applyTheme(event.target.value))}>{themes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></CardContent></Card>
    <Card><CardHeader><CardTitle>Audit locations</CardTitle><CardDescription>{state.locations.length} locations appear in the audit workspace dropdown.</CardDescription></CardHeader><CardContent><div className="flex max-w-md gap-2"><Input value={newLocation} onChange={(event) => setNewLocation(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="Add location or bin name" /><Button onClick={add}>Add</Button></div>{message && <p className="mt-2 text-sm text-slate-500" role="status">{message}</p>}<div className="mt-5 max-h-[32rem] divide-y divide-slate-200 overflow-y-auto">{state.locations.map((location, index) => <div key={location} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span>{location}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => rename(index)}>Rename</Button><Button variant="ghost" size="icon" aria-label={`Remove ${location}`} onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-rose-600" /></Button></div></div>)}</div></CardContent></Card></>}</div>;
}

export default function App() {
  const [state, update, storageError] = useAuditState();
  return <ToastProvider><TransitionProvider><AppShell state={state} update={update} storageError={storageError}><Routes><Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<Dashboard state={state} update={update} />} /><Route path="/audits/new" element={<AuditBuilder state={state} update={update} />} /><Route path="/workspace" element={<Workspace state={state} update={update} />} /><Route path="/workspace/:id" element={<Workspace state={state} update={update} />} /><Route path="/calendar" element={<Calendar state={state} update={update} />} /><Route path="/status" element={<MonthStatus state={state} update={update} />} /><Route path="/research" element={<Research state={state} update={update} />} /><Route path="/research/:id" element={<Research state={state} update={update} />} /><Route path="/settings" element={<SettingsPage state={state} update={update} />} /></Routes></AppShell></TransitionProvider></ToastProvider>;
}
