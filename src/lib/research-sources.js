import * as XLSX from "xlsx";

export const OMNI = "omni";
export const REFERENCE = "reference";

const dallasPattern = /dallas|\bstore\s*#?\s*0?8\b|\bx0?8\b/i;
const storeColumnPattern = /store|location|loc\b|site/i;
const bareStore = /^0?8$/;

const clean = (value) => String(value ?? "").trim();

// Omni Channel rows are kept when anything in the row mentions Dallas, Store 08/8 or x08,
// or a store/location column holds just 08/8. Extra store locations on the row do not matter.
export function involvesDallas(row, headers) {
  return row.some((cell, index) => {
    const text = clean(cell);
    if (!text) return false;
    if (dallasPattern.test(text)) return true;
    return bareStore.test(text) && storeColumnPattern.test(clean(headers[index]));
  });
}

function pickSheet(workbook) {
  const sheets = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", blankrows: false });
    const headerIndex = rows.findIndex((row) => row.filter((cell) => clean(cell)).length >= 2);
    return { name, rows, headerIndex };
  }).filter((sheet) => sheet.headerIndex >= 0);
  return sheets.sort((a, b) => b.rows.length - a.rows.length)[0];
}

export async function readSourceFile(file, kind, month) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = pickSheet(workbook);
  if (!sheet) throw new Error("No table with a header row was found in this file.");
  const headers = sheet.rows[sheet.headerIndex].map((cell, index) => clean(cell) || `Column ${index + 1}`);
  const all = sheet.rows.slice(sheet.headerIndex + 1).map((row) => headers.map((_, index) => clean(row[index]))).filter((row) => row.some(Boolean));
  const rows = kind === OMNI ? all.filter((row) => involvesDallas(row, headers)) : all;
  if (!rows.length) throw new Error(kind === OMNI ? "No rows mentioning Dallas, Store 08/8 or x08 were found in this file." : "No data rows were found in this file.");
  return {
    id: crypto.randomUUID(), kind, name: file.name, month: month || new Date().toISOString().slice(0, 7),
    uploadedAt: new Date().toISOString(), headers, rows, totalRows: all.length,
  };
}

// Index every cell value of every source so a SKU/UPC can be found in any column.
export function buildIndex(sources) {
  const index = new Map();
  sources.forEach((source) => source.rows.forEach((row, rowIndex) => row.forEach((cell) => {
    const key = clean(cell).toLowerCase();
    if (key.length < 4) return;
    const hits = index.get(key) ?? [];
    if (hits[hits.length - 1]?.source !== source || hits[hits.length - 1]?.rowIndex !== rowIndex) hits.push({ source, rowIndex });
    index.set(key, hits);
  })));
  return index;
}

export const lookup = (index, value) => index.get(clean(value).toLowerCase()) ?? [];
