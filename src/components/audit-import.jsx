import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { importAuditFiles } from "@/lib/import-audit";

export function AuditImport({ state, update }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const run = async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const { audits, locations, results: outcome } = await importAuditFiles(files, state.audits);
    if (audits.length) {
      update((current) => ({
        ...current,
        audits: [...audits, ...current.audits],
        locations: [...current.locations, ...locations.filter((location) => !current.locations.some((known) => known.toLowerCase() === location.toLowerCase()))],
      }));
    }
    setResults(outcome);
    setBusy(false);
  };
  return <Card>
    <CardHeader><CardTitle>Import old audits</CardTitle><CardDescription>Migrate previous audits by uploading exported audit workbooks (.xlsx) — the old TWC layout with Scan and Audit sheets, or the new export. Select as many files as you like.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <input ref={inputRef} type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={run} aria-label="Audit workbooks" />
      <Button disabled={busy} onClick={() => inputRef.current?.click()}><FileUp className="mr-2 h-4 w-4" />{busy ? "Importing…" : "Choose audit files"}</Button>
      {results.length > 0 && <ul className="divide-y rounded-md border text-sm">{results.map((result, index) => <li key={index} className="flex items-center justify-between gap-3 px-3 py-2"><span className="truncate font-medium">{result.file}</span><span className={result.status === "failed" ? "text-rose-600" : result.status === "skipped" ? "text-amber-600" : "text-emerald-600"}>{result.status === "imported" ? "Imported · " : result.status === "failed" ? "Failed · " : ""}{result.message}</span></li>)}</ul>}
    </CardContent>
  </Card>;
}
