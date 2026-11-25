// Default column visibility per table, set in Settings. A table's own saved choice (Columns menu) still wins.
const KEY = "inventory-audit-default-columns";

export const tableDefinitions = [
  { key: "scan-log", label: "Scan log", columns: [["sku", "SKU"], ["description", "Description"], ["style", "Style"], ["location", "Location"], ["case", "Case code"], ["qty", "Scanned"], ["total", "Audit total"], ["result", "Result"]] },
  { key: "audit-items", label: "Audit items", columns: [["sku", "SKU"], ["description", "Description"], ["style", "Style"], ["onHand", "On hand"], ["availableToSell", "Available to sell"], ["expected", "Expected"], ["scanned", "Scanned"], ["remaining", "Remaining"]] },
];

export const readTableDefaults = () => {
  try { const saved = JSON.parse(localStorage.getItem(KEY)); return saved && typeof saved === "object" ? saved : {}; } catch { return {}; }
};

export const writeTableDefaults = (value) => {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* applies for this session only */ }
};

// Returns a TanStack visibility map ({ id: false }) for hidden columns, or null when no default is set.
export const defaultVisibilityFor = (tableKey) => {
  const hidden = readTableDefaults()[tableKey];
  return Array.isArray(hidden) ? Object.fromEntries(hidden.map((id) => [id, false])) : null;
};
