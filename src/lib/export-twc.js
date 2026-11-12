import { identifiersMatch } from "@/lib/utils";

const thin = { style: "thin", color: { indexed: 64 } };
const border = { left: thin, right: thin, top: thin, bottom: thin };
const font = { name: "Calibri", family: 2, scheme: "minor", size: 11, color: { theme: 1 } };
const headerFont = { ...font, bold: true, size: 12 };
const auditFont = { name: "Arial", size: 9, color: { argb: "FF000000" } };
const numberFormat = "[$-10409]#,##0;-#,##0";

export const LOCATION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFDB58" } };
export const NOTE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBDD7EE" } };

// Describes where a scanned item belongs when it is not part of this audit's case code.
export function caseNote(audit, scan, caseFor) {
  if (audit.items.some((item) => identifiersMatch(item.sku, scan.sku) || (item.style && identifiersMatch(item.style, scan.sku)))) return "";
  const category = caseFor?.(scan);
  if (!category) return "Not in any inventory case";
  if (category === "(BLANK)") return "Blank case code";
  return `In case ${String(category).split(/\s*[-–—]\s*/)[0].trim().toUpperCase()}`;
}

export function createTwcWorkbook(ExcelJS, audit, { compareKey, caseFor }) {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  const scanSheet = workbook.addWorksheet("Scan", { properties: { defaultRowHeight: 14.5 } });
  const auditSheet = workbook.addWorksheet("Audit");
  scanSheet.columns = [16.81640625, 15, 23.7265625, 20.26953125, 10.81640625, 100, 22, 60, 18].map((width) => ({ width }));
  auditSheet.columns = [2.54296875, 15.453125, 63.54296875, 20.1796875, 23.54296875, 14.453125, 8.54296875, 10.54296875, 8.54296875, 8.7265625, 7.81640625, 28.81640625].map((width) => ({ width }));
  scanSheet.addRow(["Scan UPC", "Not in TWC", "Qty Scanned/On Hand", "Style Number", "Price", "Description"]);
  auditSheet.addRow(["", "UPC", "Description", "Style Number", "Case Code", "Sale Price", "On Hand", "Sales Floor", "Scan Qty", "Variance", "Phy Qty"]);
  scanSheet.getRow(1).height = 15.5;
  scanSheet.getCell("G1").value = "Location";
  scanSheet.getCell("H1").value = "Notes";
  scanSheet.getCell("I1").value = "Units Counted";
  for (let col = 1; col <= 9; col++) {
    const cell = scanSheet.getRow(1).getCell(col);
    cell.font = headerFont;
    cell.border = border;
    cell.alignment = { horizontal: "center" };
  }
  for (let col = 2; col <= 11; col++) {
    const cell = auditSheet.getRow(1).getCell(col);
    cell.font = headerFont;
    cell.border = border;
    cell.alignment = { horizontal: col >= 3 && col <= 5 ? "center" : "left", vertical: "middle" };
  }
  auditSheet.getCell("L1").value = { formula: "_xlfn.NUMBERVALUE(B1)", result: { error: "#VALUE!" } };
  auditSheet.getCell("L1").numFmt = "0";
  scanSheet.autoFilter = "A1:H1";
  auditSheet.autoFilter = `A1:K${Math.max(1, audit.items.length + 1)}`;

  const representatives = new Map();
  audit.items.forEach((item) => {
    const key = compareKey(item.sku);
    if (!representatives.has(key)) representatives.set(key, String(item.sku ?? "").trim());
  });
  const findItem = (sku) => audit.items.find((item) => identifiersMatch(item.sku, sku)) ?? audit.items.find((item) => identifiersMatch(item.style, sku));
  const scans = audit.scans.map((scan) => {
    const qty = Number(scan.qty);
    if (!Number.isSafeInteger(qty) || qty < 1) throw new Error("TWC export requires each scan quantity to be a positive whole number.");
    const item = findItem(scan.sku);
    return { scan, qty, item, sku: item ? representatives.get(compareKey(item.sku)) : String(scan.sku ?? "").trim() };
  });
  const counts = new Map();
  scans.forEach(({ sku, qty }) => counts.set(compareKey(sku), (counts.get(compareKey(sku)) ?? 0) + qty));
  const entries = [];
  let lastLocation;
  scans.forEach((entry) => {
    const location = entry.scan.location ?? "";
    if (entries.length + entry.qty + (location !== lastLocation ? 1 : 0) > 1048575) {
      throw new Error("TWC export exceeds Excel's worksheet row limit.");
    }
    if (location !== lastLocation) {
      entries.push({ location });
      lastLocation = location;
    }
    for (let unit = 0; unit < entry.qty; unit++) entries.push(entry);
  });
  const lastAudit = Math.max(999, audit.items.length + 1);
  const lastScan = Math.max(999, entries.length + 1);
  const running = new Map();
  for (let n = 2; n <= lastScan; n++) {
    const entry = entries[n - 2];
    const row = scanSheet.getRow(n);
    const sku = entry?.sku;
    const item = entry?.item;
    if (sku !== undefined) {
      row.getCell(1).value = sku;
      const key = compareKey(sku);
      running.set(key, (running.get(key) ?? 0) + 1);
      const note = entry.scan.notes || audit.itemNotes?.[key];
      if (note) row.getCell(1).note = String(note);
      const side = [caseNote(audit, entry.scan, caseFor), note].filter(Boolean).join(" · ");
      if (side) {
        const noteCell = row.getCell(8);
        noteCell.value = side;
        noteCell.fill = NOTE_FILL;
        noteCell.font = { ...font, color: { argb: "FF1F3864" } };
      }
    } else if (entry?.location) {
      const locationCell = row.getCell(7);
      locationCell.value = entry.location;
      locationCell.fill = LOCATION_FILL;
      locationCell.font = { ...font, bold: true };
    }
    for (let col = 1; col <= 6; col++) {
      const cell = row.getCell(col);
      cell.font = font;
      cell.alignment = { horizontal: "center" };
    }
    row.getCell(1).numFmt = "@";
    const match = `MATCH(A${n}&"",Audit!$B$2:$B$${lastAudit},0)`;
    row.getCell(2).value = { formula: `IF(COUNTIF(Audit!$B$1:$B$${lastAudit},$A${n})>0,"-","Not in TWC")`, result: item ? "-" : "Not in TWC" };
    row.getCell(3).value = { formula: `IF($A${n}="","",COUNTIF($A$2:$A${n},$A${n})&"/"&IFERROR(INDEX(Audit!$G$2:$G$${lastAudit},${match}),0))`, result: sku === undefined ? "" : `${running.get(compareKey(sku))}/${Number(item?.quantity) || 0}` };
    row.getCell(4).value = { formula: `IFERROR(INDEX(Audit!$D$2:$D$${lastAudit},${match}),"Not Found")`, result: item ? (item.style || "") : "Not Found" };
    row.getCell(5).value = { formula: `IFERROR(INDEX(Audit!$F$2:$F$${lastAudit},${match}),"-")`, result: item ? (item.price ?? 0) : "-" };
    row.getCell(6).value = { formula: `IFERROR(INDEX(Audit!$C$2:$C$${lastAudit},${match}),"-")`, result: item ? (item.description || "") : "-" };
  }
  const unitsCell = scanSheet.getCell("I2");
  unitsCell.value = { formula: `COUNTA($A$2:$A$${lastScan})`, result: scans.reduce((sum, { qty }) => sum + qty, 0) };
  unitsCell.font = font;
  unitsCell.alignment = { horizontal: "center" };
  scanSheet.addConditionalFormatting({
    ref: `C2:C${lastScan}`,
    rules: [
      { type: "expression", formulae: ['IFERROR(VALUE(LEFT($C2,FIND("/",$C2)-1))=VALUE(MID($C2,FIND("/",$C2)+1,10)),FALSE)'], style: { fill: { type: "pattern", pattern: "solid", fgColor: { theme: 9, tint: 0.3999450666829432 } } } },
      { type: "expression", formulae: ['IFERROR(VALUE(LEFT($C2,FIND("/",$C2)-1))>VALUE(MID($C2,FIND("/",$C2)+1,10)),FALSE)'], style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } } } },
    ],
  });

  audit.items.forEach((item, index) => {
    const n = index + 2;
    const sku = representatives.get(compareKey(item.sku));
    const count = counts.get(compareKey(sku)) ?? 0;
    const row = auditSheet.getRow(n);
    [sku, item.description ?? "", item.style ?? "", item.category || "(BLANK)", item.price ?? null, item.quantity ?? 0, item.salesFloor ?? null].forEach((value, i) => { row.getCell(i + 2).value = value; });
    for (let col = 2; col <= 11; col++) {
      const cell = row.getCell(col);
      cell.border = border;
      cell.font = col <= 8 ? auditFont : font;
      cell.alignment = col <= 8
        ? { horizontal: col >= 6 ? "right" : "left", vertical: "top", wrapText: true }
        : { horizontal: "center", vertical: "middle" };
      if (col >= 6 && col <= 8 || col === 10) cell.numFmt = numberFormat;
    }
    row.getCell(2).numFmt = "@";
    row.getCell(9).value = { formula: `IF(B${n}="","",COUNTIF(Scan!$A:$A,B${n}))`, result: count };
    row.getCell(10).value = { formula: `IF(B${n}="","",I${n}-G${n})`, result: count - (Number(item.quantity) || 0) };
    row.getCell(12).value = { formula: `IF(LEN(B${n})>15,B${n},IFERROR(VALUE(B${n}),B${n}))`, result: /^\d{1,15}$/.test(sku) ? Number(sku) : sku };
  });
  const notes = audit.finalNote ?? audit.auditNotes ?? audit.liveNotes;
  if (notes) auditSheet.getCell("B1").note = String(notes);
  return workbook;
}
