import * as XLSX from "xlsx";
import { dateKey, identifiersMatch } from "@/lib/utils";

const normalizeHeader = (value) => String(value ?? "").toLowerCase().replace(/#/g, " number ").replace(/[^a-z0-9]/g, "");
const headerAliases = {
  sku: [
    ["upc", 120], ["upc code", 118], ["upc number", 118], ["sku/upc", 116],
    ["sku upc", 116], ["barcode", 112], ["ean", 108], ["gtin", 108],
    ["sku", 104], ["item number", 96], ["item #", 96], ["item no", 94],
    ["product number", 93], ["product code", 92], ["stock number", 90],
    ["inventory number", 88], ["scan upc", 86], ["plu", 50],
  ],
  description: [["product description", 120], ["item description", 118], ["description", 110], ["product name", 100], ["name", 70]],
  style: [["style number", 120], ["style #", 118], ["style", 110], ["clu", 105], ["model number", 95], ["model", 80], ["design", 70]],
  quantity: [["on hand", 120], ["on hand qty", 118], ["quantity", 105], ["qty", 100], ["total qty", 90], ["inventory qty", 90], ["count", 80]],
  category: [["case code", 120], ["casecode", 118], ["case category", 115], ["audit category", 112], ["location category", 110], ["category", 100], ["case", 70], ["group", 60]],
  price: [["sale price", 120], ["sell price", 118], ["retail price", 115], ["price", 100]],
  salesFloor: [["sales floor", 120], ["available to sell", 115], ["ats", 100]],
};
const normalizedAliases = Object.fromEntries(Object.entries(headerAliases).map(([field, aliases]) => [field, aliases.map(([alias, score]) => [normalizeHeader(alias), score])]));

function mapHeaders(headers) {
  return Object.fromEntries(Object.entries(normalizedAliases).map(([field, aliases]) => {
    let bestIndex = -1;
    let bestScore = 0;
    headers.forEach((header, index) => {
      const normalized = normalizeHeader(header);
      for (const [alias, score] of aliases) {
        const candidateScore = normalized === alias ? score : normalized.includes(alias) ? score - 15 : 0;
        if (candidateScore > bestScore) {
          bestIndex = index;
          bestScore = candidateScore;
        }
      }
    });
    return [field, bestIndex];
  }));
}

export async function readInventoryFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const candidates = workbook.SheetNames.flatMap((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
    return rows.flatMap((headers, headerIndex) => {
      const nextHeaders = rows[headerIndex + 1] ?? [];
      const mergedHeaders = headers.map((header, index) => [header, nextHeaders[index]].filter((value) => String(value ?? "").trim()).join(" "));
      const variants = [
        { headers, dataIndex: headerIndex + 1 },
        { headers: mergedHeaders, dataIndex: headerIndex + 2 },
      ];
      return variants.flatMap(({ headers: candidateHeaders, dataIndex }) => {
        const columns = mapHeaders(candidateHeaders);
        if (columns.sku < 0 || columns.category < 0 || columns.quantity < 0 || new Set([columns.sku, columns.category, columns.quantity]).size < 3) return [];
        const hasData = rows.slice(dataIndex).some((row) => String(row[columns.sku] ?? "").trim());
        if (!hasData) return [];
        const score = Object.values(columns).filter((column) => column >= 0).length + (/inventory|stock/i.test(sheetName) ? 1 : 0);
        return [{ rows, dataIndex, columns, score }];
      });
    });
  }).sort((left, right) => right.score - left.score);
  const candidate = candidates[0];
  if (!candidate) throw new Error("This workbook has no recognizable inventory headers. Include an item number or SKU, case code or category, and on-hand quantity column.");
  const { rows, dataIndex, columns } = candidate;
  const inventory = rows.slice(dataIndex).map((row, index) => {
    const get = (field) => columns[field] < 0 ? "" : row[columns[field]] ?? "";
    const sku = String(get("sku")).trim();
    const quantity = Number(String(get("quantity")).replace(/,/g, "").trim()) || 0;
    const optionalNumber = (field) => {
      const raw = String(get(field)).replace(/[$,]/g, "").trim();
      const value = Number(raw);
      if (!raw) return null;
      if (!Number.isFinite(value) && sku) throw new Error(`Invalid ${field === "price" ? "sale price" : "sales-floor quantity"} for SKU ${sku}.`);
      return Number.isFinite(value) ? value : null;
    };
    return { id: `row-${index}`, sku, description: String(get("description")).trim(), style: String(get("style")).trim(), quantity, category: String(get("category")).trim(), price: optionalNumber("price"), salesFloor: optionalNumber("salesFloor") };
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

// Items are copied into the audit so later source uploads never change a started audit; "source" records which upload the copy came from.
export function buildAudit(inventory, category, name, index = 0, source = {}) {
  return { snapshot: { sourceName: source.sourceName ?? "", sourceUploadedAt: source.sourceUploadedAt ?? "", takenAt: new Date().toISOString() }, id: `audit-${Date.now()}-${index}`, name: name || `${category} audit`, category, items: inventory.filter((item) => categoryOf(item) === category).map((item) => ({ ...item })), scans: [], completedLocations: [], status: "in-progress", createdAt: new Date().toISOString(), completedAt: null };
}

// Known issues are flagged in advance by management and matched to scanned or expected pieces by SKU or style.
export function findKnownIssue(issues = [], { sku, style } = {}) {
  return issues.find((issue) => (issue.sku && identifiersMatch(issue.sku, sku)) || (issue.style && (identifiersMatch(issue.style, style) || identifiersMatch(issue.style, sku)))) ?? null;
}
