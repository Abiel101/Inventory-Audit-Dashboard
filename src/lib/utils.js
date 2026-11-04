import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const range = (start, count) => Array.from({ length: count }, (_, index) => String(start + index));

export const defaultLocations = [
  ...range(100, 7),
  ...range(200, 9),
  ...range(300, 18),
  ...range(400, 10),
  ...range(500, 10),
  ...Array.from({ length: 12 }, (_, index) => `Understock ${index + 1}`),
  "Vault Holds",
  "Vault ICM Bin",
  "Vault Retags",
  "Vault",
  "BOPIS",
  ...["Adam", "Mandy", "Jose", "Roman", "Donovan", "Saima", "Larkin", "Virginia", "Dennis", "Roberto", "Sunita", "Christopher"].map((name) => `BA bin: ${name}`),
];

export const themes = [
  { value: "default", label: "Default", dark: false },
  { value: "tokyo-night", label: "Tokyo Night", dark: true },
  { value: "github-white", label: "GitHub White", dark: false },
  { value: "nord", label: "Nord", dark: false },
];
export const themeStorageKey = "inventory-audit-theme";

export function applyTheme(value) {
  const theme = themes.find((item) => item.value === value) ?? themes[0];
  document.documentElement.dataset.theme = theme.value;
  document.documentElement.style.colorScheme = theme.dark ? "dark" : "light";
  try { localStorage.setItem(themeStorageKey, theme.value); } catch { /* theme still applies for this page */ }
  return theme.value;
}

export function getSavedTheme() {
  try {
    const saved = localStorage.getItem(themeStorageKey);
    return themes.some((item) => item.value === saved) ? saved : "default";
  } catch { return "default"; }
}

export function dateKey(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Quantities are totalled per audit item across every location, so the same SKU
// scanned in several locations adds up against the imported quantity.
export function auditTally(audit) {
  const find = (value) => audit.items.find((item) => identifiersMatch(item.sku, value)) ?? audit.items.find((item) => identifiersMatch(item.style, value));
  const skuKey = (value) => {
    const key = scanKey(value);
    return /^\d+$/.test(key) ? key.replace(/^0+(?=\d)/, "") : key;
  };
  const expected = new Map();
  const representatives = new Map();
  audit.items.forEach((item) => {
    const normalized = skuKey(item.sku);
    const representative = representatives.get(normalized) ?? item.sku;
    representatives.set(normalized, representative);
    expected.set(representative, (expected.get(representative) ?? 0) + (Number(item.quantity) || 0));
  });
  const scanned = new Map();
  const extra = new Map();
  audit.scans.forEach((scan) => {
    const reference = find(scan.sku);
    const target = reference ? scanned : extra;
    const key = reference ? reference.sku : scan.sku;
    target.set(key, (target.get(key) ?? 0) + (Number(scan.qty) || 0));
  });
  const status = (scan) => {
    const reference = find(scan.sku);
    if (!reference) return "extra";
    const total = scanned.get(reference.sku) ?? 0;
    const need = expected.get(reference.sku) ?? 0;
    return total === need ? "match" : total > need ? "over" : "short";
  };
  return { expected, scanned, extra, status, totalFor: (scan) => { const reference = find(scan.sku); return reference ? { total: scanned.get(reference.sku) ?? 0, expected: expected.get(reference.sku) ?? 0 } : { total: extra.get(scan.sku) ?? 0, expected: null }; } };
}

export function auditProgress(audit) {
  const { expected, scanned } = auditTally(audit);
  const need = [...expected.values()].reduce((sum, value) => sum + value, 0);
  if (!need) return 0;
  const found = [...expected].reduce((sum, [sku, value]) => sum + Math.min(value, scanned.get(sku) ?? 0), 0);
  return Math.floor((found / need) * 100);
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function scanKey(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "").replace(/^\d+\.0+$/, (match) => match.replace(/\.0+$/, ""));
}

export function identifiersMatch(left, right) {
  const a = scanKey(left);
  const b = scanKey(right);
  if (!a || !b) return false;
  return a === b || (/^\d+$/.test(a) && /^\d+$/.test(b) && a.replace(/^0+(?=\d)/, "") === b.replace(/^0+(?=\d)/, ""));
}
