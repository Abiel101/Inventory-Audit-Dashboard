import * as XLSX from "xlsx";
import { dateKey } from "@/lib/utils";

const normalizeHeader = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const headerAliases = {
  sku: ["upc", "sku", "barcode", "item number", "item no", "item #", "product number"],
  description: ["description", "product name"],
  style: ["style", "clu"],
  quantity: ["on hand", "quantity", "qty"],
  category: ["case code", "category"],
};
const normalizedAliases = Object.fromEntries(Object.entries(headerAliases).map(([field, aliases]) => [field, new Set(aliases.map(normalizeHeader))]));

export async function readInventoryFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const candidates = workbook.SheetNames.flatMap((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
    return rows.flatMap((headers, headerIndex) => {
      const columns = Object.fromEntries(Object.keys(normalizedAliases).map((field) => [
        field,
        headers.findIndex((header) => {
          const normalized = normalizeHeader(header);
          return [...normalizedAliases[field]].some((alias) => normalized.includes(alias));
        }),
      ]));
      if (columns.sku < 0 || columns.category < 0 || columns.sku === columns.category) return [];
      const score = Object.values(columns).filter((column) => column >= 0).length + (/inventory|stock/i.test(sheetName) ? 1 : 0);
      return [{ rows, headerIndex, columns, score }];
    });
  }).sort((left, right) => right.score - left.score);
  const candidate = candidates[0];
  if (!candidate) throw new Error("This workbook has no recognizable inventory headers. Include an item number or SKU column and a case code or category column.");
  const { rows, headerIndex, columns } = candidate;
  const inventory = rows.slice(headerIndex + 1).map((row, index) => {
    const get = (field) => columns[field] < 0 ? "" : row[columns[field]] ?? "";
    const quantity = Number(String(get("quantity")).replace(/,/g, "").trim()) || 0;
    return { id: `row-${index}`, sku: String(get("sku")).trim(), description: String(get("description")).trim(), style: String(get("style")).trim(), quantity, category: String(get("category")).trim() };
  }).filter((item) => item.sku);
  if (!inventory.length) throw new Error("No inventory rows with item numbers or SKUs were found below the workbook headers.");
  return { inventory, sourceName: file.name, sourceUploadedAt: new Date().toISOString(), sourceModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : "" };
}

// Reads the inventory date from a source name such as "inventory-2026-10-17.xlsx" (also MM-DD-YYYY and YYYYMMDD).
export function parseSourceDate(name = "") {
  const candidates = [
    [/(?<!\d)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/, (m) => [m[1], m[2], m[3]]],
    [/(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?!\d)/, (m) => [m[3], m[1], m[2]]],
    [/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/, (m) => [m[1], m[2], m[3]]],
  ];
  for (const [pattern, pick] of candidates) {
    const match = name.match(pattern);
    if (!match) continue;
    const [year, month, day] = pick(match).map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return dateKey(date);
  }
  return null;
}

export function sourceFreshness(sourceName, hasInventory, today = dateKey(new Date()), fallbackDate = null) {
  if (!hasInventory) return { status: "none", sourceDate: null };
  const sourceDate = parseSourceDate(sourceName) ?? fallbackDate;
  if (!sourceDate) return { status: "unknown", sourceDate: null };
  return { status: sourceDate === today ? "fresh" : "stale", sourceDate };
}

// Colour the source by age: same day = green, one day old = yellow, older = red.
// The date comes from the file name, else the file's own last-modified time, else the upload time.
export function sourceAge({ sourceName, sourceUploadedAt, sourceModifiedAt }, now = new Date()) {
  const fallback = sourceModifiedAt || sourceUploadedAt;
  const key = parseSourceDate(sourceName) ?? (fallback ? dateKey(new Date(fallback)) : null);
  const time = sourceUploadedAt ? new Date(sourceUploadedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  if (!key) return { tone: "unknown", days: null, time, key };
  const days = Math.round((new Date(dateKey(now) + "T00:00:00") - new Date(key + "T00:00:00")) / 86400000);
  return { tone: days <= 0 ? "fresh" : days === 1 ? "aging" : "stale", days, time, key };
}

export const categoryOf = (item) => item.category || "(BLANK)";

// Longer keywords first so "Silver Ice" is matched before "Silver".
const groupKeywords = ["Silver Ice", "Bridal", "Mens", "Men's", "Silver", "Gold", "Platinum", "Diamond", "Pearl", "Watch", "Fashion", "Kids", "Ladies"];
export function codeGroup(code) {
  const text = String(code).toLowerCase();
  const hit = groupKeywords.find((keyword) => text.includes(keyword.toLowerCase()));
  if (hit) return hit === "Men's" ? "Mens" : hit;
  const first = String(code).match(/[A-Za-z]{3,}/)?.[0];
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "Other";
}
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const compareCodes = (a, b) => collator.compare(codeGroup(a) === "Other" ? "\uffff" : codeGroup(a), codeGroup(b) === "Other" ? "\uffff" : codeGroup(b)) || collator.compare(a, b);
export function groupCodes(codes) {
  const groups = new Map();
  [...codes].sort(compareCodes).forEach((code) => { const group = codeGroup(code); groups.set(group, [...(groups.get(group) ?? []), code]); });
  return [...groups];
}

export function buildAudit(inventory, category, name, index = 0) {
  return { id: `audit-${Date.now()}-${index}`, name: name || `${category} audit`, category, items: inventory.filter((item) => categoryOf(item) === category), scans: [], completedLocations: [], status: "in-progress", createdAt: new Date().toISOString(), completedAt: null };
}
