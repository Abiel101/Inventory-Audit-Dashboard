import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const DELETE_CODE = "0808";
const SWIPE_PX = 80;
const LONG_PRESS_MS = 600;

// Right-click (desktop), swipe left or long press (touch) reveals a code prompt to delete.
export function DeleteGesture({ label, onDelete, children }) {
  const [offset, setOffset] = useState(0);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const start = useRef(null);
  const timer = useRef(null);

  const clearTimer = () => { clearTimeout(timer.current); timer.current = null; };
  const reset = () => { setAsking(false); setCode(""); setError(""); };
  const confirm = () => { if (code.trim() !== DELETE_CODE) return setError("Incorrect code."); onDelete(); reset(); };

  const down = (event) => {
    if (event.pointerType !== "touch") return;
    start.current = { x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => { setAsking(true); start.current = null; }, LONG_PRESS_MS);
  };
  const move = (event) => {
    if (!start.current) return;
    const dx = event.clientX - start.current.x; const dy = event.clientY - start.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimer();
    if (Math.abs(dx) > Math.abs(dy)) setOffset(Math.min(0, dx));
  };
  const up = () => {
    clearTimer();
    if (start.current && offset <= -SWIPE_PX) setAsking(true);
    start.current = null; setOffset(0);
  };

  return <div>
    <div title="Right-click, swipe left, or long-press to delete" className="touch-pan-y transition-transform" style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      onContextMenu={(event) => { event.preventDefault(); setAsking(true); }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {children}
    </div>
    {asking && <div className="flex flex-wrap items-center gap-2 border-t border-rose-200 bg-rose-50 px-4 py-2" role="group" aria-label={`Confirm delete ${label}`}>
      <span className="text-sm text-rose-800">Delete the {label} audit and reset it to Not Started?</span>
      <Input autoFocus type="password" inputMode="numeric" className="h-8 w-32" value={code} placeholder="Delete code" aria-label="Delete code" onChange={(event) => { setCode(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") confirm(); if (event.key === "Escape") reset(); }} />
      <Button size="sm" variant="destructive" onClick={confirm}><Trash2 className="h-3.5 w-3.5" />Delete &amp; reset</Button>
      <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
      {error && <span className="text-xs text-rose-600" role="alert">{error}</span>}
    </div>}
  </div>;
}
