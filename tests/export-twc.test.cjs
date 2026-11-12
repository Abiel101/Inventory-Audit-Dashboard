const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");

test("TWC export preserves the old layout, formulas, counts and locations", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { createTwcWorkbook } = await server.ssrLoadModule("/src/lib/export-twc.js");
    const { scanKey } = await server.ssrLoadModule("/src/lib/utils.js");
    const compareKey = (value) => { const key = scanKey(value); return /^\d+$/.test(key) ? key.replace(/^0+(?=\d)/, "") : key; };
    const audit = {
      name: "Rings", category: "RG - Rings", status: "completed", initials: "AB",
      createdAt: "2026-01-01T12:00:00Z", completedAt: "2026-01-02T12:00:00Z",
      snapshot: { sourceName: "inventory.xlsx", takenAt: "2026-01-01T12:00:00Z" },
      items: [
        { sku: "00123", description: "Ring", style: "STYLE1", category: "RG", quantity: 3 },
        { sku: "456", description: "Other", style: "STYLE2", category: "RG", quantity: 1 },
      ],
      scans: [
        { sku: "123", qty: 2, location: "100" },
        { sku: "STYLE1", qty: 1, location: "Vault" },
        { sku: "999", qty: 1, location: "200" },
      ],
      completedLocations: ["100", "Vault"], finalNote: "Recounted", itemNotes: { 123: "Checked" },
    };
    const workbook = createTwcWorkbook(ExcelJS, audit, { compareKey, exportedAt: new Date("2026-01-03T12:00:00Z") });
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
    assert.deepEqual(loaded.worksheets.map((sheet) => sheet.name), ["Scan", "Audit"]);
    const scan = loaded.getWorksheet("Scan");
    const items = loaded.getWorksheet("Audit");
    assert.deepEqual(scan.getRow(1).values.slice(1), ["Scan UPC", "Not in TWC", "Qty Scanned/On Hand", "Style Number", "Price", "Description", "Location", "Notes", "Units Counted"]);
    assert.deepEqual(items.getRow(1).values.slice(2, 12), ["UPC", "Description", "Style Number", "Case Code", "Sale Price", "On Hand", "Sales Floor", "Scan Qty", "Variance", "Phy Qty"]);
    assert.equal(scan.getColumn(6).width, 100);
    assert.equal(items.getColumn(3).width, 63.54296875);
    assert.equal(scan.getCell("G2").value, "100");
    assert.equal(scan.getCell("A2").value, null);
    assert.equal(scan.getCell("A3").value, "00123");
    assert.equal(scan.getCell("G5").value, "Vault");
    assert.equal(scan.getCell("G7").value, "200");
    assert.equal(scan.getCell("A8").value, "999");
    assert.equal(scan.getCell("A3").note, "Checked");
    assert.equal(scan.getCell("B3").result, "-");
    assert.equal(scan.getCell("C6").result, "3/3");
    assert.equal(scan.getCell("B8").result, "Not in TWC");
    assert.match(scan.getCell("B3").formula, /COUNTIF\(Audit!/);
    assert.equal(items.getCell("I2").result, 3);
    assert.equal(items.getCell("J2").result, 0);
    assert.match(items.getCell("I2").formula, /COUNTIF\(Scan!/);
    assert.equal(items.getCell("F2").value, null);
    assert.equal(items.getCell("B1").note, "Recounted");
    assert.equal(items.getCell("L1").formula, "_xlfn.NUMBERVALUE(B1)");
    assert.ok(scan.getCell("C999").formula);
    assert.equal(scan.conditionalFormattings[0].ref, "C2:C999");
    assert.throws(() => createTwcWorkbook(ExcelJS, { ...audit, scans: [{ sku: "123", qty: 1.5 }] }, { compareKey }), /positive whole number/);
    assert.throws(() => createTwcWorkbook(ExcelJS, { ...audit, scans: [{ sku: "123", qty: 1048575, location: "100" }] }, { compareKey }), /row limit/);
    const large = createTwcWorkbook(ExcelJS, { ...audit, scans: [{ sku: "123", qty: 1000, location: "100" }] }, { compareKey });
    assert.equal(large.getWorksheet("Scan").getCell("C1002").result, "1000/3");
    assert.equal(large.getWorksheet("Scan").conditionalFormattings[0].ref, "C2:C1002");
  } finally {
    await server.close();
  }
});

test("both export choices download with the same filename and retain their own worksheets", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const originalDocument = global.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const downloads = [];
  let blob;
  global.document = { createElement: () => ({ click() { downloads.push({ filename: this.download, blob }); } }) };
  URL.createObjectURL = (value) => { blob = value; return "blob:test"; };
  URL.revokeObjectURL = () => {};
  try {
    const { exportAuditWorkbook } = await server.ssrLoadModule("/src/lib/export.js");
    const audit = {
      name: "Rings", category: "RG - Rings", status: "completed", completedBy: "AB",
      completedAt: "2026-01-02T12:00:00Z",
      items: [{ sku: "123", description: "Ring", style: "ST", quantity: 1 }],
      scans: [], completedLocations: [],
    };
    const compareKey = (value) => String(value ?? "").trim().toUpperCase();
    await exportAuditWorkbook(audit, { compareKey, format: "new" });
    await exportAuditWorkbook(audit, { compareKey, format: "twc" });
    assert.equal(downloads[0].filename, downloads[1].filename);
    for (const [index, names] of [["0", ["Audit Info", "Scanned", "Audit"]], ["1", ["Scan", "Audit"]]]) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await downloads[index].blob.arrayBuffer());
      assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), names);
    }
    await assert.rejects(exportAuditWorkbook(audit, { compareKey, format: "unknown" }), /Unknown export format/);
  } finally {
    global.document = originalDocument;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    await server.close();
  }
});

test("inventory import retains optional sale price and sales-floor quantities", async () => {
  const { createServer } = await import("vite");
  const XLSX = require("xlsx");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { readInventoryFile } = await server.ssrLoadModule("/src/lib/inventory.js");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["UPC", "Description", "Case Code", "On Hand", "Sale Price", "Sales Floor"],
      ["00123", "Ring", "RG", 3, "$1,200.50", 2],
      ["456", "Other", "RG", 1, "", ""],
    ]), "Inventory");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const { inventory } = await readInventoryFile({ name: "inventory.xlsx", arrayBuffer: async () => buffer });
    assert.equal(inventory[0].price, 1200.5);
    assert.equal(inventory[0].salesFloor, 2);
    assert.equal(inventory[1].price, null);
    assert.equal(inventory[1].salesFloor, null);
    const invalid = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(invalid, XLSX.utils.aoa_to_sheet([
      ["UPC", "Case Code", "On Hand", "Sale Price"], ["123", "RG", 1, "invalid"],
    ]), "Inventory");
    const invalidBuffer = XLSX.write(invalid, { type: "buffer", bookType: "xlsx" });
    await assert.rejects(readInventoryFile({ name: "invalid.xlsx", arrayBuffer: async () => invalidBuffer }), /Invalid sale price for SKU 123/);
  } finally {
    await server.close();
  }
});

test("exports include units counted and old audits import back", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { createTwcWorkbook } = await server.ssrLoadModule("/src/lib/export-twc.js");
    const { readAuditFile } = await server.ssrLoadModule("/src/lib/import-audit.js");
    const compareKey = (value) => String(value);
    const audit = {
      name: "Rings", category: "RG - Rings", items: [{ sku: "123", description: "Ring", style: "S1", category: "RG - Rings", quantity: 3, price: 12.5 }],
      scans: [{ sku: "123", qty: 2, location: "100" }, { sku: "999", qty: 1, location: "200" }], finalNote: "Recounted",
    };
    const workbook = createTwcWorkbook(ExcelJS, audit, { compareKey });
    assert.equal(workbook.getWorksheet("Scan").getCell("I1").value, "Units Counted");
    assert.equal(workbook.getWorksheet("Scan").getCell("I2").result, 3);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = { name: "RG - AB - 01.02.26 - 3.45 PM.xlsx", arrayBuffer: async () => buffer };
    const { audit: imported } = await readAuditFile(file);
    assert.equal(imported.category, "RG - Rings");
    assert.equal(imported.initials, "AB");
    assert.equal(imported.items[0].price, 12.5);
    assert.deepEqual(imported.scans.map(({ sku, qty, location }) => [sku, qty, location]), [["123", 2, "100"], ["999", 1, "200"]]);
    assert.equal(imported.finalNote, "Recounted");
  } finally {
    await server.close();
  }
});
