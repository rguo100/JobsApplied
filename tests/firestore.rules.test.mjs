import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch, Timestamp } from "firebase/firestore";

const projectId = "appliedyet-rules-test";
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules },
});

const now = Timestamp.now();
const atsJobId = "greenhouse:affirm:7985862003";
const atsDocumentId = encodeURIComponent(atsJobId);
const atsData = {
  atsJobId,
  provider: "greenhouse",
  boardToken: "affirm",
  jobId: "7985862003",
  canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862003",
  company: "Affirm",
  title: "Software Engineer",
  linkedInPostingIds: ["4470021362"],
  createdAt: now,
  updatedAt: now,
};

try {
  const userA = env.authenticatedContext("user-a").firestore();
  const userB = env.authenticatedContext("user-b").firestore();
  const anonymous = env.unauthenticatedContext().firestore();
  const atsRef = doc(userA, "users", "user-a", "atsJobs", atsDocumentId);

  await assertSucceeds(setDoc(atsRef, atsData));
  await assertFails(getDoc(doc(userB, "users", "user-a", "atsJobs", atsDocumentId)));
  await assertFails(updateDoc(atsRef, { atsJobId: "greenhouse:other:1" }));
  await assertSucceeds(updateDoc(atsRef, {
    linkedInPostingIds: ["4470021362", "4470029105"],
    updatedAt: Timestamp.now(),
  }));

  const invalidAtsRef = doc(userA, "users", "user-a", "atsJobs", "invalid");
  await assertFails(setDoc(invalidAtsRef, { ...atsData, atsJobId: "invalid" }));

  const attemptRef = doc(userA, "users", "user-a", "submissionAttempts", "attempt-1");
  await assertSucceeds(setDoc(attemptRef, {
    attemptId: "attempt-1",
    atsJobId,
    linkedInPostingIds: ["4470021362"],
    status: "pending",
    userConfirmedAt: now,
    submitClickedAt: null,
    verification: null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  }));
  const secondAttemptRef = doc(userA, "users", "user-a", "submissionAttempts", "attempt-2");
  await assertSucceeds(setDoc(secondAttemptRef, {
    attemptId: "attempt-2",
    atsJobId,
    linkedInPostingIds: ["4470029105"],
    status: "pending",
    userConfirmedAt: null,
    submitClickedAt: null,
    verification: null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  }));
  await assertFails(updateDoc(attemptRef, { status: "confirmed", updatedAt: Timestamp.now() }));
  await assertSucceeds(updateDoc(attemptRef, {
    status: "confirmed",
    submitClickedAt: null,
    verification: {
      method: "success_dom",
      evidenceCode: "greenhouse_thank_you",
      verifiedAt: Timestamp.now(),
    },
    failureCode: null,
    updatedAt: Timestamp.now(),
  }));
  await assertFails(updateDoc(attemptRef, {
    status: "failed",
    verification: null,
    failureCode: "stale_error",
    updatedAt: Timestamp.now(),
  }));

  const profileRef = doc(userA, "users", "user-a", "private", "applicantProfile");
  await assertSucceeds(setDoc(profileRef, {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    createdAt: now,
    updatedAt: now,
  }));
  await assertFails(setDoc(profileRef, { sensitiveLegalAnswer: "yes" }, { merge: true }));
  await assertSucceeds(updateDoc(profileRef, {
    city: "Toronto, ON",
    updatedAt: Timestamp.now(),
  }));
  await assertFails(updateDoc(profileRef, {
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }));

  const memoryRef = doc(userA, "users", "user-a", "applicationMemories", atsDocumentId);
  const firstAnswer = {
    fieldKey: "years_experience",
    question: "How many years of experience do you have?",
    fieldType: "select",
    value: "5+",
    choiceMetadata: { options: [{ value: "5+", label: "5 or more" }] },
  };
  const secondAnswer = {
    fieldKey: "preferred_teams",
    question: "Preferred teams",
    fieldType: "multiselect",
    value: ["platform", "infrastructure"],
  };
  const v2MemoryData = {
    schemaVersion: 2,
    atsJobId,
    atsJobDocumentId: atsDocumentId,
    provider: "greenhouse",
    boardToken: "affirm",
    jobId: "7985862003",
    canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862003",
    status: "draft",
    resume: null,
    createdAt: now,
    updatedAt: now,
  };
  await assertSucceeds(setDoc(memoryRef, v2MemoryData));
  assert.equal((await getDoc(memoryRef)).data().status, "draft");
  await assertFails(getDoc(doc(anonymous, "users", "user-a", "applicationMemories", atsDocumentId)));
  await assertFails(getDoc(doc(userB, "users", "user-a", "applicationMemories", atsDocumentId)));
  await assertFails(setDoc(doc(userB, "users", "user-a", "applicationMemories", atsDocumentId), v2MemoryData));
  await assertFails(setDoc(doc(userA, "users", "user-a", "applicationMemories", "greenhouse%3Aaffirm%3A7985862004"), {
    ...v2MemoryData,
    atsJobDocumentId: atsDocumentId,
    atsJobId: "greenhouse:affirm:7985862004",
    canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862004",
  }));
  const originalCreatedAt = (await getDoc(memoryRef)).data().createdAt;
  await assertSucceeds(updateDoc(memoryRef, {
    resume: { fileName: "resume.pdf", fileSize: 1234, mimeType: "application/pdf", storageStatus: "reference_only", storagePath: null },
    updatedAt: Timestamp.now(),
  }));
  assert.equal((await getDoc(memoryRef)).data().createdAt.toMillis(), originalCreatedAt.toMillis());
  await assertFails(updateDoc(memoryRef, { atsJobId: "greenhouse:affirm:1", updatedAt: Timestamp.now() }));
  await assertFails(updateDoc(memoryRef, { resume: { fileName: "resume.pdf", storageStatus: "uploaded", storagePath: "files/resume.pdf" }, updatedAt: Timestamp.now() }));

  const answerRef = doc(userA, "users", "user-a", "applicationMemories", atsDocumentId, "answers", firstAnswer.fieldKey);
  const v2Answer = { schemaVersion: 1, atsJobId, ...firstAnswer, revision: 1, createdAt: now, updatedAt: now };
  await assertSucceeds(setDoc(answerRef, v2Answer));
  await assertFails(getDoc(doc(anonymous, "users", "user-a", "applicationMemories", atsDocumentId, "answers", firstAnswer.fieldKey)));
  await assertSucceeds(updateDoc(answerRef, { value: "10+", revision: 2, updatedAt: Timestamp.now() }));
  await assertFails(updateDoc(answerRef, { atsJobId: "greenhouse:affirm:1", revision: 3, updatedAt: Timestamp.now() }));
  await assertFails(updateDoc(answerRef, { revision: 4, updatedAt: Timestamp.now() }));
  await assertFails(setDoc(doc(userA, "users", "user-a", "applicationMemories", atsDocumentId, "answers", "wrong_id"), { ...v2Answer, fieldKey: "right_id" }));
  await assertFails(setDoc(doc(userA, "users", "user-a", "applicationMemories", atsDocumentId, "answers", "date_of_birth"), { ...v2Answer, fieldKey: "date_of_birth" }));
  await assertFails(setDoc(doc(userA, "users", "user-a", "applicationMemories", atsDocumentId, "answers", "bad_value"), { ...v2Answer, fieldKey: "bad_value", value: { bad: true } }));
  await assertFails(setDoc(doc(userA, "users", "user-a", "applicationMemories", atsDocumentId, "answers", "unknown_field"), { ...v2Answer, fieldKey: "unknown_field", unknown: true }));
  await assertFails(setDoc(doc(userA, "users", "user-a", "applicationMemories", encodeURIComponent("greenhouse:affirm:7985862004"), "answers", "orphan"), { ...v2Answer, atsJobId: "greenhouse:affirm:7985862004", fieldKey: "orphan" }));
  await assertFails(setDoc(doc(userB, "users", "user-a", "applicationMemories", atsDocumentId, "answers", "cross_user"), { ...v2Answer, fieldKey: "cross_user" }));
  await assertFails(deleteDoc(memoryRef));
  await assertSucceeds(deleteDoc(answerRef));

  async function createMemoryWithAnswers(count) {
    const jobId = `7985863${String(count).padStart(3, "0")}`;
    const id = `greenhouse:affirm:${jobId}`;
    const encoded = encodeURIComponent(id);
    const parent = doc(userA, "users", "user-a", "applicationMemories", encoded);
    await assertSucceeds(setDoc(parent, {
      ...v2MemoryData,
      atsJobId: id,
      atsJobDocumentId: encoded,
      boardToken: "affirm",
      jobId,
      canonicalUrl: `https://job-boards.greenhouse.io/affirm/jobs/${jobId}`,
    }));
    const batch = writeBatch(userA);
    for (let index = 0; index < count; index++) {
      const fieldKey = `question_${index}`;
      batch.set(doc(userA, "users", "user-a", "applicationMemories", encoded, "answers", fieldKey), {
        schemaVersion: 1, atsJobId: id, fieldKey, question: `Question ${index}`,
        fieldType: "text", value: "answer", revision: 1, createdAt: now, updatedAt: now,
      });
    }
    await assertSucceeds(batch.commit());
    return { parent, encoded, id };
  }

  let fifty;
  for (const count of [10, 20, 30, 50]) {
    const created = await createMemoryWithAnswers(count);
    if (count === 50) fifty = created;
  }
  const fiftyAnswerRef = doc(userA, "users", "user-a", "applicationMemories", fifty.encoded, "answers", "question_49");
  await assertSucceeds(updateDoc(fiftyAnswerRef, { value: "updated", revision: 2, updatedAt: Timestamp.now() }));
  const complexRef = doc(userA, "users", "user-a", "applicationMemories", fifty.encoded, "answers", "maximum_complexity");
  await assertSucceeds(setDoc(complexRef, {
    schemaVersion: 1, atsJobId: fifty.id, fieldKey: "maximum_complexity", question: "Maximum complexity", fieldType: "select",
    value: "x".repeat(4000), choiceMetadata: { options: Array.from({ length: 10 }, (_, index) => ({ value: `v${index}`, label: `Option ${index}` })) },
    revision: 1, createdAt: now, updatedAt: now,
  }));

  const legacyId = encodeURIComponent("greenhouse:affirm:7985862999");
  const legacyRef = doc(userA, "users", "user-a", "applicationMemories", legacyId);
  await env.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "users", "user-a", "applicationMemories", legacyId), {
    schemaVersion: 1, atsJobId: "greenhouse:affirm:7985862999", provider: "greenhouse",
    canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862999", status: "draft", answers: [firstAnswer], resume: null, createdAt: now, updatedAt: now,
  }));
  await assertSucceeds(getDoc(legacyRef));
  await assertFails(updateDoc(legacyRef, { updatedAt: Timestamp.now() }));
  await assertFails(setDoc(legacyRef, { ...v2MemoryData, atsJobDocumentId: legacyId, atsJobId: "greenhouse:affirm:7985862999", canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862999" }));

  const sharedPostingA = doc(userA, "users", "user-a", "applications", "linkedin_4470021362");
  const sharedPostingB = doc(userA, "users", "user-a", "applications", "linkedin_4470029105");
  await assertSucceeds(setDoc(sharedPostingA, { source: "linkedin", externalJobId: "4470021362", atsJobId }));
  await assertSucceeds(setDoc(sharedPostingB, { source: "linkedin", externalJobId: "4470029105", atsJobId }));
  assert.equal((await getDoc(sharedPostingA)).data().externalJobId, "4470021362");
  assert.equal((await getDoc(sharedPostingB)).data().externalJobId, "4470029105");
  assert.equal((await getDoc(doc(userA, "users", "user-a", "submissionAttempts", "draft-save-must-not-create"))).exists(), false);

  const oldApplicationRef = doc(userA, "users", "user-a", "applications", "linkedin_4470021362");
  await assertSucceeds(setDoc(oldApplicationRef, {
    source: "linkedin",
    externalJobId: "4470021362",
    status: "saved",
  }));
  assert.equal((await getDoc(oldApplicationRef)).exists(), true);

  console.log("Firestore Security Rules emulator tests passed.");
} finally {
  await env.cleanup();
}
