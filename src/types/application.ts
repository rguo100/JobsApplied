import { Timestamp } from "firebase/firestore";

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
}

/**
 * Generates a deterministic Firestore document ID for an application.
 * Format: {source}_{externalJobId} (e.g. linkedin_4462326890)
 * Ensures that the same job does not create duplicate documents for the same user.
 */
export function getApplicationDocId(source: string, externalJobId: string): string {
  const cleanSource = (source || "linkedin").toLowerCase().trim();
  const cleanId = (externalJobId || "").trim();
  return `${cleanSource}_${cleanId}`;
}
