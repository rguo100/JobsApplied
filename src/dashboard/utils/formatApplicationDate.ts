import { Timestamp } from "firebase/firestore";

/**
 * Formats a Firestore Timestamp, Date, or numeric timestamp into a human-readable local date string
 * (e.g., 'Sep 23, 2026').
 * Safely returns '—' for null, undefined, or unresolvable timestamps.
 */
export function formatApplicationDate(
  timestamp?: Timestamp | Date | number | { seconds: number; nanoseconds?: number } | null
): string {
  if (!timestamp) {
    return "—";
  }

  let date: Date | null = null;

  try {
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof (timestamp as Timestamp).toDate === "function") {
      date = (timestamp as Timestamp).toDate();
    } else if (typeof timestamp === "number") {
      date = new Date(timestamp);
    } else if (typeof (timestamp as any).seconds === "number") {
      date = new Date((timestamp as any).seconds * 1000);
    }
  } catch {
    return "—";
  }

  if (!date || isNaN(date.getTime())) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return "—";
  }
}
