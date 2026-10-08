import type { Timestamp } from "firebase/firestore";

export type SubmissionAttemptStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "uncertain";

export type SubmissionVerificationMethod =
  | "success_dom"
  | "success_url"
  | "manual";

export interface SubmissionVerification {
  method: SubmissionVerificationMethod;
  evidenceCode: string | null;
  verifiedAt: Timestamp;
}

/**
 * One attempt to submit one canonical ATS job. `attemptId` is unique even when
 * several attempts share the same atsJobId. A click alone is never verification.
 */
interface SubmissionAttemptBase {
  attemptId: string;
  atsJobId: string;
  linkedInPostingIds: string[];
  userConfirmedAt: Timestamp | null;
  submitClickedAt: Timestamp | null;
  failureCode: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PendingSubmissionAttempt extends SubmissionAttemptBase {
  status: "pending";
  verification: null;
}

export interface ConfirmedSubmissionAttempt extends SubmissionAttemptBase {
  status: "confirmed";
  userConfirmedAt: Timestamp;
  submitClickedAt: Timestamp | null;
  verification: SubmissionVerification;
  failureCode: null;
}

export interface UnsuccessfulSubmissionAttempt extends SubmissionAttemptBase {
  status: "failed" | "uncertain";
  verification: null;
}

export type SubmissionAttempt =
  | PendingSubmissionAttempt
  | ConfirmedSubmissionAttempt
  | UnsuccessfulSubmissionAttempt;

export interface SubmissionSummary {
  confirmedCount: number;
  latestAttemptId: string | null;
  latestOutcome: SubmissionAttemptStatus | null;
  latestSubmittedAt: Timestamp | null;
}
