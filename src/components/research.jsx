import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FlaskConical, Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CrossReference, SourcesPanel } from "@/components/research-sources";
import { auditProgress, auditTally } from "@/lib/utils";

const stamp = (value) => value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export function Research({ state, update }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queue = state.audits.filter((audit) => audit.research);
  const setResearch = (auditId, research) => update((current) => ({ ...current, audits: current.audits.map((audit) => audit.id === auditId ? { ...audit, research } : audit) }));
  const begin = (audit) => { if (audit.research !== "active") setResearch(audit.id, "active"); navigate(`/research/${audit.id}`); };
  const remove = (audit) => { setResearch(audit.id, undefined); if (id === audit.id) navigate("/research"); };

  const selected = id ? queue.find((audit) => audit.id === id) : null;
  if (selected?.research === "active") {
    const { expected, scanned, extra } = auditTally(selected);
    const sum = (map) => [...map.values()].reduce((total, value) => total + value, 0);
    const stats = [["Progress", `${auditProgress(selected)}%`], ["SKUs", expected.size], ["Units expected", sum(expected)], ["Units scanned", sum(scanned)], ["Scans not in audit", sum(extra)]];
    return <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Badge variant="warning">Research in progress</Badge><h2 className="mt-1 text-xl font-bold uppercase">{selected.name}</h2><p className="text-sm text-slate-500">{String(selected.category).toUpperCase()} · closed {stamp(selected.completedAt)}</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => navigate("/research")}><ArrowLeft className="h-4 w-4" />All research</Button><Button variant="outline" onClick={() => remove(selected)}><Trash2 className="h-4 w-4" />Remove from research</Button></div>
      </div>
      <div className="grid gap-3 rounded-lg bg-slate-900 p-4 text-white sm:grid-cols-3 lg:grid-cols-5">{stats.map(([label, value]) => <div key={label}><p className="text-xs text-slate-300">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div>
      <CrossReference audit={selected} state={state} />
    </div>;
  }

  return <div className="space-y-6">
    <p className="text-slate-500">Audits added for research appear here. Begin research to open a dedicated workspace for finding issues.</p>
    <SourcesPanel state={state} update={update} />
    {!queue.length ? <Card className="border-dashed"><CardContent className="p-8 text-center"><FlaskConical className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-2 font-semibold">Nothing to research yet</p><p className="mt-1 text-sm text-slate-500">Use “Add to research” on a completed audit in Monthly status.</p></CardContent></Card>
      : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{queue.map((audit) => <Card key={audit.id}>
        <CardHeader className="pb-2"><div className="flex items-start justify-between gap-2"><CardTitle className="truncate text-base uppercase">{audit.name}</CardTitle><Badge variant={audit.research === "active" ? "warning" : "secondary"}>{audit.research === "active" ? "In research" : "Queued"}</Badge></div><CardDescription>{String(audit.category).toUpperCase()} · closed {stamp(audit.completedAt)} · {auditProgress(audit)}% scanned</CardDescription></CardHeader>
        <CardContent className="flex gap-2"><Button size="sm" onClick={() => begin(audit)}><Play className="h-3.5 w-3.5" />{audit.research === "active" ? "Continue research" : "Begin research"}</Button><Button size="sm" variant="ghost" aria-label={`Remove ${audit.name} from research`} onClick={() => remove(audit)}><Trash2 className="h-4 w-4 text-rose-600" /></Button></CardContent>
      </Card>)}</div>}
  </div>;
}
