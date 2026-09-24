import { Application, ApplicationStatus } from "../../types/application";
import { Timestamp } from "firebase/firestore";

export type SortOption = "newest" | "oldest" | "company_asc";

export interface DashboardFilterState {
  searchQuery: string;
  statusFilter: ApplicationStatus | "all";
  companyFilter: string; // "all" or specific company name
  sortBy: SortOption;
}

export interface SummaryCounts {
  total: number;
  applied: number;
  interview: number;
  rejected: number;
  offer: number;
}

/**
 * Extracts a comparable timestamp in milliseconds from an application record.
 * Prioritizes `appliedAt`, falling back to `createdAt` or 0 if neither is set.
 */
export function getApplicationTimestampMillis(
  app: Application | { appliedAt?: any; createdAt?: any }
): number {
  const ts = app.appliedAt || app.createdAt;
  if (!ts) return 0;

  try {
    if (typeof (ts as Timestamp).toMillis === "function") {
      return (ts as Timestamp).toMillis();
    }
    if (typeof (ts as Timestamp).toDate === "function") {
      return (ts as Timestamp).toDate().getTime();
    }
    if (ts instanceof Date) {
      return ts.getTime();
    }
    if (typeof (ts as any).seconds === "number") {
      const nanos = typeof (ts as any).nanoseconds === "number" ? (ts as any).nanoseconds : 0;
      return (ts as any).seconds * 1000 + Math.floor(nanos / 1e6);
    }
    if (typeof ts === "number") {
      return ts;
    }
  } catch {
    return 0;
  }

  return 0;
}

/**
 * Dynamically extracts all unique company names from existing applications,
 * trimmed, non-empty, and sorted alphabetically (A-Z).
 * Never hardcodes company names.
 */
export function extractUniqueCompanies(applications: Application[]): string[] {
  const companySet = new Set<string>();

  for (const app of applications) {
    const raw = app.company;
    if (raw && typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        companySet.add(trimmed);
      }
    }
  }

  return Array.from(companySet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

/**
 * Computes summary counts across ALL user applications.
 * Filters and search queries must NOT alter these overall counts.
 */
export function calculateSummaryCounts(applications: Application[]): SummaryCounts {
  let applied = 0;
  let interview = 0;
  let rejected = 0;
  let offer = 0;

  for (const app of applications) {
    switch (app.status) {
      case "applied":
        applied++;
        break;
      case "interview":
        interview++;
        break;
      case "rejected":
        rejected++;
        break;
      case "offer":
        offer++;
        break;
      default:
        break;
    }
  }

  return {
    total: applications.length,
    applied,
    interview,
    rejected,
    offer,
  };
}

/**
 * Filters and sorts applications based on user criteria:
 * - Search query (company or job title, case-insensitive, whitespace ignored)
 * - Status filter (all, applied, interview, rejected, offer)
 * - Company filter (all, or specific company name)
 * - Sort order (newest, oldest, company_asc)
 */
export function filterAndSortApplications(
  applications: Application[],
  filterState: DashboardFilterState
): Application[] {
  const normalizedQuery = (filterState.searchQuery || "").trim().toLowerCase();
  const normalizedStatus = filterState.statusFilter;
  const normalizedCompany = (filterState.companyFilter || "all").trim();

  // 1. Filter applications
  const filtered = applications.filter((app) => {
    // Search filter (company or title)
    if (normalizedQuery.length > 0) {
      const companyMatch = (app.company || "").toLowerCase().includes(normalizedQuery);
      const titleMatch = (app.title || "").toLowerCase().includes(normalizedQuery);
      if (!companyMatch && !titleMatch) {
        return false;
      }
    }

    // Status filter
    if (normalizedStatus !== "all") {
      if (app.status !== normalizedStatus) {
        return false;
      }
    }

    // Company filter
    if (normalizedCompany !== "all") {
      const appCompany = (app.company || "").trim();
      if (appCompany.toLowerCase() !== normalizedCompany.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  // 2. Sort applications
  return filtered.sort((a, b) => {
    if (filterState.sortBy === "newest") {
      const timeA = getApplicationTimestampMillis(a);
      const timeB = getApplicationTimestampMillis(b);
      if (timeB !== timeA) return timeB - timeA;
      return (a.company || "").localeCompare(b.company || "", undefined, { sensitivity: "base" });
    }

    if (filterState.sortBy === "oldest") {
      const timeA = getApplicationTimestampMillis(a);
      const timeB = getApplicationTimestampMillis(b);
      if (timeA !== timeB) return timeA - timeB;
      return (a.company || "").localeCompare(b.company || "", undefined, { sensitivity: "base" });
    }

    if (filterState.sortBy === "company_asc") {
      const compA = (a.company || "").trim();
      const compB = (b.company || "").trim();
      const compComparison = compA.localeCompare(compB, undefined, { sensitivity: "base" });
      if (compComparison !== 0) return compComparison;
      // Secondary sort: newest first
      const timeA = getApplicationTimestampMillis(a);
      const timeB = getApplicationTimestampMillis(b);
      return timeB - timeA;
    }

    return 0;
  });
}

/**
 * Sanitizes Firestore or auth errors into clear, friendly messages without
 * exposing raw Firebase internals, code paths, or error objects to end users.
 */
export function sanitizeDashboardErrorMessage(error: unknown): string {
  if (!error) {
    return "An unexpected error occurred while synchronizing your applications.";
  }

  const rawMsg =
    typeof error === "string"
      ? error
      : (error as any)?.message || String(error);

  const lower = rawMsg.toLowerCase();

  if (lower.includes("permission-denied") || lower.includes("insufficient permissions")) {
    return "You do not have permission to access these applications. Please ensure you are signed in to the correct account.";
  }

  if (lower.includes("unauthenticated") || lower.includes("auth/")) {
    return "Your session has expired or authentication failed. Please sign in again.";
  }

  if (lower.includes("network") || lower.includes("unavailable") || lower.includes("failed to fetch")) {
    return "Unable to connect to the server. Please check your internet connection and try again.";
  }

  if (lower.includes("quota") || lower.includes("resource-exhausted")) {
    return "Application service is temporarily experiencing high load. Please try again shortly.";
  }

  return "Unable to synchronize applications. Please try again.";
}
