import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readTableDefaults, tableDefinitions, writeTableDefaults } from "@/lib/table-defaults";

export function TableDefaults() {
  const [defaults, setDefaults] = useState(readTableDefaults);
  const [message, setMessage] = useState("");
  const hiddenFor = (key) => defaults[key] ?? [];
  const toggle = (key, id) => {
    const hidden = hiddenFor(key);
    const next = { ...defaults, [key]: hidden.includes(id) ? hidden.filter((value) => value !== id) : [...hidden, id] };
    setDefaults(next); writeTableDefaults(next); setMessage("Saved");
  };
  const reset = () => { setDefaults({}); writeTableDefaults({}); setMessage("Defaults reset"); };
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Default columns</CardTitle><CardDescription>Choose which columns each table shows by default. Tables you have already customized with the Columns menu keep their own choice.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        {tableDefinitions.map((table) => <fieldset key={table.key}><legend className="text-sm font-semibold">{table.label}</legend>
          <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">{table.columns.map(([id, label]) => <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100"><input type="checkbox" checked={!hiddenFor(table.key).includes(id)} onChange={() => toggle(table.key, id)} />{label}</label>)}</div>
        </fieldset>)}
        <div className="flex items-center gap-3"><Button variant="outline" size="sm" onClick={reset}>Reset to defaults</Button>{message && <p className="text-sm text-slate-500" role="status">{message}</p>}</div>
      </CardContent></Card>
  </div>;
}
