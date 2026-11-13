import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Sorting is remembered per persistKey so it survives switching tabs (the table unmounts).
const savedSorting = new Map();

const readHidden = (key, fallback) => {
  try { const saved = JSON.parse(localStorage.getItem(key)); return saved && typeof saved === "object" ? saved : fallback; } catch { return fallback; }
};

// columnsKey enables a "Columns" menu; the choice is remembered across audits and sessions.
export function DataTable({ columns, data, searchPlaceholder = "Search records...", rowClassName, onRowClick, persistKey, columnsKey, defaultHidden = [], fillScreen = false }) {
  const wrapperRef = useRef(null);
  const [fillHeight, setFillHeight] = useState(null);
  // On desktop the table gets a fixed height that ends 16px above the bottom of the screen; rows scroll under a sticky header.
  useEffect(() => {
    if (!fillScreen) return;
    const measure = () => {
      const top = wrapperRef.current?.getBoundingClientRect().top ?? 0;
      setFillHeight(window.innerWidth >= 1024 ? Math.max(240, window.innerHeight - top - 16) : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fillScreen]);
  const storageKey = columnsKey ? `inventory-audit-columns:${columnsKey}` : null;
  const [columnVisibility, setColumnVisibilityState] = useState(() => storageKey ? readHidden(storageKey, Object.fromEntries(defaultHidden.map((id) => [id, false]))) : {});
  const setColumnVisibility = (updater) => setColumnVisibilityState((current) => {
    const next = typeof updater === "function" ? updater(current) : updater;
    if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* choice still applies for this session */ } }
    return next;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);
  const [sorting, setSortingState] = useState(() => savedSorting.get(persistKey) ?? []);
  const setSorting = (updater) => setSortingState((current) => {
    const next = typeof updater === "function" ? updater(current) : updater;
    if (persistKey) savedSorting.set(persistKey, next);
    return next;
  });
  const [globalFilter, setGlobalFilter] = useState("");
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} className="pl-9" placeholder={searchPlaceholder} /></div>
      {storageKey && <div className="relative" ref={menuRef}>
        <button type="button" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-slate-50"><Columns3 className="h-4 w-4" />Columns</button>
        {menuOpen && <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          {table.getAllLeafColumns().filter((column) => typeof column.columnDef.header === "string" && column.columnDef.header).map((column) => <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-100"><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />{column.columnDef.header}</label>)}
        </div>}
      </div>}
    </div>
    <Table wrapperRef={wrapperRef} wrapperStyle={fillHeight ? { height: fillHeight } : undefined}>
      <TableHeader>{table.getHeaderGroups().map((headerGroup) => <TableRow key={headerGroup.id}>{headerGroup.headers.map((header) => {
        const sorted = header.column.getIsSorted();
        return <TableHead key={header.id}>{header.isPlaceholder ? null : <button className="flex items-center gap-1 font-semibold" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{sorted === "asc" ? <ArrowUp className="h-3 w-3" /> : sorted === "desc" ? <ArrowDown className="h-3 w-3" /> : header.column.getCanSort() ? <ChevronsUpDown className="h-3 w-3 text-slate-400" /> : null}</button>}</TableHead>;
      })}</TableRow>)}</TableHeader>
      <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row, index, rows) => <TableRow key={row.id} className={cn(rowClassName?.(row.original, rows[index - 1]?.original), onRowClick && "cursor-pointer")} onClick={onRowClick && (() => onRowClick(row.original))}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length || 1} className="h-24 text-center text-slate-500">No results found.</TableCell></TableRow>}</TableBody>
    </Table>
  </div>;
}
