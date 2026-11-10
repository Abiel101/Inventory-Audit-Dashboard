import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, FileSpreadsheet, Search, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { OMNI, REFERENCE, buildIndex, lookup, readSourceFile } from "@/lib/research-sources";
import { auditTally, cn } from "@/lib/utils";

const monthLabel = (value) => value ? new Date(`${value}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—";
const isActive = (source) => source.active !== false;

export function SourcesPanel({ state, update }) {
  const toast = useToast();
  const omniInput = useRef(null);
  const pastInput = useRef(null);
  const [busy, setBusy] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [previewId, setPreviewId] = useState(null);
  const [filter, setFilter] = useState("");
  const sources = state.researchSources ?? [];
  const setSources = (next) => update((current) => ({ ...current, researchSources: next(current.researchSources ?? []) }));

  const upload = async (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(kind);
    try {
      const source = await readSourceFile(file, kind, month);
      setSources((list) => [source, ...list]);
      toast(kind === OMNI ? `Omni Channel file added: kept ${source.rows.length} of ${source.totalRows} rows` : `Added ${file.name} (${source.rows.length} rows)`, { variant: "success" });
    } catch (error) {
      toast(error.message || "Could not read that file", { variant: "error" });
    } finally { setBusy(""); }
  };

  const preview = sources.find((source) => source.id === previewId);
  const previewRows = useMemo(() => {
    if (!preview) return [];
    const needle = filter.trim().toLowerCase();
    return (needle ? preview.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(needle))) : preview.rows).slice(0, 100);
  }, [preview, filter]);

  return <Card>
    <CardHeader className="pb-2"><CardTitle className="text-base">Sources</CardTitle><CardDescription>Add the files research is checked against. Checked sources are cross-referenced when you begin research.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="font-semibold">Omni Channel File</p>
          <p className="mt-1 text-xs text-slate-500">Automatically keeps only rows that involve Dallas, Store 08, Store 8 or x08 (even if the row lists other stores too).</p>
          <input ref={omniInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => upload(event, OMNI)} />
          <Button className="mt-3" size="sm" disabled={busy === OMNI} onClick={() => omniInput.current?.click()}><Upload className="h-3.5 w-3.5" />{busy === OMNI ? "Filtering…" : "Upload Omni Channel file"}</Button>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="font-semibold">Past month file</p>
          <p className="mt-1 text-xs text-slate-500">Upload a file from a previous month to cross-reference. Already uploaded files are listed below to turn on or off.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input type="month" aria-label="File month" className="h-8 w-40 text-xs" value={month} onChange={(event) => setMonth(event.target.value)} />
            <input ref={pastInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => upload(event, REFERENCE)} />
            <Button size="sm" variant="outline" disabled={busy === REFERENCE} onClick={() => pastInput.current?.click()}><Upload className="h-3.5 w-3.5" />{busy === REFERENCE ? "Reading…" : "Upload file"}</Button>
          </div>
        </div>
      </div>

      {sources.length ? <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
        {sources.map((source) => <div key={source.id} className="flex flex-wrap items-center gap-3 p-3">
          <input type="checkbox" className="h-4 w-4 accent-sky-600" aria-label={`Use ${source.name} for cross-reference`} checked={isActive(source)} onChange={() => setSources((list) => list.map((item) => item.id === source.id ? { ...item, active: !isActive(item) } : item))} />
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{source.name}</p><p className="text-xs text-slate-500">{monthLabel(source.month)} · {source.rows.length.toLocaleString()} rows{source.kind === OMNI ? ` kept of ${source.totalRows.toLocaleString()}` : ""}</p></div>
          <Badge variant={source.kind === OMNI ? "warning" : "secondary"}>{source.kind === OMNI ? "Omni Channel · Dallas/08" : "Past month"}</Badge>
          <Button size="sm" variant="ghost" aria-label={`Preview ${source.name}`} onClick={() => { setPreviewId(previewId === source.id ? null : source.id); setFilter(""); }}>{previewId === source.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
          <Button size="sm" variant="ghost" aria-label={`Remove ${source.name}`} onClick={() => { setSources((list) => list.filter((item) => item.id !== source.id)); if (previewId === source.id) setPreviewId(null); }}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
        </div>)}
      </div> : <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No sources yet. Add an Omni Channel file or a file from a past month.</p>}

      {preview && <div className="space-y-2">
        <div className="relative max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input className="h-9 pl-8 text-xs" placeholder="Filter rows…" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 text-xs">
          <table className="w-full"><thead className="sticky top-0 bg-slate-100"><tr>{preview.headers.map((header, index) => <th key={index} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{header}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-200">{previewRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className="whitespace-nowrap px-2 py-1">{cell}</td>)}</tr>)}</tbody></table>
        </div>
        <p className="text-xs text-slate-500">Showing up to 100 rows.</p>
      </div>}
    </CardContent>
  </Card>;
}

export function CrossReference({ audit, state }) {
  const [query, setQuery] = useState("");
  const sources = (state.researchSources ?? []).filter(isActive);
  const index = useMemo(() => buildIndex(sources), [sources]);
  const { expected, scanned, extra } = useMemo(() => auditTally(audit), [audit]);
  const describe = (sku) => audit.items.find((item) => item.sku === sku)?.description ?? "";
  const rows = [
    ...[...expected].filter(([sku, qty]) => (scanned.get(sku) ?? 0) < qty).map(([sku, qty]) => ({ sku, note: `Missing ${qty - (scanned.get(sku) ?? 0)} of ${qty}`, tone: "warning" })),
    ...[...extra.keys()].map((sku) => ({ sku, note: "Scanned, not in audit", tone: "destructive" })),
  ];
  const needle = query.trim().toLowerCase();
  const shown = needle ? rows.filter((row) => row.sku.toLowerCase().includes(needle) || describe(row.sku).toLowerCase().includes(needle)) : rows;
  const manual = needle ? lookup(index, needle) : [];

  const matchLine = ({ source, rowIndex }) => <div key={`${source.id}-${rowIndex}`} className="rounded-md bg-slate-100 px-2 py-1 text-xs">
    <span className="font-semibold">{source.kind === OMNI ? "Omni Channel" : monthLabel(source.month)} · {source.name}:</span>{" "}
    {source.headers.map((header, index) => source.rows[rowIndex][index] ? `${header}: ${source.rows[rowIndex][index]}` : null).filter(Boolean).join(" · ")}
  </div>;

  return <Card>
    <CardHeader className="pb-2"><CardTitle className="text-base">Cross-reference</CardTitle><CardDescription>Missing and not-in-audit items checked against {sources.length ? `${sources.length} selected source${sources.length === 1 ? "" : "s"}` : "your sources"}. Search any SKU to look it up directly.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-8" placeholder="Search SKU or description…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {!sources.length && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No sources are selected. Add or check sources on the Research page.</p>}
      {manual.length > 0 && <div className="space-y-1"><p className="text-sm font-semibold">Matches for “{query.trim()}”</p>{manual.slice(0, 10).map(matchLine)}</div>}
      {sources.length > 0 && <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
        {shown.length ? shown.slice(0, 200).map(({ sku, note, tone }) => { const hits = lookup(index, sku); return <div key={`${sku}-${note}`} className="space-y-1 p-3">
          <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{sku}</b><span className="min-w-0 flex-1 truncate text-xs text-slate-500">{describe(sku)}</span><Badge variant={tone}>{note}</Badge><Badge variant={hits.length ? "success" : "secondary"}>{hits.length ? `${hits.length} source match${hits.length === 1 ? "" : "es"}` : "No match"}</Badge></div>
          {hits.slice(0, 3).map(matchLine)}
        </div>; }) : <p className={cn("p-4 text-center text-sm text-slate-500")}>Nothing to cross-reference — no missing or extra items.</p>}
      </div>}
    </CardContent>
  </Card>;
}
