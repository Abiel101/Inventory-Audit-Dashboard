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

export function auditProgress(audit) {
  if (!audit.items.length) return 0;
  const scanned = new Set(audit.scans.filter((scan) => audit.items.some((item) => item.sku === scan.sku)).map((scan) => scan.sku));
  return Math.round((scanned.size / audit.items.length) * 100);
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
