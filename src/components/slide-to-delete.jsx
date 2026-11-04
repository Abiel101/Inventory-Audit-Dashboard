import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const DELETE_CODE = "0808";

export function SlideToDelete({ label, onDelete }) {
  const [value, setValue] = useState(0);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const reset = () => { setValue(0); setAsking(false); setCode(""); setError(""); };
  const release = () => { if (value >= 100) setAsking(true); else setValue(0); };
  const confirm = () => { if (code.trim() !== DELETE_CODE) return setError("Incorrect code."); onDelete(); reset(); };

  if (asking) return <div className="flex w-full flex-wrap items-center gap-2" role="group" aria-label={`Confirm delete ${label}`}>
    <Input autoFocus type="password" inputMode="numeric" className="h-8 w-32" value={code} placeholder="Delete code" aria-label="Delete code" onChange={(event) => { setCode(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") confirm(); if (event.key === "Escape") reset(); }} />
    <Button size="sm" variant="destructive" onClick={confirm}><Trash2 className="h-3.5 w-3.5" />Delete &amp; reset</Button>
    <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
    {error && <span className="text-xs text-rose-600" role="alert">{error}</span>}
  </div>;

  return <div className="relative h-8 w-full max-w-xs select-none overflow-hidden rounded-md border border-rose-200 bg-rose-50">
    <div className="absolute inset-y-0 left-0 bg-rose-200" style={{ width: `${value}%` }} />
    <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs font-medium text-rose-800">Slide to delete audit →</span>
    <input type="range" min="0" max="100" value={value} aria-label={`Slide to delete ${label} audit`} className="absolute inset-0 h-full w-full cursor-grab opacity-0" onChange={(event) => setValue(Number(event.target.value))} onPointerUp={release} onKeyUp={(event) => event.key.startsWith("Arrow") && release()} onBlur={() => !asking && setValue(0)} />
  </div>;
}
