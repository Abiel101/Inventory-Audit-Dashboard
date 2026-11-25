import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, ListOrdered, Search, WrapText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { defaultVisibilityFor } from "@/lib/table-defaults";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Sorting is remembered per persistKey so it survives switching tabs (the table unmounts).
const savedSorting = new Map();
const ROW_OPTIONS = [10, 15, 20, 30, 50];
const MIN_ROWS = 10;
const iconButton = "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white opacity-50 transition-opacity hover:opacity-100 aria-expanded:opacity-100";

const readHidden = (key, fallback) => {
  try { const saved = JSON.parse(localStorage.getItem(key)); return saved && typeof saved === "object" ? saved : fallback; } catch { return fallback; }
};

// columnsKey enables a "Columns" menu; the choice is remembered across audits and sessions.
export function DataTable({ columns, data, searchPlaceholder = "Search records...", rowClassName, onRowClick, persistKey, columnsKey, defaultHidden = [], fillScreen = false, controlsTarget = null, filters = [] }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [wrapText, setWrapText] = useState(false);
  const [widths, setWidths] = useState({});
  const startResize = (event, id) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const startWidth = event.currentTarget.parentElement.offsetWidth;
    const move = (e) => setWidths((current) => ({ ...current, [id]: Math.max(60, startWidth + e.clientX - startX) }));
    const stop = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", stop);
  };
  const cellStyle = (column) => widths[column.id] ? { width: widths[column.id], minWidth: widths[column.id], maxWidth: widths[column.id] } : column.columnDef.meta === "wide" && !wrapText ? { maxWidth: "16rem" } : undefined;
  const cellClass = (column) => column.columnDef.meta === "wide" || widths[column.id] ? (wrapText ? "whitespace-normal break-words" : "truncate") : undefined;
  const wrapperRef = useRef(null);
  const [fillHeight, setFillHeight] = useState(null);
  const rowsKey = columnsKey ? `inventory-audit-rows:${columnsKey}` : null;
  const [rowLimit, setRowLimitState] = useState(() => { try { const saved = localStorage.getItem(rowsKey); return saved === "auto" || ROW_OPTIONS.includes(Number(saved)) ? (saved === "auto" ? "auto" : Number(saved)) : "auto"; } catch { return "auto"; } });
  const setRowLimit = (value) => { setRowLimitState(value); if (rowsKey) { try { localStorage.setItem(rowsKey, String(value)); } catch { /* applies for this session */ } } };
  // Desktop height: "auto" fills the screen down to 16px from the bottom but always fits at least 10 rows; a number fixes the visible rows.
  const dataLength = data.length;
  useEffect(() => {
    if (!fillScreen) return;
    const measure = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const top = wrapper.getBoundingClientRect().top;
      const headHeight = wrapper.querySelector("thead")?.offsetHeight ?? 32;
      const rowHeight = wrapper.querySelector("tbody tr")?.offsetHeight ?? 30;
      const rowsHeight = (rows) => Math.ceil(headHeight + rows * rowHeight);
      if (rowLimit !== "auto") return setFillHeight(rowsHeight(rowLimit));
      setFillHeight(window.innerWidth >= 1024 ? Math.max(rowsHeight(MIN_ROWS), window.innerHeight - top - 16) : rowsHeight(MIN_ROWS));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fillScreen, rowLimit, dataLength]);
  const [rowsMenuOpen, setRowsMenuOpen] = useState(false);
  const rowsMenuRef = useRef(null);
  useEffect(() => {
    if (!rowsMenuOpen) return;
    const close = (event) => { if (!rowsMenuRef.current?.contains(event.target)) setRowsMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [rowsMenuOpen]);
  const storageKey = columnsKey ? `inventory-audit-columns:${columnsKey}` : null;
  const [columnVisibility, setColumnVisibilityState] = useState(() => storageKey ? readHidden(storageKey, defaultVisibilityFor(columnsKey) ?? Object.fromEntries(defaultHidden.map((id) => [id, false]))) : {});
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
  const filterTest = filters.find((filter) => filter.id === activeFilter)?.test;
  const filteredData = filterTest ? data.filter(filterTest) : data;
  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  const controls =
      <div className="flex items-center gap-2">
        <button type="button" title={wrapText ? "Truncate long text" : "Show full text"} aria-label="Toggle full text" aria-pressed={wrapText} onClick={() => setWrapText(!wrapText)} className={cn(iconButton, wrapText && "bg-slate-100 opacity-100")}><WrapText className="h-4 w-4" /></button>
        {fillScreen && rowsKey && <div className="relative" ref={rowsMenuRef}>
          <button type="button" title="Rows shown" aria-label="Rows shown" aria-expanded={rowsMenuOpen} onClick={() => setRowsMenuOpen(!rowsMenuOpen)} className={iconButton}><ListOrdered className="h-4 w-4" /></button>
          {rowsMenuOpen && <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
            {["auto", ...ROW_OPTIONS].map((option) => <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-100"><input type="radio" name={rowsKey} checked={rowLimit === option} onChange={() => setRowLimit(option)} />{option === "auto" ? "Auto (fit screen)" : `${option} rows`}</label>)}
          </div>}
        </div>}
        {storageKey && <div className="relative" ref={menuRef}>
          <button type="button" title="Columns" aria-label="Columns" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className={iconButton}><Columns3 className="h-4 w-4" /></button>
          {menuOpen && <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
            {table.getAllLeafColumns().filter((column) => typeof column.columnDef.header === "string" && column.columnDef.header).map((column) => <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-100"><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />{column.columnDef.header}</label>)}
          </div>}
        </div>}
      </div>;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} className="pl-9" placeholder={searchPlaceholder} /></div>
      {filters.length > 0 && <div className="flex flex-wrap gap-1">{[{ id: "all", label: "All" }, ...filters].map((filter) => <button key={filter.id} type="button" aria-pressed={activeFilter === filter.id} onClick={() => setActiveFilter(filter.id)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", activeFilter === filter.id ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100")}>{filter.label}{filter.id !== "all" && ` (${data.filter(filter.test).length})`}</button>)}</div>}
      {controlsTarget ? createPortal(controls, controlsTarget) : controls}
    </div>
    <Table wrapperRef={wrapperRef} wrapperStyle={fillHeight ? { height: fillHeight } : undefined}>
      <TableHeader>{table.getHeaderGroups().map((headerGroup) => <TableRow key={headerGroup.id}>{headerGroup.headers.map((header) => {
        const sorted = header.column.getIsSorted();
        return <TableHead key={header.id} style={widths[header.column.id] ? { width: widths[header.column.id], minWidth: widths[header.column.id], maxWidth: widths[header.column.id] } : undefined} className="relative">{header.isPlaceholder ? null : <button className="flex items-center gap-1 font-semibold" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{sorted === "asc" ? <ArrowUp className="h-3 w-3" /> : sorted === "desc" ? <ArrowDown className="h-3 w-3" /> : header.column.getCanSort() ? <ChevronsUpDown className="h-3 w-3 text-slate-400" /> : null}</button>}{header.column.columnDef.meta === "wide" && <span role="separator" onMouseDown={(event) => startResize(event, header.column.id)} onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-slate-300" />}</TableHead>;
      })}</TableRow>)}</TableHeader>
      <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row, index, rows) => <TableRow key={row.id} className={cn(rowClassName?.(row.original, rows[index - 1]?.original), onRowClick && "cursor-pointer")} onClick={onRowClick && (() => onRowClick(row.original))}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} style={cellStyle(cell.column)} className={cellClass(cell.column)} title={cell.column.columnDef.meta === "wide" ? String(cell.getValue() ?? "") : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length || 1} className="h-24 text-center text-slate-500">No results found.</TableCell></TableRow>}</TableBody>
    </Table>
  </div>;
}
