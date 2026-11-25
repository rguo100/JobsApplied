import { Timestamp } from "firebase/firestore";
import type { AtsProvider } from "./ats";
import type { SubmissionSummary } from "./submission";

export type ApplicationStatus =
  | "applied"
  | "saved"
  | "interview"
  | "rejected"
  | "offer";

export interface Application {
  source: "linkedin" | "greenhouse" | "web";
  externalJobId: string;
  company: string;
  title: string;
  location: string;
  url: string;

  status: ApplicationStatus;

  appliedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // Optional V1.1 linkage preserves compatibility with existing Firestore documents.
  trackingVersion?: number;
  atsJobId?: string;
  atsProvider?: AtsProvider;
  atsUrl?: string;
  atsDiscoveredAt?: Timestamp;
  submissionSummary?: SubmissionSummary;
}

/**
 * Structured application identity representing source and external job ID.
 */
export interface ApplicationIdentity {
  source: "linkedin" | "greenhouse" | "web";
  externalJobId: string;
  conceptualId: string; // e.g. "linkedin:3981726450"
  documentId: string;   // e.g. "linkedin_3981726450"
}

/**
 * Returns the durable identity for a manually tracked web job. Hash fragments
 * are page-local navigation and must not create a second application record;
 * the query string is intentionally preserved because many job sites encode a
 * job identifier there.
 */
export function normalizeWebJobUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("A job URL must use HTTP or HTTPS.");
  }
  url.hash = "";
  return url.href;
}

/**
 * Generates deterministic application identity using source + externalJobId.
 * Sanitizes forbidden Firestore characters (such as slashes) to ensure a safe,
 * collision-resistant document ID.
 */
export function getApplicationIdentity(
  source: string = "linkedin",
  externalJobId: string
): ApplicationIdentity {
  const requestedSource = (source || "linkedin").toLowerCase().trim();
  const cleanSource: ApplicationIdentity["source"] = requestedSource === "greenhouse" ? "greenhouse" : requestedSource === "web" ? "web" : "linkedin";
  const rawId = (externalJobId || "").trim();
  const cleanId = cleanSource === "web" ? normalizeWebJobUrl(rawId) : rawId;
  // Existing LinkedIn and Greenhouse identifiers retain their historical
  // document IDs. Web identities encode the complete normalized URL so that
  // punctuation in query parameters cannot collapse two distinct job pages.
  const sanitizedId = cleanSource === "web"
    ? encodeURIComponent(normalizeWebJobUrl(cleanId))
    : cleanId.replace(/[^a-zA-Z0-9_-]/g, "_");

  return {
    source: cleanSource,
    externalJobId: cleanId,
    conceptualId: `${cleanSource}:${cleanId}`,
    documentId: `${cleanSource}_${sanitizedId}`,
  };
}

/**
 * Generates a deterministic Firestore document ID for an application.
 * Format: {source}_{externalJobId} (e.g. linkedin_3981726450)
 * Ensures that the same job does not create duplicate documents for the same user.
 */
export function getApplicationDocId(source: string, externalJobId: string): string {
  return getApplicationIdentity(source, externalJobId).documentId;
}
