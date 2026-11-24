import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore/lite";
import { auth, isFirebaseConfigured, profileDb } from "../firebase/config";
import { parseAtsJobId } from "../types/ats";
import type {
  ApplicationMemory,
  ApplicationMemoryAnswerUpdateOptions,
  ApplicationMemoryDraftInput,
  ResumeReference,
  SavedApplicationAnswer,
} from "../types/applicationMemory";
import { APPLICATION_MEMORY_SCHEMA_VERSION } from "../types/applicationMemory";
import {
  assertSafeRemovalFieldKeys,
  validateAndNormalizeAnswers,
  validateAndNormalizeResumeReference,
  validateApplicationMemoryInput,
} from "../utils/applicationMemoryValidation";

async function requireContext() {
  if (!isFirebaseConfigured() || !auth || !profileDb) throw new Error("Firebase is not configured.");
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("User is unauthenticated.");
  return { firestore: profileDb, uid: auth.currentUser.uid };
}

export function mergeApplicationMemoryAnswers(existing: SavedApplicationAnswer[], incoming: SavedApplicationAnswer[], removals: string[] = []): SavedApplicationAnswer[] {
  const byKey = new Map(existing.map((answer) => [answer.fieldKey, answer]));
  for (const fieldKey of removals) byKey.delete(fieldKey);
  for (const answer of incoming) byKey.set(answer.fieldKey, answer);
  return validateAndNormalizeAnswers([...byKey.values()]);
}

export function createApplicationMemoryPayload(
  input: ApplicationMemoryDraftInput,
  existing: ApplicationMemory | null,
  timestamp: unknown,
): Record<string, unknown> {
  const normalized = validateApplicationMemoryInput(input);
  const identity = parseAtsJobId(normalized.atsJobId);
  if (existing && existing.atsJobId !== identity.canonicalId) throw new Error("Application memory belongs to another ATS job.");
  return {
    schemaVersion: APPLICATION_MEMORY_SCHEMA_VERSION,
    atsJobId: identity.canonicalId,
    provider: identity.provider,
    canonicalUrl: normalized.canonicalUrl,
    status: "draft",
    answers: normalized.answers === undefined
      ? existing?.answers || []
      : mergeApplicationMemoryAnswers(existing?.answers || [], normalized.answers),
    resume: normalized.resume === undefined ? existing?.resume ?? null : normalized.resume,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

export async function getApplicationMemory(atsJobId: string): Promise<ApplicationMemory | null> {
  const identity = parseAtsJobId(atsJobId);
  const { firestore, uid } = await requireContext();
  const snapshot = await getDoc(doc(firestore, "users", uid, "applicationMemories", identity.documentId));
  if (!snapshot.exists()) return null;
  const memory = snapshot.data() as ApplicationMemory;
  if (memory.atsJobId !== identity.canonicalId) throw new Error("Stored application memory identity is invalid.");
  return memory;
}

export async function createApplicationMemoryDraft(input: ApplicationMemoryDraftInput): Promise<void> {
  const normalized = validateApplicationMemoryInput(input);
  const identity = parseAtsJobId(normalized.atsJobId);
  const { firestore, uid } = await requireContext();
  const ref = doc(firestore, "users", uid, "applicationMemories", identity.documentId);
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) return;
    transaction.set(ref, createApplicationMemoryPayload(normalized, null, serverTimestamp()));
  }, { maxAttempts: 1 });
}

export async function upsertApplicationMemoryDraft(input: ApplicationMemoryDraftInput): Promise<void> {
  const normalized = validateApplicationMemoryInput(input);
  const identity = parseAtsJobId(normalized.atsJobId);
  const { firestore, uid } = await requireContext();
  const ref = doc(firestore, "users", uid, "applicationMemories", identity.documentId);
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists() ? snapshot.data() as ApplicationMemory : null;
    transaction.set(ref, createApplicationMemoryPayload(normalized, existing, serverTimestamp()));
  }, { maxAttempts: 1 });
}

export async function updateApplicationMemoryAnswers(
  atsJobId: string,
  answers: SavedApplicationAnswer[],
  options: ApplicationMemoryAnswerUpdateOptions = {},
): Promise<void> {
  const identity = parseAtsJobId(atsJobId);
  const incoming = validateAndNormalizeAnswers(answers);
  const removals = assertSafeRemovalFieldKeys(options.removeFieldKeys || []);
  const { firestore, uid } = await requireContext();
  const ref = doc(firestore, "users", uid, "applicationMemories", identity.documentId);
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Application memory draft does not exist.");
    const existing = snapshot.data() as ApplicationMemory;
    if (existing.atsJobId !== identity.canonicalId) throw new Error("Application memory belongs to another ATS job.");
    transaction.update(ref, {
      answers: mergeApplicationMemoryAnswers(existing.answers, incoming, removals),
      updatedAt: serverTimestamp(),
    });
  }, { maxAttempts: 1 });
}

export async function updateApplicationMemoryResume(
  atsJobId: string,
  resumeReference: ResumeReference | null,
): Promise<void> {
  const identity = parseAtsJobId(atsJobId);
  const resume = resumeReference === null ? null : validateAndNormalizeResumeReference(resumeReference);
  const { firestore, uid } = await requireContext();
  const ref = doc(firestore, "users", uid, "applicationMemories", identity.documentId);
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Application memory draft does not exist.");
    const existing = snapshot.data() as ApplicationMemory;
    if (existing.atsJobId !== identity.canonicalId) throw new Error("Application memory belongs to another ATS job.");
    transaction.update(ref, { resume, updatedAt: serverTimestamp() });
  }, { maxAttempts: 1 });
}
