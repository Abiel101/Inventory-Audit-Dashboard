import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { auditProgress, auditTally } from "@/lib/utils";

const dateTime = (value) => value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const sum = (values) => [...values].reduce((total, value) => total + value, 0);

function Stat({ label, value, tone }) {
  return <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><p className={`text-xl font-bold ${tone ?? ""}`}>{value}</p></div>;
}

export function AuditPreview({ audit, onClose }) {
  const navigate = useNavigate();
  if (!audit) return null;
  const tally = auditTally(audit);
  const progress = auditProgress(audit);
  const expectedUnits = sum(tally.expected.values());
  const foundUnits = [...tally.expected].reduce((total, [sku, qty]) => total + Math.min(qty, tally.scanned.get(sku) ?? 0), 0);
  const scannedUnits = sum(tally.scanned.values());
  const notInAudit = sum(tally.extra.values());
  const skusFound = [...tally.expected].filter(([sku, qty]) => (tally.scanned.get(sku) ?? 0) >= qty).length;
  const over = [...tally.expected].filter(([sku, qty]) => (tally.scanned.get(sku) ?? 0) > qty).length;
  const locations = [...audit.scans.reduce((map, scan) => map.set(scan.location, (map.get(scan.location) ?? 0) + (Number(scan.qty) || 0)), new Map())];
  const done = audit.completedLocations ?? [];
  const recent = audit.scans.slice(-5).reverse();
  const phase = audit.phase === "running" ? "Scanning now" : audit.scans.length ? "Progress saved" : "Not started scanning";
  const noteCount = Object.values(audit.itemNotes ?? {}).filter(Boolean).length;

  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent side="right" className="w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl">
      <div className="pr-8"><Badge variant="warning">In progress · {phase}</Badge><SheetTitle className="mt-2 text-lg font-bold uppercase">{audit.name}</SheetTitle>
        <SheetDescription className="text-xs text-slate-500"><span className="uppercase">{audit.category}</span>{audit.initials ? ` · Associate ${audit.initials}` : ""} · Started {dateTime(audit.startedAt || audit.createdAt)}</SheetDescription></div>

      <div className="mt-5"><div className="flex items-baseline justify-between"><span className="text-3xl font-bold">{progress}%</span><span className="text-sm text-slate-500">{foundUnits} of {expectedUnits} expected units found</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded bg-slate-200"><div className="h-full bg-sky-500" style={{ width: `${progress}%` }} /></div></div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Units scanned" value={scannedUnits + notInAudit} />
        <Stat label="Units remaining" value={Math.max(expectedUnits - foundUnits, 0)} />
        <Stat label="SKUs complete" value={`${skusFound} / ${tally.expected.size}`} />
        <Stat label="Not in audit" value={notInAudit} tone={notInAudit ? "text-rose-600" : ""} />
        <Stat label="Over-scanned SKUs" value={over} tone={over ? "text-amber-600" : ""} />
        <Stat label="Notes" value={noteCount} />
      </div>

      <h4 className="mt-6 text-sm font-semibold">Locations ({done.length} of {locations.length} completed)</h4>
      <div className="mt-1 divide-y divide-slate-200 text-sm">{locations.length ? locations.map(([name, units]) => <div key={name} className="flex items-center justify-between gap-2 py-2"><span>{name}</span><span className="flex items-center gap-2 text-slate-500">{units} units{done.includes(name) ? <Badge variant="success">Done</Badge> : <Badge variant="secondary">Open</Badge>}</span></div>) : <p className="py-2 text-slate-500">No locations scanned yet.</p>}</div>

      <h4 className="mt-6 text-sm font-semibold">Latest scans</h4>
      <div className="mt-1 divide-y divide-slate-200 text-sm">{recent.length ? recent.map((scan) => <div key={scan.id} className="py-2"><div className="flex justify-between gap-2"><b className="truncate">{scan.sku}</b><span className="shrink-0 text-xs text-slate-500">{dateTime(scan.timestamp)}</span></div><p className="truncate text-xs text-slate-500">{scan.location}{scan.description ? ` · ${scan.description}` : ""}</p></div>) : <p className="py-2 text-slate-500">No scans yet.</p>}</div>

      <p className="mt-6 text-xs text-slate-500">Inventory snapshot: {audit.snapshot?.sourceName || "inventory source"} · {dateTime(audit.snapshot?.takenAt || audit.createdAt)}{audit.scheduledDate ? ` · Scheduled ${audit.scheduledDate}` : ""}</p>

      <div className="mt-6 flex gap-2"><Button className="flex-1" onClick={() => { onClose(); navigate(`/workspace/${audit.id}`); }}><Play className="h-4 w-4" />Continue audit</Button><Button variant="outline" onClick={onClose}>Close</Button></div>
    </SheetContent>
  </Sheet>;
}
