import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export const DELETE_CODE = "0808";

// Warning (Yes/No) followed by a manager-code step before the audit is deleted.
function DeleteDialog({ open, label, onClose, onDelete }) {
  const [step, setStep] = useState("warn");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const close = () => { onClose(); setStep("warn"); setCode(""); setError(""); };
  const confirm = () => { if (code.trim() !== DELETE_CODE) return setError("Incorrect manager code."); onDelete(); close(); };
  return <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
    <DialogContent aria-label={`Delete ${label}`}>
      {step === "warn" ? <>
        <DialogTitle>Delete {label}?</DialogTitle>
        <DialogDescription>You are about to delete this audit, all progress will be lost and you'll need to start over. Do you want to continue?</DialogDescription>
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={close}>No</Button><Button variant="destructive" onClick={() => setStep("code")}>Yes</Button></div>
      </> : <>
        <DialogTitle>Manager code required</DialogTitle>
        <DialogDescription>Enter the manager code to delete the {label} audit.</DialogDescription>
        <Input autoFocus type="password" inputMode="numeric" className="mt-4" value={code} placeholder="Manager code" aria-label="Manager code" onChange={(event) => { setCode(event.target.value); setError(""); }} onKeyDown={(event) => event.key === "Enter" && confirm()} />
        {error && <p className="mt-2 text-xs text-rose-600" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancel</Button><Button variant="destructive" onClick={confirm}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div>
      </>}
    </DialogContent>
  </Dialog>;
}

// Three-dot menu for an audit. `actions` are extra entries: [{ label, icon, onSelect }].
export function AuditMenu({ label, actions = [], onDelete }) {
  const [deleting, setDeleting] = useState(false);
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`Options for ${label}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map(({ label: text, icon: Icon, onSelect }) => <DropdownMenuItem key={text} onSelect={onSelect}>{Icon && <Icon />}{text}</DropdownMenuItem>)}
        {actions.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem destructive onSelect={() => setDeleting(true)}><Trash2 />Delete audit</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <DeleteDialog open={deleting} label={label} onClose={() => setDeleting(false)} onDelete={onDelete} />
  </>;
}
