import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Sorting is remembered per persistKey so it survives switching tabs (the table unmounts).
const savedSorting = new Map();

export function DataTable({ columns, data, searchPlaceholder = "Search records...", rowClassName, onRowClick, persistKey }) {
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
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  return <div className="space-y-3">
    <div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} className="pl-9" placeholder={searchPlaceholder} /></div>
    <Table>
      <TableHeader>{table.getHeaderGroups().map((headerGroup) => <TableRow key={headerGroup.id}>{headerGroup.headers.map((header) => {
        const sorted = header.column.getIsSorted();
        return <TableHead key={header.id}>{header.isPlaceholder ? null : <button className="flex items-center gap-1 font-semibold" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{sorted === "asc" ? <ArrowUp className="h-3 w-3" /> : sorted === "desc" ? <ArrowDown className="h-3 w-3" /> : header.column.getCanSort() ? <ChevronsUpDown className="h-3 w-3 text-slate-400" /> : null}</button>}</TableHead>;
      })}</TableRow>)}</TableHeader>
      <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row, index, rows) => <TableRow key={row.id} className={cn(rowClassName?.(row.original, rows[index - 1]?.original), onRowClick && "cursor-pointer")} onClick={onRowClick && (() => onRowClick(row.original))}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">No results found.</TableCell></TableRow>}</TableBody>
    </Table>
  </div>;
}
