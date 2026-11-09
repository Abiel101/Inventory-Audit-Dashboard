import { useEffect, useRef } from "react";
import { ImagePlus, Pin, PinOff, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Shrinks photos/screenshots so several fit in browser storage.
export function resizeImage(file, max = 900) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
    img.src = url;
  });
}

function ItemDetails({ item, images = [], onAddImages, onRemoveImage, pinned, onPin, onClose, Title, Description }) {
  const fileRef = useRef(null);
  useEffect(() => {
    if (!item || !onAddImages) return;
    const paste = (event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
      if (files.length) { event.preventDefault(); onAddImages(files); }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [item?.sku, onAddImages]);
  const fields = [
    ["SKU", item.sku],
    ["Style", item.style],
    ["Case code", item.category],
    ["Price", typeof item.price === "number" ? item.price.toLocaleString("en-US", { style: "currency", currency: "USD" }) : null],
    ["Expected", item.expected],
    ["Scanned", item.scanned],
    ["Sales floor", item.salesFloor],
    ["Locations", item.locations],
  ];
  return <div className="flex flex-col gap-5">
    <div className={pinned ? "flex items-center justify-between gap-1" : "absolute left-4 top-1.5 flex items-center"}>
      {onPin && <Button variant="ghost" size="sm" onClick={onPin} aria-pressed={pinned}>{pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}{pinned ? "Unpin" : "Pin to side"}</Button>}
    </div>
    {images.length ? images.map((src, index) => <div key={index} className="relative"><img src={src} alt={`${item.sku} ${index + 1}`} className="max-h-72 w-full rounded-lg border border-slate-200 bg-white object-contain" />{onRemoveImage && <Button variant="secondary" size="icon" className="absolute right-2 top-2 h-7 w-7" aria-label="Remove image" onClick={() => onRemoveImage(index)}><X className="h-4 w-4" /></Button>}</div>) : <Skeleton className="h-28 w-full rounded-lg" aria-label="Item image placeholder" />}
    {onAddImages && <div className="text-right"><input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" aria-label="Add item images" onChange={(event) => { onAddImages([...event.target.files]); event.target.value = ""; }} /><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" />Add image</Button></div>}
    <div className="text-right">
      <Title className="text-lg">{item.description || item.sku}</Title>
      <Description className="sr-only">Details for item {item.sku}</Description>
      {item.issue && <Badge className="mt-2 bg-indigo-100 text-indigo-800 hover:bg-indigo-100">Known issue</Badge>}
    </div>
    <dl className="divide-y divide-slate-200 text-right text-sm">
      {fields.map(([label, value]) => <div key={label} className="grid grid-cols-[auto_1fr] gap-4 py-2"><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium">{value === null || value === undefined || value === "" ? "—" : String(value)}</dd></div>)}
    </dl>
    {item.issue && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-right text-sm text-indigo-900"><p className="text-xs font-semibold uppercase tracking-wide">Known issue · qty {item.issue.quantity}</p><p className="mt-1 whitespace-pre-wrap">{item.issue.note}</p></div>}
    {item.auditNote && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-right text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit note</p><p className="mt-1 whitespace-pre-wrap">{item.auditNote}</p></div>}
  </div>;
}

const PlainTitle = (props) => <h3 {...props} />;
const PlainDescription = (props) => <p {...props} />;

export function ItemSheet({ item, onClose, pinned, onPin, ...imageProps }) {
  if (pinned) {
    return <aside aria-label="Pinned item" className="sticky top-0 max-h-screen w-80 shrink-0 self-start overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
      {item ? <ItemDetails item={item} pinned onPin={onPin} onClose={onClose} Title={PlainTitle} Description={PlainDescription} {...imageProps} />
        : <div className="flex flex-col gap-3"><div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onPin}><PinOff className="h-4 w-4" />Unpin</Button></div><Skeleton className="h-28 w-full rounded-lg" /><p className="text-right text-sm text-slate-500">Tap an item to see it here.</p></div>}
    </aside>;
  }
  return <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
    <SheetContent className="overflow-y-auto sm:max-w-md">
      {item && <div className="pt-6"><ItemDetails item={item} onPin={onPin} Title={SheetTitle} Description={SheetDescription} {...imageProps} /></div>}
    </SheetContent>
  </Sheet>;
}
