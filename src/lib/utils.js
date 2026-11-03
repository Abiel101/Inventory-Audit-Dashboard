import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
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
