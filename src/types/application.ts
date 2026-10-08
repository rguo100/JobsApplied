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
  source: "linkedin";
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
  source: "linkedin";
  externalJobId: string;
  conceptualId: string; // e.g. "linkedin:3981726450"
  documentId: string;   // e.g. "linkedin_3981726450"
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
  const cleanSource = (source || "linkedin").toLowerCase().trim() === "linkedin" ? "linkedin" : "linkedin";
  const cleanId = (externalJobId || "").trim();
  // Sanitize characters that could disrupt Firestore pathing (slashes, whitespace, etc.)
  const sanitizedId = cleanId.replace(/[^a-zA-Z0-9_-]/g, "_");

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
