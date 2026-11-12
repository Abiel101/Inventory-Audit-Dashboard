import * as XLSX from "xlsx";

const text = (value) => (value === undefined || value === null ? "" : String(value).trim());
const number = (value) => {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  return value === "" || value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed;
};
const rowsOf = (sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "", blankrows: false });
const sheetNamed = (workbook, name) => workbook.Sheets[workbook.SheetNames.find((entry) => entry.trim().toLowerCase() === name)];

// Export names look like "RG - AB - 01.02.26 - 3.45 PM.xlsx": case code, initials, date, time.
export function parseAuditFilename(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const parts = base.split(/\s+-\s+/).map((part) => part.trim());
  const dateMatch = base.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s*-\s*(\d{1,2})\.(\d{2})\s*(AM|PM))?/i);
  let date = null;
  if (dateMatch) {
    const year = Number(dateMatch[3]) < 100 ? 2000 + Number(dateMatch[3]) : Number(dateMatch[3]);
    let hours = Number(dateMatch[4] ?? 12);
    if (dateMatch[6]) hours = (hours % 12) + (dateMatch[6].toUpperCase() === "PM" ? 12 : 0);
    date = new Date(year, Number(dateMatch[1]) - 1, Number(dateMatch[2]), hours, Number(dateMatch[5] ?? 0));
    if (Number.isNaN(date.getTime())) date = null;
  }
  return { base, category: parts.length > 2 ? parts[0] : "", initials: parts.length > 2 ? parts[1] : "", date };
}

function readOld(workbook, scanSheet, auditSheet) {
  const items = rowsOf(auditSheet).slice(1).filter((row) => text(row[1])).map((row, index) => ({
    id: `row-${index}`, sku: text(row[1]), description: text(row[2]), style: text(row[3]), category: text(row[4]),
    price: number(row[5]), quantity: number(row[6]) ?? 0, salesFloor: number(row[7]),
  }));
  const scans = [];
  let location = "";
  rowsOf(scanSheet).slice(1).forEach((row) => {
    if (text(row[6])) location = text(row[6]);
    if (!text(row[0])) return;
    const sku = text(row[0]);
    const last = scans[scans.length - 1];
    if (last && last.sku === sku && last.location === location) last.qty += 1;
    else scans.push({ sku, description: text(row[5]) === "-" ? "" : text(row[5]), style: ["Not Found", "-"].includes(text(row[3])) ? "" : text(row[3]), qty: 1, location });
  });
  return { items, scans, finalNote: text(auditSheet.B1?.c?.[0]?.t) };
}

function readNew(workbook, scannedSheet, auditSheet) {
  const items = rowsOf(auditSheet).slice(1).filter((row) => text(row[0]) && text(row[6]) !== "Not in audit").map((row, index) => ({
    id: `row-${index}`, sku: text(row[0]), description: text(row[1]), style: text(row[2]), category: "",
    quantity: number(row[3]) ?? 0, price: number(row[9]), salesFloor: number(row[8]),
  }));
  const scans = rowsOf(scannedSheet).slice(1).filter((row) => text(row[0])).map((row) => ({
    sku: text(row[0]), description: text(row[1]), style: text(row[2]), location: text(row[3]), qty: number(row[4]) ?? 1,
    timestamp: row[5] instanceof Date ? row[5].toISOString() : undefined, notes: "",
  }));
  const info = Object.fromEntries(rowsOf(sheetNamed(workbook, "audit info") ?? {}).map((row) => [text(row[0]).toLowerCase(), row[1]]));
  return { items, scans, info, finalNote: "" };
}

export async function readAuditFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const auditSheet = sheetNamed(workbook, "audit");
  const oldScan = sheetNamed(workbook, "scan");
  const newScan = sheetNamed(workbook, "scanned");
  if (!auditSheet || !(oldScan || newScan)) throw new Error("Expected an exported audit workbook with an Audit sheet and a Scan (or Scanned) sheet.");
  const data = oldScan ? readOld(workbook, oldScan, auditSheet) : readNew(workbook, newScan, auditSheet);
  if (!data.items.length && !data.scans.length) throw new Error("No audit rows were found in this workbook.");
  const fromName = parseAuditFilename(file.name);
  const info = data.info ?? {};
  const counts = new Map();
  data.items.forEach((item) => item.category && counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
  const category = text(info["case code"]) || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || fromName.category || "(BLANK)";
  data.items.forEach((item) => { item.category = item.category || category; });
  const completed = fromName.date ?? (file.lastModified ? new Date(file.lastModified) : new Date());
  const completedAt = completed.toISOString();
  const locations = [...new Set(data.scans.map((scan) => scan.location).filter(Boolean))];
  return {
    audit: {
      id: `audit-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: text(info.audit) || fromName.base,
      category,
      items: data.items,
      scans: data.scans.map((scan) => ({ id: crypto.randomUUID(), section: 0, timestamp: completedAt, notes: "", ...scan, ...(scan.timestamp ? {} : { timestamp: completedAt }) })),
      completedLocations: locations,
      status: "completed",
      initials: text(info["associate initials"]) || fromName.initials,
      completedBy: text(info["associate initials"]) || fromName.initials,
      finalNote: data.finalNote,
      itemNotes: {},
      imported: true,
      snapshot: { sourceName: file.name, sourceUploadedAt: "", takenAt: completedAt },
      createdAt: completedAt,
      startedAt: completedAt,
      completedAt,
    },
    locations,
  };
}

// Reads every file independently so one bad workbook does not block the rest.
export async function importAuditFiles(files, existingAudits = []) {
  const names = new Set(existingAudits.map((audit) => audit.name));
  const audits = [];
  const locations = new Set();
  const results = [];
  for (const file of files) {
    try {
      const { audit, locations: found } = await readAuditFile(file);
      if (names.has(audit.name)) { results.push({ file: file.name, status: "skipped", message: "Already imported" }); continue; }
      names.add(audit.name);
      audits.push(audit);
      found.forEach((location) => locations.add(location));
      results.push({ file: file.name, status: "imported", message: `${audit.scans.reduce((sum, scan) => sum + scan.qty, 0)} units counted, ${audit.items.length} items` });
    } catch (error) {
      results.push({ file: file.name, status: "failed", message: error.message });
    }
  }
  return { audits, locations: [...locations], results };
}
