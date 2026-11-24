import { collection, deleteField, doc, getDoc, getDocs, runTransaction, serverTimestamp } from "firebase/firestore/lite";
import { auth, isFirebaseConfigured, profileDb } from "../firebase/config";
import { getAtsJobDocumentId, parseAtsJobId } from "../types/ats";
import type { ApplicationMemory, ApplicationMemoryAnswerV2, ApplicationMemoryAnswerV2Input, ApplicationMemoryAnswerUpdateOptions, ApplicationMemoryDocument, ApplicationMemoryDraftInput, ApplicationMemoryV1, ApplicationMemoryV2, ApplicationMemoryV2ParentInput, ResumeReference, SavedApplicationAnswer } from "../types/applicationMemory";
import { APPLICATION_MEMORY_ANSWER_V2_SCHEMA_VERSION, APPLICATION_MEMORY_SCHEMA_VERSION, APPLICATION_MEMORY_V2_SCHEMA_VERSION } from "../types/applicationMemory";
import { validateAndNormalizeAnswers, validateAndNormalizeApplicationMemoryAnswerV2, validateAndNormalizeApplicationMemoryFieldKey, validateAndNormalizeApplicationMemoryV2Parent, validateAndNormalizeResumeReference, validateApplicationMemoryInput } from "../utils/applicationMemoryValidation";

export const APPLICATION_MEMORY_V2_SOFT_ANSWER_LIMIT = 50;
export const APPLICATION_MEMORY_V2_DEFAULT_CHUNK_SIZE = 10;

export type ApplicationMemoryRepositoryErrorCode =
  | "authentication-required" | "missing-parent" | "legacy-read-only"
  | "unsupported-schema" | "answer-conflict" | "expected-answer-missing"
  | "unexpected-existing-answer" | "soft-answer-limit" | "validation" | "partial-completion";

export class ApplicationMemoryRepositoryError extends Error {
  constructor(public readonly code: ApplicationMemoryRepositoryErrorCode, message: string, public readonly completedFieldKeys: string[] = []) {
    super(message);
    this.name = "ApplicationMemoryRepositoryError";
  }
}

export interface AnswerConcurrencyExpectation {
  expectAbsent?: boolean;
  expectedRevision?: number;
  expectedCreatedAt?: import("firebase/firestore").Timestamp;
}

export interface ApplicationMemoryAnswerWriteInput {
  answer: ApplicationMemoryAnswerV2Input;
  expectation: AnswerConcurrencyExpectation;
}

export interface SaveApplicationMemoryAnswersOptions { chunkSize?: number; }

type RepositoryTestContext = {
  firestore: NonNullable<typeof profileDb>;
  uid: string;
  firestoreEmulatorHost: string;
};
let repositoryTestContext: RepositoryTestContext | null = null;

function testProcessEnvironment(): Record<string, string | undefined> | null {
  const processLike = (globalThis as unknown as {
    process?: { versions?: { node?: string }; env?: Record<string, string | undefined> };
  }).process;
  if (typeof window !== "undefined" || !processLike?.versions?.node) return null;
  return processLike.env || null;
}

function isLoopbackEndpoint(value: string | undefined): value is string {
  if (!value) return false;
  const host = value.replace(/^https?:\/\//, "").split(":")[0]?.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/** Test harness only: accepts a Node-local, explicitly configured Emulator client. */
export function setApplicationMemoryRepositoryTestContext(context: RepositoryTestContext | null): void {
  if (context === null) {
    repositoryTestContext = null;
    return;
  }
  const env = testProcessEnvironment();
  const configuredFirestore = env?.FIRESTORE_EMULATOR_HOST;
  const configuredAuth = env?.FIREBASE_AUTH_EMULATOR_HOST;
  if (!env || !isLoopbackEndpoint(configuredFirestore) || !isLoopbackEndpoint(configuredAuth)
    || context.firestoreEmulatorHost !== configuredFirestore) {
    throw new ApplicationMemoryRepositoryError(
      "validation",
      "Repository test context is permitted only for Node-based local Firebase Emulators.",
    );
  }
  repositoryTestContext = context;
}

async function requireContext() {
  if (repositoryTestContext) return repositoryTestContext;
  if (!isFirebaseConfigured() || !auth || !profileDb) throw new ApplicationMemoryRepositoryError("authentication-required", "Firebase is not configured.");
  await auth.authStateReady();
  if (!auth.currentUser) throw new ApplicationMemoryRepositoryError("authentication-required", "User is unauthenticated.");
  return { firestore: profileDb, uid: auth.currentUser.uid };
}

function timestampsEqual(left: import("firebase/firestore").Timestamp, right: import("firebase/firestore").Timestamp): boolean {
  return left.seconds === right.seconds && left.nanoseconds === right.nanoseconds;
}

function legacyReadOnly(): ApplicationMemoryRepositoryError {
  return new ApplicationMemoryRepositoryError("legacy-read-only", "This Application Memory uses legacy schema V1 and is read-only. Create a V2 memory instead.");
}

function parseMemory(data: Record<string, unknown>, atsJobId: string): ApplicationMemoryDocument {
  if (data.atsJobId !== atsJobId) throw new ApplicationMemoryRepositoryError("unsupported-schema", "Stored Application Memory identity is invalid.");
  if (data.schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) {
    if (!Array.isArray(data.answers)) throw new ApplicationMemoryRepositoryError("unsupported-schema", "Legacy Application Memory answers are malformed.");
    return data as unknown as ApplicationMemoryV1;
  }
  if (data.schemaVersion === APPLICATION_MEMORY_V2_SCHEMA_VERSION) {
    if (data.atsJobDocumentId !== getAtsJobDocumentId(atsJobId)) throw new ApplicationMemoryRepositoryError("unsupported-schema", "V2 Application Memory document identity is invalid.");
    return data as unknown as ApplicationMemoryV2;
  }
  throw new ApplicationMemoryRepositoryError("unsupported-schema", "Unsupported Application Memory schema version.");
}

function parseV2Answer(data: Record<string, unknown>, atsJobId: string, fieldKey: string): ApplicationMemoryAnswerV2 {
  if (data.schemaVersion !== APPLICATION_MEMORY_ANSWER_V2_SCHEMA_VERSION || data.atsJobId !== atsJobId || data.fieldKey !== fieldKey || typeof data.revision !== "number") {
    throw new ApplicationMemoryRepositoryError("unsupported-schema", "Stored Application Memory answer is malformed.");
  }
  return data as unknown as ApplicationMemoryAnswerV2;
}

function answerPayloadEquals(existing: ApplicationMemoryAnswerV2, incoming: ApplicationMemoryAnswerV2Input): boolean {
  return existing.question === incoming.question
    && existing.fieldType === incoming.fieldType
    && JSON.stringify(existing.value) === JSON.stringify(incoming.value)
    && JSON.stringify(existing.choiceMetadata ?? null) === JSON.stringify(incoming.choiceMetadata ?? null);
}

async function readMemoryContext(atsJobId: string) {
  const identity = parseAtsJobId(atsJobId);
  const { firestore, uid } = await requireContext();
  const ref = doc(firestore, "users", uid, "applicationMemories", identity.documentId);
  const snapshot = await getDoc(ref);
  return { identity, firestore, uid, ref, memory: snapshot.exists() ? parseMemory(snapshot.data(), identity.canonicalId) : null };
}

/** Retained only for V1 unit compatibility; V2 never writes an embedded answer array. */
export function mergeApplicationMemoryAnswers(existing: SavedApplicationAnswer[], incoming: SavedApplicationAnswer[], removals: string[] = []): SavedApplicationAnswer[] {
  const byKey = new Map(existing.map((answer) => [answer.fieldKey, answer]));
  for (const fieldKey of removals) byKey.delete(fieldKey);
  for (const answer of incoming) byKey.set(answer.fieldKey, answer);
  return validateAndNormalizeAnswers([...byKey.values()]);
}

/** Retained only for V1 unit compatibility; V2 never writes this payload. */
export function createApplicationMemoryPayload(input: ApplicationMemoryDraftInput, existing: ApplicationMemory | null, timestamp: unknown): Record<string, unknown> {
  const normalized = validateApplicationMemoryInput(input);
  const identity = parseAtsJobId(normalized.atsJobId);
  if (existing && existing.atsJobId !== identity.canonicalId) throw new Error("Application memory belongs to another ATS job.");
  return {
    schemaVersion: APPLICATION_MEMORY_SCHEMA_VERSION, atsJobId: identity.canonicalId, provider: identity.provider,
    canonicalUrl: normalized.canonicalUrl, status: "draft",
    answers: normalized.answers === undefined ? existing?.answers || [] : mergeApplicationMemoryAnswers(existing?.answers || [], normalized.answers),
    resume: normalized.resume === undefined ? existing?.resume ?? null : normalized.resume,
    createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
  };
}

export async function getApplicationMemory(atsJobId: string): Promise<ApplicationMemoryDocument | null> {
  return (await readMemoryContext(atsJobId)).memory;
}

/** V1 returns its embedded answers; V2 reads its independently stored documents. */
export async function getApplicationMemoryAnswers(atsJobId: string): Promise<Array<SavedApplicationAnswer | ApplicationMemoryAnswerV2>> {
  const context = await readMemoryContext(atsJobId);
  if (!context.memory) return [];
  if (context.memory.schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) return context.memory.answers;
  const snapshots = await getDocs(collection(context.ref, "answers"));
  return snapshots.docs.map((snapshot) => parseV2Answer(snapshot.data(), context.identity.canonicalId, snapshot.id));
}

export async function getApplicationMemoryAnswer(atsJobId: string, fieldKey: string): Promise<SavedApplicationAnswer | ApplicationMemoryAnswerV2 | null> {
  const normalizedKey = validateAndNormalizeApplicationMemoryFieldKey(fieldKey);
  const context = await readMemoryContext(atsJobId);
  if (!context.memory) return null;
  if (context.memory.schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) return context.memory.answers.find((answer) => answer.fieldKey === normalizedKey) ?? null;
  const snapshot = await getDoc(doc(context.ref, "answers", normalizedKey));
  return snapshot.exists() ? parseV2Answer(snapshot.data(), context.identity.canonicalId, normalizedKey) : null;
}

function v2ParentPayload(input: ApplicationMemoryV2ParentInput, timestamp: unknown): Record<string, unknown> {
  const normalized = validateAndNormalizeApplicationMemoryV2Parent(input);
  const identity = parseAtsJobId(normalized.atsJobId);
  return {
    schemaVersion: APPLICATION_MEMORY_V2_SCHEMA_VERSION, atsJobId: identity.canonicalId, atsJobDocumentId: identity.documentId,
    provider: identity.provider, boardToken: normalized.boardToken, jobId: normalized.jobId, canonicalUrl: normalized.canonicalUrl,
    status: "draft", resume: normalized.resume ?? null, createdAt: timestamp, updatedAt: timestamp,
  };
}

export async function createApplicationMemoryV2(input: ApplicationMemoryV2ParentInput): Promise<ApplicationMemoryV2> {
  const normalized = validateAndNormalizeApplicationMemoryV2Parent(input);
  const identity = parseAtsJobId(normalized.atsJobId);
  const { firestore, uid } = await requireContext();
  const ref = doc(firestore, "users", uid, "applicationMemories", identity.documentId);
  await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) transaction.set(ref, v2ParentPayload(normalized, serverTimestamp()));
    else if (parseMemory(snapshot.data(), identity.canonicalId).schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) throw legacyReadOnly();
  }, { maxAttempts: 3 });
  const memory = await getApplicationMemory(identity.canonicalId);
  if (!memory || memory.schemaVersion !== APPLICATION_MEMORY_V2_SCHEMA_VERSION) throw new ApplicationMemoryRepositoryError("missing-parent", "V2 Application Memory parent was not created.");
  return memory;
}

/** Compatibility entry point: creates V2 only and refuses the legacy embedded-answer write shape. */
export async function createApplicationMemoryDraft(input: ApplicationMemoryDraftInput): Promise<void> {
  const normalized = validateApplicationMemoryInput(input);
  if ((normalized.answers?.length || 0) > 0) throw new ApplicationMemoryRepositoryError("validation", "Create the V2 parent before saving answers with V2 answer operations.");
  await createApplicationMemoryV2({ atsJobId: normalized.atsJobId, atsJobDocumentId: getAtsJobDocumentId(normalized.atsJobId), canonicalUrl: normalized.canonicalUrl, resume: normalized.resume });
}

export async function upsertApplicationMemoryDraft(input: ApplicationMemoryDraftInput): Promise<void> {
  await createApplicationMemoryDraft(input);
}

async function assertV2ParentInTransaction(transaction: any, ref: ReturnType<typeof doc>, atsJobId: string): Promise<ApplicationMemoryV2> {
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists()) throw new ApplicationMemoryRepositoryError("missing-parent", "Application Memory parent does not exist.");
  const memory = parseMemory(snapshot.data(), atsJobId);
  if (memory.schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) throw legacyReadOnly();
  return memory;
}

async function currentAnswerCount(context: Awaited<ReturnType<typeof readMemoryContext>>): Promise<number> {
  if (!context.memory) throw new ApplicationMemoryRepositoryError("missing-parent", "Application Memory parent does not exist.");
  if (context.memory.schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) throw legacyReadOnly();
  return (await getDocs(collection(context.ref, "answers"))).size;
}

export async function upsertApplicationMemoryAnswer(atsJobId: string, input: ApplicationMemoryAnswerWriteInput): Promise<ApplicationMemoryAnswerV2> {
  const normalized = validateAndNormalizeApplicationMemoryAnswerV2({ ...input.answer, atsJobId });
  const context = await readMemoryContext(atsJobId);
  if (!context.memory) throw new ApplicationMemoryRepositoryError("missing-parent", "Application Memory parent does not exist.");
  if (context.memory.schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) throw legacyReadOnly();
  const answerRef = doc(context.ref, "answers", normalized.fieldKey);
  const before = await getDoc(answerRef);
  if (!before.exists() && !input.expectation.expectAbsent) throw new ApplicationMemoryRepositoryError("expected-answer-missing", "Answer does not exist; creation must explicitly expect absence.");
  if (!before.exists() && await currentAnswerCount(context) >= APPLICATION_MEMORY_V2_SOFT_ANSWER_LIMIT) throw new ApplicationMemoryRepositoryError("soft-answer-limit", `Application Memory is limited to ${APPLICATION_MEMORY_V2_SOFT_ANSWER_LIMIT} saved answers by this client.`);
  await runTransaction(context.firestore, async (transaction) => {
    await assertV2ParentInTransaction(transaction, context.ref, context.identity.canonicalId);
    const snapshot = await transaction.get(answerRef);
    if (!snapshot.exists()) {
      if (!input.expectation.expectAbsent) throw new ApplicationMemoryRepositoryError("expected-answer-missing", "Answer does not exist.");
      transaction.set(answerRef, { schemaVersion: APPLICATION_MEMORY_ANSWER_V2_SCHEMA_VERSION, ...normalized, revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return;
    }
    if (input.expectation.expectAbsent) throw new ApplicationMemoryRepositoryError("unexpected-existing-answer", "Answer already exists.");
    const existing = parseV2Answer(snapshot.data(), context.identity.canonicalId, normalized.fieldKey);
    if (input.expectation.expectedRevision === undefined || !input.expectation.expectedCreatedAt) throw new ApplicationMemoryRepositoryError("answer-conflict", "Updating an answer requires its observed revision and createdAt token.");
    if (existing.revision !== input.expectation.expectedRevision || !timestampsEqual(existing.createdAt, input.expectation.expectedCreatedAt)) throw new ApplicationMemoryRepositoryError("answer-conflict", "Application Memory answer changed in another session.");
    if (answerPayloadEquals(existing, normalized)) return;
    transaction.update(answerRef, {
      question: normalized.question, fieldType: normalized.fieldType, value: normalized.value,
      ...(normalized.choiceMetadata === undefined ? { choiceMetadata: deleteField() } : { choiceMetadata: normalized.choiceMetadata }),
      revision: existing.revision + 1, updatedAt: serverTimestamp(),
    });
  }, { maxAttempts: 3 });
  const result = await getDoc(answerRef);
  if (!result.exists()) throw new ApplicationMemoryRepositoryError("expected-answer-missing", "Answer write did not persist.");
  return parseV2Answer(result.data(), context.identity.canonicalId, normalized.fieldKey);
}

export async function deleteApplicationMemoryAnswer(atsJobId: string, fieldKey: string, expectation: Required<Pick<AnswerConcurrencyExpectation, "expectedRevision" | "expectedCreatedAt">>): Promise<void> {
  const normalizedKey = validateAndNormalizeApplicationMemoryFieldKey(fieldKey);
  const context = await readMemoryContext(atsJobId);
  if (!context.memory) throw new ApplicationMemoryRepositoryError("missing-parent", "Application Memory parent does not exist.");
  if (context.memory.schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) throw legacyReadOnly();
  const answerRef = doc(context.ref, "answers", normalizedKey);
  await runTransaction(context.firestore, async (transaction) => {
    await assertV2ParentInTransaction(transaction, context.ref, context.identity.canonicalId);
    const snapshot = await transaction.get(answerRef);
    if (!snapshot.exists()) throw new ApplicationMemoryRepositoryError("expected-answer-missing", "Answer does not exist.");
    const existing = parseV2Answer(snapshot.data(), context.identity.canonicalId, normalizedKey);
    if (existing.revision !== expectation.expectedRevision || !timestampsEqual(existing.createdAt, expectation.expectedCreatedAt)) throw new ApplicationMemoryRepositoryError("answer-conflict", "Application Memory answer changed in another session.");
    transaction.delete(answerRef);
  }, { maxAttempts: 3 });
}

/** Saves with independent optimistic transactions. Chunks are sequential, not cross-chunk atomic. */
export async function saveApplicationMemoryAnswers(atsJobId: string, writes: ApplicationMemoryAnswerWriteInput[], options: SaveApplicationMemoryAnswersOptions = {}): Promise<void> {
  const chunkSize = options.chunkSize ?? APPLICATION_MEMORY_V2_DEFAULT_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > APPLICATION_MEMORY_V2_DEFAULT_CHUNK_SIZE) throw new ApplicationMemoryRepositoryError("validation", `Chunk size must be between 1 and ${APPLICATION_MEMORY_V2_DEFAULT_CHUNK_SIZE}.`);
  const normalized = writes.map(({ answer, expectation }) => ({ answer: validateAndNormalizeApplicationMemoryAnswerV2({ ...answer, atsJobId }), expectation }));
  if (new Set(normalized.map(({ answer }) => answer.fieldKey)).size !== normalized.length) throw new ApplicationMemoryRepositoryError("validation", "A multi-answer save cannot contain duplicate field keys.");
  const context = await readMemoryContext(atsJobId);
  if (!context.memory) throw new ApplicationMemoryRepositoryError("missing-parent", "Application Memory parent does not exist.");
  if (context.memory.schemaVersion === APPLICATION_MEMORY_SCHEMA_VERSION) throw legacyReadOnly();
  const existing = await getApplicationMemoryAnswers(atsJobId);
  const existingKeys = new Set(existing.map((answer) => answer.fieldKey));
  if (existingKeys.size + normalized.filter(({ answer }) => !existingKeys.has(answer.fieldKey)).length > APPLICATION_MEMORY_V2_SOFT_ANSWER_LIMIT) throw new ApplicationMemoryRepositoryError("soft-answer-limit", `Application Memory is limited to ${APPLICATION_MEMORY_V2_SOFT_ANSWER_LIMIT} saved answers by this client.`);
  const completed: string[] = [];
  for (let offset = 0; offset < normalized.length; offset += chunkSize) {
    for (const write of normalized.slice(offset, offset + chunkSize)) {
      try { await upsertApplicationMemoryAnswer(atsJobId, write); completed.push(write.answer.fieldKey); }
      catch (error) {
        if (completed.length) throw new ApplicationMemoryRepositoryError("partial-completion", "Multi-answer save partially completed.", completed);
        throw error;
      }
    }
  }
}

/** V1 array mutation is intentionally unsupported under V2 rules. */
export async function updateApplicationMemoryAnswers(_atsJobId: string, _answers: SavedApplicationAnswer[], _options: ApplicationMemoryAnswerUpdateOptions = {}): Promise<void> {
  throw new ApplicationMemoryRepositoryError("legacy-read-only", "Use V2 answer operations; array-based answer updates are no longer supported.");
}

export async function updateApplicationMemoryResume(atsJobId: string, resumeReference: ResumeReference | null): Promise<void> {
  const identity = parseAtsJobId(atsJobId);
  const resume = resumeReference === null ? null : validateAndNormalizeResumeReference(resumeReference);
  const { firestore, uid } = await requireContext();
  const ref = doc(firestore, "users", uid, "applicationMemories", identity.documentId);
  await runTransaction(firestore, async (transaction) => {
    await assertV2ParentInTransaction(transaction, ref, identity.canonicalId);
    transaction.update(ref, { resume, updatedAt: serverTimestamp() });
  }, { maxAttempts: 3 });
}

/** Full-memory deletion is deliberately unsupported because Firestore does not cascade subcollections. */
export async function deleteApplicationMemory(): Promise<never> {
  throw new ApplicationMemoryRepositoryError("validation", "Full Application Memory deletion is not implemented; delete answers individually.");
}
