import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";
import type { ApplicantProfile, ApplicantProfileInput } from "../types/applicantProfile";

const OPTIONAL_FIELDS = [
  "phone",
  "city",
  "region",
  "country",
  "linkedinUrl",
  "githubUrl",
  "portfolioUrl",
] as const;

function requireDb(uid: string) {
  if (!isFirebaseConfigured() || !db || !uid) {
    throw new Error("Firebase is not configured or user is unauthenticated.");
  }
  return db;
}

export function createApplicantProfilePayload(
  input: ApplicantProfileInput,
  hasExistingProfile: boolean,
  timestamp: unknown
): Record<string, unknown> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  if (!firstName || !lastName || !email) {
    throw new Error("First name, last name, and email are required.");
  }
  const payload: Record<string, unknown> = {
    firstName,
    lastName,
    email,
    updatedAt: timestamp,
  };
  if (!hasExistingProfile) payload.createdAt = timestamp;
  for (const field of OPTIONAL_FIELDS) {
    const value = input[field]?.trim();
    if (value) payload[field] = value;
  }
  return payload;
}

export async function getApplicantProfile(uid: string): Promise<ApplicantProfile | null> {
  const firestore = requireDb(uid);
  const snapshot = await getDoc(
    doc(firestore, "users", uid, "private", "applicantProfile")
  );
  return snapshot.exists() ? (snapshot.data() as ApplicantProfile) : null;
}

export async function upsertApplicantProfile(
  uid: string,
  input: ApplicantProfileInput
): Promise<void> {
  const firestore = requireDb(uid);
  const ref = doc(firestore, "users", uid, "private", "applicantProfile");
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    transaction.set(
      ref,
      createApplicantProfilePayload(input, snapshot.exists(), serverTimestamp()),
      { merge: true }
    );
  });
}
