import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: Date | string): string {
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFmt.format(new Date(value));
}

export function daysSince(value: Date | string): number {
  const then = new Date(value).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** "heute" / "gestern" / "vor 5 Tagen" / Datum ab 30 Tagen. */
export function relativeDays(value: Date | string): string {
  const d = daysSince(value);
  if (d <= 0) return "heute";
  if (d === 1) return "gestern";
  if (d < 30) return `vor ${d} Tagen`;
  return formatDate(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Leitet aus einer Absenderadresse einen Kundennamen ab: erster Teil der
 * Domain, Freemail-Domains werden ausgelassen.
 */
const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.de",
  "live.com",
  "web.de",
  "gmx.de",
  "gmx.net",
  "t-online.de",
  "yahoo.com",
  "yahoo.de",
  "icloud.com",
  "me.com",
]);

export function customerFromEmail(address: string | null | undefined): string {
  if (!address) return "";
  const domain = address.split("@")[1]?.toLowerCase().trim();
  if (!domain || FREEMAIL.has(domain)) return "";
  const label = domain.split(".")[0];
  if (!label) return "";
  return label.charAt(0).toUpperCase() + label.slice(1);
}
