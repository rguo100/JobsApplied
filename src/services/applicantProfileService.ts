import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore/lite";
import { profileDb, isFirebaseConfigured } from "../firebase/config";
import type {
  ApplicantProfile,
  ApplicantProfileInput,
} from "../types/applicantProfile";
import { validateApplicantProfile } from "../utils/applicantProfileValidation";

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
  if (!isFirebaseConfigured() || !profileDb || !uid) {
    throw new Error("Firebase is not configured or user is unauthenticated.");
  }
  return profileDb;
}

export function createApplicantProfilePayload(
  input: ApplicantProfileInput,
  hasExistingProfile: boolean,
  timestamp: unknown
): Record<string, unknown> {
  const validation = validateApplicantProfile(input);
  if (!validation.valid) {
    throw new Error(Object.values(validation.errors)[0] || "Applicant profile is invalid.");
  }
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
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
  const startedAt = Date.now();
  console.info("[AppliedYet Profile] Firestore read started.");
  try {
    const snapshot = await getDoc(
      doc(firestore, "users", uid, "private", "applicantProfile")
    );
    console.info("[AppliedYet Profile] Firestore read completed.", {
      durationMs: Date.now() - startedAt,
      exists: snapshot.exists(),
    });
    return snapshot.exists() ? (snapshot.data() as ApplicantProfile) : null;
  } catch (error) {
    console.warn("[AppliedYet Profile] Firestore read failed.", {
      durationMs: Date.now() - startedAt,
      code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
    });
    throw error;
  }
}

export async function upsertApplicantProfile(
  uid: string,
  input: ApplicantProfileInput
): Promise<void> {
  const firestore = requireDb(uid);
  const ref = doc(firestore, "users", uid, "private", "applicantProfile");
  const startedAt = Date.now();
  console.info("[AppliedYet Profile] Firestore write transaction started.");
  try {
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(ref);
      transaction.set(
        ref,
        createApplicantProfilePayload(input, snapshot.exists(), serverTimestamp()),
        { merge: true }
      );
    }, { maxAttempts: 1 });
    console.info("[AppliedYet Profile] Firestore write transaction completed.", {
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.warn("[AppliedYet Profile] Firestore write transaction failed.", {
      durationMs: Date.now() - startedAt,
      code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
    });
    throw error;
  }
}
