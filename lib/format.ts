import type { Timestamp } from "firebase/firestore";

export function timestampToDate(value?: Timestamp | null) {
  if (!value) return null;
  return value.toDate();
}

export function formatShortDate(value?: Timestamp | string | null) {
  const date = typeof value === "string" ? new Date(value) : timestampToDate(value);
  if (!date || Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDateOnly(value?: string | Timestamp | null) {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : timestampToDate(value);
  if (!date || Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function minutesBetween(start: string, end: string) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!start || !end || Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 60000));
}

export function toDateInput(value: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}
