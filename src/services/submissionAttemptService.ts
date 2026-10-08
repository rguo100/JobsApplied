import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import { parseAtsJobId } from "../types/ats";
import type {
  SubmissionAttempt,
  SubmissionAttemptStatus,
  SubmissionVerificationMethod,
} from "../types/submission";

const ALLOWED_TRANSITIONS: Record<SubmissionAttemptStatus, SubmissionAttemptStatus[]> = {
  pending: ["pending", "confirmed", "failed", "uncertain"],
  failed: ["failed", "confirmed"],
  uncertain: ["uncertain", "confirmed", "failed"],
  confirmed: ["confirmed"],
};

function requireDb(uid: string) {
  if (!isFirebaseConfigured() || !db || !uid) {
    throw new Error("Firebase is not configured or user is unauthenticated.");
  }
  return db;
}

export function assertSubmissionTransition(
  current: SubmissionAttemptStatus,
  next: SubmissionAttemptStatus
): void {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid submission transition: ${current} -> ${next}.`);
  }
}

export interface CreateSubmissionAttemptInput {
  attemptId?: string;
  atsJobId: string;
  linkedInPostingIds: string[];
  userConfirmed: boolean;
}

function assertAttemptId(attemptId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(attemptId)) {
    throw new Error("Invalid submission attempt ID.");
  }
}

export async function createSubmissionAttempt(
  uid: string,
  input: CreateSubmissionAttemptInput
): Promise<string> {
  const firestore = requireDb(uid);
  const identity = parseAtsJobId(input.atsJobId);
  if (input.attemptId) assertAttemptId(input.attemptId);
  const ref = input.attemptId
    ? doc(firestore, "users", uid, "submissionAttempts", input.attemptId)
    : doc(collection(firestore, "users", uid, "submissionAttempts"));
  if (!ref.id.trim()) throw new Error("Submission attempt ID is required.");

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) {
      const existing = snapshot.data() as SubmissionAttempt;
      if (existing.atsJobId !== identity.canonicalId) {
        throw new Error("Submission attempt ID belongs to another ATS job.");
      }
      return;
    }
    const timestamp = serverTimestamp();
    transaction.set(ref, {
      attemptId: ref.id,
      atsJobId: identity.canonicalId,
      linkedInPostingIds: [...new Set(input.linkedInPostingIds.map((id) => id.trim()).filter(Boolean))],
      status: "pending",
      userConfirmedAt: input.userConfirmed ? timestamp : null,
      submitClickedAt: null,
      verification: null,
      failureCode: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
  return ref.id;
}

export async function getSubmissionAttempt(
  uid: string,
  attemptId: string
): Promise<SubmissionAttempt | null> {
  const firestore = requireDb(uid);
  assertAttemptId(attemptId);
  const snapshot = await getDoc(
    doc(firestore, "users", uid, "submissionAttempts", attemptId)
  );
  return snapshot.exists() ? (snapshot.data() as SubmissionAttempt) : null;
}

async function updateAttempt(
  uid: string,
  attemptId: string,
  nextStatus: SubmissionAttemptStatus,
  updates: Record<string, unknown>
): Promise<void> {
  const firestore = requireDb(uid);
  assertAttemptId(attemptId);
  const ref = doc(firestore, "users", uid, "submissionAttempts", attemptId);

  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Submission attempt does not exist.");
    const current = snapshot.data() as SubmissionAttempt;
    assertSubmissionTransition(current.status, nextStatus);
    if (current.status === "confirmed" && nextStatus === "confirmed") return;
    const transitionUpdates = { ...updates };
    if (nextStatus === "confirmed" && !current.userConfirmedAt) {
      transitionUpdates.userConfirmedAt = serverTimestamp();
    }
    transaction.update(ref, {
      ...transitionUpdates,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function recordSubmissionClick(uid: string, attemptId: string): Promise<void> {
  const firestore = requireDb(uid);
  assertAttemptId(attemptId);
  const ref = doc(firestore, "users", uid, "submissionAttempts", attemptId);
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Submission attempt does not exist.");
    const current = snapshot.data() as SubmissionAttempt;
    if (current.status === "confirmed" || current.submitClickedAt) return;
    transaction.update(ref, { submitClickedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

export async function markSubmissionAttemptFailed(
  uid: string,
  attemptId: string,
  outcome: "failed" | "uncertain",
  failureCode: string
): Promise<void> {
  const code = failureCode.trim();
  if (!code) throw new Error("Failure code is required.");
  await updateAttempt(uid, attemptId, outcome, {
    verification: null,
    failureCode: code,
  });
}

export async function confirmSubmissionAttempt(
  uid: string,
  attemptId: string,
  verification: { method: SubmissionVerificationMethod; evidenceCode?: string | null }
): Promise<void> {
  await updateAttempt(uid, attemptId, "confirmed", {
    verification: {
      method: verification.method,
      evidenceCode: verification.evidenceCode?.trim() || null,
      verifiedAt: serverTimestamp(),
    },
    failureCode: null,
  });
}
