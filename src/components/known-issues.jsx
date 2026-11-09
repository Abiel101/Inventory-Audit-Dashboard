import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { identifiersMatch } from "@/lib/utils";

const blank = { sku: "", style: "", description: "", quantity: "1", note: "" };

export function KnownIssues({ state, update }) {
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const issues = state.knownIssues ?? [];
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const lookup = (field) => {
    const value = form[field].trim();
    if (!value) return;
    const match = state.inventory.find((item) => identifiersMatch(item[field], value)) ?? state.inventory.find((item) => identifiersMatch(field === "sku" ? item.style : item.sku, value));
    if (match) setForm((current) => ({ ...current, sku: match.sku, style: match.style || current.style, description: match.description || current.description }));
  };
  const add = () => {
    if (!form.sku.trim() && !form.style.trim()) return setMessage("Enter a SKU or style");
    if (!form.note.trim()) return setMessage("Enter a note");
    const quantity = Math.max(1, Math.floor(Number(form.quantity)) || 1);
    update((current) => ({ ...current, knownIssues: [{ id: crypto.randomUUID(), sku: form.sku.trim(), style: form.style.trim(), description: form.description.trim(), quantity, note: form.note.trim(), createdAt: new Date().toISOString() }, ...(current.knownIssues ?? [])] }));
    setForm(blank);
    setMessage("Known issue added");
  };
  const remove = (issue) => window.confirm(`Remove the known issue for ${issue.sku || issue.style}?`) && update((current) => ({ ...current, knownIssues: (current.knownIssues ?? []).filter((item) => item.id !== issue.id) }));
  return <Card><CardHeader><CardTitle>Known issues</CardTitle><CardDescription>Flag pieces with a known problem before they are scanned. They appear in indigo in the audit and research tables; tap an item to read the note.</CardDescription></CardHeader><CardContent className="space-y-5">
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">SKU<Input value={form.sku} onChange={set("sku")} onBlur={() => lookup("sku")} placeholder="SKU or style required" /></label>
      <label className="grid gap-1 text-sm font-medium">Style<Input value={form.style} onChange={set("style")} onBlur={() => lookup("style")} placeholder="Style number" /></label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">Description<Input value={form.description} onChange={set("description")} placeholder="Filled in automatically when found in inventory" /></label>
      <label className="grid gap-1 text-sm font-medium">Quantity<Input type="number" min="1" inputMode="numeric" value={form.quantity} onChange={set("quantity")} /></label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">Note<textarea className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={form.note} onChange={set("note")} placeholder="Describe the issue" /></label>
      <div className="sm:col-span-2"><Button onClick={add}>Add known issue</Button>{message && <span className="ml-3 text-sm text-slate-500" role="status">{message}</span>}</div>
    </div>
    <div className="divide-y divide-slate-200">{issues.length ? issues.map((issue) => <div key={issue.id} className="flex items-start justify-between gap-3 rounded-md py-3 text-sm"><div className="min-w-0"><p className="font-semibold">{issue.sku || "—"}{issue.style ? ` · ${issue.style}` : ""} <span className="font-normal text-slate-500">· qty {issue.quantity}</span></p>{issue.description && <p className="truncate text-slate-500">{issue.description}</p>}<p className="mt-1 whitespace-pre-wrap">{issue.note}</p></div><Button variant="ghost" size="icon" aria-label={`Remove known issue ${issue.sku || issue.style}`} onClick={() => remove(issue)}><Trash2 className="h-4 w-4 text-rose-600" /></Button></div>) : <p className="py-2 text-sm text-slate-500">No known issues yet.</p>}</div>
  </CardContent></Card>;
}
