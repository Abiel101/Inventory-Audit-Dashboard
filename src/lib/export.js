import { auditProgress, auditTally } from "@/lib/utils";

const COLORS = {
  ink: "FF0F172A",
  sky: "FF0284C7",
  indigo: "FF4F46E5",
  emerald: "FF059669",
  amber: "FFD97706",
  rose: "FFE11D48",
  slate: "FF475569",
  met: "FFD1FAE5",
  extra: "FFFECDD3",
  band: "FFF1F5F9",
  tint: { "FF0284C7": "FFE0F2FE", "FF059669": "FFD1FAE5", "FFD97706": "FFFEF3C7" },
  line: "FFCBD5E1",
};
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const border = { top: { style: "thin", color: { argb: COLORS.line } }, bottom: { style: "thin", color: { argb: COLORS.line } }, left: { style: "thin", color: { argb: COLORS.line } }, right: { style: "thin", color: { argb: COLORS.line } } };

export function exportFilename(audit, date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const day = `${pad(date.getMonth() + 1)}.${pad(date.getDate())}.${String(date.getFullYear()).slice(-2)}`;
  const time = `${pad(date.getHours() % 12 || 12)}.${pad(date.getMinutes())} ${date.getHours() < 12 ? "AM" : "PM"}`;
  const clean = (value) => String(value ?? "").trim().replace(/[\\/:*?"<>|]+/g, "");
  return `${[clean(audit.category), clean(audit.completedBy || audit.initials), day, time].filter(Boolean).join(" - ").toUpperCase()}.xlsx`;
}

function styleHeader(sheet, colors) {
  const row = sheet.getRow(1);
  row.height = 28;
  colors.forEach((color, index) => {
    const cell = row.getCell(index + 1);
    cell.fill = fill(color);
    cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function exportAuditWorkbook(audit, { compareKey }) {
  const ExcelJS = (await import("exceljs")).default;
  const tally = auditTally(audit);
  const when = new Date(audit.completedAt || Date.now());
  const workbook = new ExcelJS.Workbook();
  const info = workbook.addWorksheet("Audit Info", { properties: { tabColor: { argb: COLORS.ink } } });
  const scanned = workbook.addWorksheet("Scanned", { properties: { tabColor: { argb: COLORS.sky } } });
  const items = workbook.addWorksheet("Audit", { properties: { tabColor: { argb: COLORS.emerald } } });

  const expectedRows = [...tally.expected];
  const itemLast = Math.max(expectedRows.length + 1, 2);
  const scanLast = Math.max(audit.scans.length + 1, 2);
  const lookup = (sku) => audit.items.find((entry) => entry.sku === sku);

  items.columns = [
    { header: "SKU", width: 18 }, { header: "Description", width: 44 }, { header: "Style", width: 16 },
    { header: "Expected", width: 11 }, { header: "Scanned", width: 11 }, { header: "Variance", width: 11 },
    { header: "Status", width: 14 }, { header: "Notes", width: 40 },
  ];
  styleHeader(items, [COLORS.ink, COLORS.sky, COLORS.indigo, COLORS.emerald, COLORS.sky, COLORS.rose, COLORS.amber, COLORS.slate]);
  expectedRows.forEach(([sku, expected], index) => {
    const n = index + 2;
    const found = tally.scanned.get(sku) ?? 0;
    const item = lookup(sku);
    const row = items.addRow([
      sku, item?.description ?? "", item?.style ?? "", expected,
      { formula: `SUMIF(Scanned!$A$2:$A$${scanLast},A${n},Scanned!$E$2:$E$${scanLast})`, result: found },
      { formula: `D${n}-E${n}`, result: expected - found },
      { formula: `IF(E${n}>=D${n},"Found",IF(E${n}=0,"Missing","Short"))`, result: found >= expected ? "Found" : found === 0 ? "Missing" : "Short" },
      audit.itemNotes?.[compareKey(sku)] ?? "",
    ]);
    row.eachCell((cell) => { cell.border = border; cell.alignment = { vertical: "middle", wrapText: true }; });
    row.getCell(1).numFmt = "@";
    row.fill = found >= expected ? fill(COLORS.met) : fill("FFFFFFFF");
  });
  items.autoFilter = { from: "A1", to: `H${itemLast}` };

  scanned.columns = [
    { header: "SKU", width: 18 }, { header: "Description", width: 44 }, { header: "Style", width: 16 },
    { header: "Location", width: 18 }, { header: "Scanned", width: 11 }, { header: "Date / Time", width: 20 },
    { header: "Expected", width: 11 }, { header: "Audit total", width: 12 }, { header: "Result", width: 18 },
  ];
  styleHeader(scanned, [COLORS.ink, COLORS.sky, COLORS.indigo, COLORS.slate, COLORS.emerald, COLORS.sky, COLORS.rose, COLORS.amber, COLORS.indigo]);
  audit.scans.forEach((scan, index) => {
    const n = index + 2;
    const { total, expected } = tally.totalFor(scan);
    const status = tally.status(scan);
    const result = status === "extra" ? "Not in audit" : total >= expected ? "Quantity met" : "Quantity differs";
    const row = scanned.addRow([
      scan.sku, scan.description, scan.style, scan.location, Number(scan.qty) || 0, new Date(scan.timestamp),
      { formula: `IFERROR(INDEX(Audit!$D$2:$D$${itemLast},MATCH(A${n},Audit!$A$2:$A$${itemLast},0)),"")`, result: expected ?? "" },
      { formula: `SUMIF($A$2:$A$${scanLast},A${n},$E$2:$E$${scanLast})`, result: total },
      { formula: `IF(G${n}="","Not in audit",IF(H${n}>=G${n},"Quantity met","Quantity differs"))`, result },
    ]);
    row.getCell(1).numFmt = "@";
    row.getCell(6).numFmt = "mm/dd/yyyy hh:mm";
    row.eachCell((cell) => { cell.border = border; cell.alignment = { vertical: "middle", wrapText: true }; });
    if (result === "Not in audit") row.fill = fill(COLORS.extra);
    else if (result === "Quantity met") row.fill = fill(COLORS.met);
  });
  scanned.autoFilter = { from: "A1", to: `I${scanLast}` };

  const expectedUnits = expectedRows.reduce((sum, [, value]) => sum + value, 0);
  const foundUnits = [...tally.scanned.values()].reduce((sum, value) => sum + value, 0);
  info.columns = [{ width: 26 }, { width: 72 }];
  info.views = [{ showGridLines: false }];
  info.mergeCells("A1:B1");
  const title = info.getCell("A1");
  title.value = `Audit · ${String(audit.category).toUpperCase()}`;
  title.fill = fill(COLORS.ink);
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", indent: 1 };
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  info.getRow(1).height = 36;

  let accent = COLORS.sky;
  const section = (label, color) => {
    info.addRow([]).height = 8;
    accent = color;
    const row = info.addRow([label.toUpperCase(), ""]);
    info.mergeCells(`A${row.number}:B${row.number}`);
    row.height = 24;
    row.getCell(1).fill = fill(color);
    row.getCell(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    row.getCell(1).alignment = { vertical: "middle", indent: 1 };
    return row;
  };
  const field = (label, value, numFmt) => {
    const row = info.addRow([label, value]);
    row.height = 20;
    row.getCell(1).font = { bold: true, color: { argb: accent } };
    row.getCell(1).fill = fill(COLORS.tint[accent]);
    row.getCell(1).alignment = { vertical: "middle", indent: 1 };
    row.getCell(2).font = { size: 11, color: { argb: COLORS.ink } };
    row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
    if (numFmt) row.getCell(2).numFmt = numFmt;
    row.eachCell((cell) => { cell.border = border; });
    return row;
  };

  section("Audit details", COLORS.sky);
  field("Audit", audit.name);
  field("Case code", String(audit.category).toUpperCase());
  field("Status", audit.status === "completed" ? "Closed" : "In progress");
  field("Associate initials", audit.completedBy || audit.initials || "");
  field("Started", audit.startedAt ? new Date(audit.startedAt) : "", "mm/dd/yyyy hh:mm");
  field("Completed", audit.completedAt ? new Date(audit.completedAt) : "", "mm/dd/yyyy hh:mm");
  field("Inventory snapshot", audit.snapshot?.sourceName ?? "");

  section("Results", COLORS.emerald);
  field("Progress", { formula: `IFERROR(SUMPRODUCT((Audit!$E$2:$E$${itemLast}>Audit!$D$2:$D$${itemLast})*Audit!$D$2:$D$${itemLast}+(Audit!$E$2:$E$${itemLast}<=Audit!$D$2:$D$${itemLast})*Audit!$E$2:$E$${itemLast})/SUM(Audit!$D$2:$D$${itemLast}),0)`, result: auditProgress(audit) / 100 }, "0%");
  field("SKUs in audit", { formula: `COUNTA(Audit!$A$2:$A$${itemLast})`, result: expectedRows.length });
  field("Units expected", { formula: `SUM(Audit!$D$2:$D$${itemLast})`, result: expectedUnits });
  field("Units scanned", { formula: `SUM(Audit!$E$2:$E$${itemLast})`, result: foundUnits });
  field("Units missing", { formula: `SUMIF(Audit!$F$2:$F$${itemLast},">0")`, result: expectedRows.reduce((sum, [sku, value]) => sum + Math.max(value - (tally.scanned.get(sku) ?? 0), 0), 0) });
  field("Scans not in audit", { formula: `COUNTIF(Scanned!$I$2:$I$${scanLast},"Not in audit")`, result: audit.scans.filter((scan) => tally.status(scan) === "extra").length });

  section("Notes", COLORS.amber);
  const notes = info.addRow([audit.finalNote ?? "", ""]);
  info.mergeCells(`A${notes.number}:B${notes.number}`);
  notes.getCell(1).alignment = { vertical: "top", wrapText: true, indent: 1 };
  notes.getCell(1).fill = fill("FFFFFBEB");
  notes.height = Math.max(60, Math.ceil(String(audit.finalNote ?? "").length / 90) * 16 + 12);
  notes.getCell(1).border = border;

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename(audit, when);
  link.click();
  URL.revokeObjectURL(url);
}
