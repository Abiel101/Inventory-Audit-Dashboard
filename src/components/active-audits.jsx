import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardList, Loader2, Play, StickyNote, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auditProgress, auditTally, cn } from "@/lib/utils";
import { findKnownIssue } from "@/lib/inventory";

const when = (value) => value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

function Detail({ audit, knownIssues, onResume }) {
  const tally = auditTally(audit);
  const progress = auditProgress(audit);
  const expected = [...tally.expected.values()].reduce((sum, value) => sum + value, 0);
  const found = [...tally.expected].reduce((sum, [sku, value]) => sum + Math.min(value, tally.scanned.get(sku) ?? 0), 0);
  const notes = Object.entries(audit.itemNotes ?? {});
  const issues = audit.scans.filter((scan, index, list) => findKnownIssue(knownIssues, scan) && list.findIndex((other) => other.sku === scan.sku) === index);
  const people = [...new Set([audit.initials, ...audit.scans.map((scan) => scan.initials)].filter(Boolean))];
  const last = audit.scans.at(-1);
  const locations = new Set(audit.scans.map((scan) => scan.location));
  return <Card className="lg:sticky lg:top-4">
    <CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><CardTitle className="uppercase">{audit.category || audit.name}</CardTitle><Button size="sm" onClick={onResume}><Play className="h-3.5 w-3.5" />Resume</Button></div></CardHeader>
    <CardContent className="space-y-4 text-sm">
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-600"><span>{found.toLocaleString()} of {expected.toLocaleString()} units found</span><span className="font-semibold">{progress}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-ok" style={{ width: `${progress}%` }} /></div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div><dt className="flex items-center gap-1 text-slate-500"><User className="h-3 w-3" />Working on it</dt><dd className="font-semibold">{people.length ? people.join(", ") : "Not started"}</dd></div>
        <div><dt className="text-slate-500">Started</dt><dd className="font-semibold">{when(audit.startedAt || audit.createdAt)}</dd></div>
        <div><dt className="text-slate-500">Last scan</dt><dd className="font-semibold">{last ? when(last.timestamp) : "No scans yet"}</dd></div>
        <div><dt className="text-slate-500">Sections</dt><dd className="font-semibold">{audit.completedLocations?.length ?? 0} done · {locations.size} used</dd></div>
        <div><dt className="text-slate-500">Scans</dt><dd className="font-semibold">{audit.scans.length.toLocaleString()}</dd></div>
        <div><dt className="text-slate-500">Not in audit</dt><dd className="font-semibold">{tally.extra.size}</dd></div>
      </dl>
      <section><h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-600"><StickyNote className="h-3 w-3" />Notes ({notes.length + (audit.finalNote ? 1 : 0)})</h4>
        {audit.finalNote && <p className="mb-1 rounded bg-slate-100 p-2 text-xs">{audit.finalNote}</p>}
        {notes.length ? <ul className="max-h-40 space-y-1 overflow-y-auto">{notes.map(([sku, text]) => <li key={sku} className="rounded bg-indigo-50 p-2 text-xs"><span className="font-semibold">{sku}</span> — {text}</li>)}</ul> : !audit.finalNote && <p className="text-xs text-slate-500">No notes yet.</p>}
      </section>
      <section><h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-600"><AlertTriangle className="h-3 w-3" />Issues ({issues.length})</h4>
        {issues.length ? <ul className="max-h-40 space-y-1 overflow-y-auto">{issues.map((scan) => { const issue = findKnownIssue(knownIssues, scan); return <li key={scan.sku} className="rounded bg-alert/15 p-2 text-xs"><span className="font-semibold">{scan.sku}</span>{issue.note || issue.description ? ` — ${issue.note || issue.description}` : ""}</li>; })}</ul> : <p className="text-xs text-slate-500">No known issues hit so far.</p>}
      </section>
    </CardContent>
  </Card>;
}

export function ActiveAudits({ state }) {
  const navigate = useNavigate();
  const audits = state.audits.filter((audit) => audit.status !== "completed");
  const [selectedId, setSelectedId] = useState(null);
  const selected = audits.find((audit) => audit.id === selectedId);
  const resume = (audit) => navigate(`/workspace/${audit.id}`);

  if (!audits.length) return <Card className="border-dashed"><CardContent className="p-8 text-center"><p className="font-semibold">No audits in progress</p><p className="mt-1 text-sm text-slate-500">Start an audit from the dashboard or calendar to begin scanning.</p></CardContent></Card>;
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <section>
      <div className="mb-2 flex items-baseline gap-2"><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">In progress</h3><span className="text-sm text-slate-500">({audits.length})</span></div>
      <Card><CardContent className="divide-y divide-slate-200 p-0">
        {audits.map((audit) => <div key={audit.id} role="button" tabIndex={0} aria-pressed={audit.id === selectedId} onClick={() => setSelectedId(audit.id)} onKeyDown={(event) => event.target === event.currentTarget && (event.key === "Enter" || event.key === " ") && setSelectedId(audit.id)} className={cn("flex cursor-pointer flex-wrap items-center gap-3 p-3 hover:bg-slate-50 md:px-4", audit.id === selectedId && "bg-slate-100")}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-warn/25 text-warn-ink"><Loader2 className="h-4 w-4 animate-spin" /></span>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold uppercase">{audit.category || audit.name}</p><p className="text-xs text-slate-500">{auditProgress(audit)}% scanned{audit.initials ? ` · ${audit.initials}` : ""}</p></div>
          <Badge className="border-transparent bg-warn/25 text-warn-ink">In progress</Badge>
          <Button size="sm" onClick={(event) => { event.stopPropagation(); resume(audit); }}>Resume</Button>
        </div>)}
      </CardContent></Card>
    </section>
    {selected ? <Detail audit={selected} knownIssues={state.knownIssues} onResume={() => resume(selected)} /> : <Card className="hidden border-dashed lg:block"><CardContent className="grid place-items-center gap-2 p-8 text-center text-sm text-slate-500"><ClipboardList className="h-6 w-6" />Select an audit to see its progress, who is working on it, notes and issues.</CardContent></Card>}
  </div>;
}
