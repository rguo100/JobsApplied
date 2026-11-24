import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore/lite";
import {
  ApplicationMemoryRepositoryError,
  createApplicationMemoryV2,
  deleteApplicationMemoryAnswer,
  getApplicationMemory,
  getApplicationMemoryAnswer,
  saveApplicationMemoryAnswers,
  setApplicationMemoryRepositoryTestContext,
  upsertApplicationMemoryAnswer,
} from "../applicationMemoryService";

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!firestoreHost || !authHost) throw new Error("Integration tests require FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.");
const [firestoreHostname, firestorePort] = firestoreHost.split(":");
const [authHostname, authPort] = authHost.split(":");
if (!firestoreHostname || !firestorePort || !authHostname || !authPort) throw new Error("Emulator endpoint format is invalid.");

const projectId = "appliedyet-prod";
const email = `memory-${Date.now()}@example.test`;
const password = "integration-test-password";
const atsJobId = "greenhouse:affirm:7985862991";
const canonicalUrl = "https://job-boards.greenhouse.io/affirm/jobs/7985862991";

async function client(name: string, create = false) {
  const app = initializeApp({ apiKey: "integration-test", authDomain: "localhost", projectId }, name);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${authHostname}:${authPort}`, { disableWarnings: true });
  const credential = create
    ? await createUserWithEmailAndPassword(auth, email, password)
    : await signInWithEmailAndPassword(auth, email, password);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, firestoreHostname, Number(firestorePort));
  return { app, firestore, uid: credential.user.uid };
}

function answer(fieldKey: string, value = "answer") {
  return { atsJobId, fieldKey, question: `Question ${fieldKey}`, fieldType: "text" as const, value };
}

async function use(context: Awaited<ReturnType<typeof client>>) {
  setApplicationMemoryRepositoryTestContext({ firestore: context.firestore, uid: context.uid, firestoreEmulatorHost: firestoreHost! });
}

console.log("Running Application Memory V2 authenticated emulator integration tests...");
const a = await client("memory-a", true);
const b = await client("memory-b");
try {
  await use(a);
  assert.equal(await getApplicationMemory(atsJobId), null);
  const parent = await createApplicationMemoryV2({ atsJobId, atsJobDocumentId: encodeURIComponent(atsJobId), canonicalUrl });
  assert.equal(parent.schemaVersion, 2);
  assert.equal((await createApplicationMemoryV2({ atsJobId, atsJobDocumentId: encodeURIComponent(atsJobId), canonicalUrl })).createdAt.seconds, parent.createdAt.seconds);

  const created = await upsertApplicationMemoryAnswer(atsJobId, { answer: answer("shared"), expectation: { expectAbsent: true } });
  await use(b);
  const stale = await getApplicationMemoryAnswer(atsJobId, "shared");
  assert.ok(stale && "revision" in stale);
  await use(a);
  const updated = await upsertApplicationMemoryAnswer(atsJobId, { answer: answer("shared", "client-a"), expectation: { expectedRevision: created.revision, expectedCreatedAt: created.createdAt } });
  await use(b);
  await assert.rejects(
    () => upsertApplicationMemoryAnswer(atsJobId, { answer: answer("shared", "client-b"), expectation: { expectedRevision: stale.revision, expectedCreatedAt: stale.createdAt } }),
    (error: unknown) => error instanceof ApplicationMemoryRepositoryError && error.code === "answer-conflict",
  );
  assert.equal(updated.revision, 2);
  assert.equal((await getApplicationMemoryAnswer(atsJobId, "shared") as any).value, "client-a");

  await use(a);
  const original = await upsertApplicationMemoryAnswer(atsJobId, { answer: answer("aba"), expectation: { expectAbsent: true } });
  await deleteApplicationMemoryAnswer(atsJobId, "aba", { expectedRevision: original.revision, expectedCreatedAt: original.createdAt });
  const recreated = await upsertApplicationMemoryAnswer(atsJobId, { answer: answer("aba", "recreated"), expectation: { expectAbsent: true } });
  assert.ok(
    recreated.createdAt.seconds !== original.createdAt.seconds || recreated.createdAt.nanoseconds !== original.createdAt.nanoseconds,
    "recreated answer must have a distinct generation timestamp",
  );
  await assert.rejects(
    () => upsertApplicationMemoryAnswer(atsJobId, { answer: answer("aba", "stale"), expectation: { expectedRevision: original.revision, expectedCreatedAt: original.createdAt } }),
    (error: unknown) => error instanceof ApplicationMemoryRepositoryError && error.code === "answer-conflict",
  );

  await saveApplicationMemoryAnswers(atsJobId, Array.from({ length: 48 }, (_, index) => ({ answer: answer(`bulk_${index}`), expectation: { expectAbsent: true } })));
  await assert.rejects(
    () => upsertApplicationMemoryAnswer(atsJobId, { answer: answer("over_limit"), expectation: { expectAbsent: true } }),
    (error: unknown) => error instanceof ApplicationMemoryRepositoryError && error.code === "soft-answer-limit",
  );
  console.log("Application Memory V2 authenticated emulator integration tests passed.");
} finally {
  setApplicationMemoryRepositoryTestContext(null);
  await Promise.all([deleteApp(a.app), deleteApp(b.app)]);
}
