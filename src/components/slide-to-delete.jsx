import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export const DELETE_CODE = "0808";
const LONG_PRESS_MS = 600;

// Right-click (desktop) or long press opens a warning, then a manager-code step, before deleting.
export function DeleteGesture({ label, onDelete, children }) {
  const [step, setStep] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const start = useRef(null);
  const timer = useRef(null);
  const fired = useRef(false);

  const clearTimer = () => { clearTimeout(timer.current); timer.current = null; };
  const reset = () => { setStep(null); setCode(""); setError(""); };
  const confirm = () => { if (code.trim() !== DELETE_CODE) return setError("Incorrect manager code."); onDelete(); reset(); };

  const down = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    fired.current = false;
    start.current = { x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => { fired.current = true; setStep("warn"); }, LONG_PRESS_MS);
  };
  const move = (event) => {
    if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) clearTimer();
  };
  const up = () => { clearTimer(); start.current = null; };

  return <div>
    <div title="Right-click or press and hold to delete" onContextMenu={(event) => { event.preventDefault(); setStep("warn"); }}
      onClickCapture={(event) => { if (fired.current) { event.stopPropagation(); event.preventDefault(); fired.current = false; } }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
      {children}
    </div>
    <Dialog open={step !== null} onOpenChange={(open) => { if (!open) reset(); }}>
      <DialogContent aria-label={`Delete ${label}`}>
        {step === "warn" ? <>
          <DialogTitle>Delete {label}?</DialogTitle>
          <DialogDescription>You are about to delete this audit, all progress will be lost and you'll need to start over. Do you want to continue?</DialogDescription>
          <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={reset}>No</Button><Button variant="destructive" onClick={() => setStep("code")}>Yes</Button></div>
        </> : <>
          <DialogTitle>Manager code required</DialogTitle>
          <DialogDescription>Enter the manager code to delete the {label} audit.</DialogDescription>
          <Input autoFocus type="password" inputMode="numeric" className="mt-4" value={code} placeholder="Manager code" aria-label="Manager code" onChange={(event) => { setCode(event.target.value); setError(""); }} onKeyDown={(event) => event.key === "Enter" && confirm()} />
          {error && <p className="mt-2 text-xs text-rose-600" role="alert">{error}</p>}
          <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={reset}>Cancel</Button><Button variant="destructive" onClick={confirm}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
