import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";

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
  const memoryData = {
    schemaVersion: 1,
    atsJobId,
    provider: "greenhouse",
    canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862003",
    status: "draft",
    answers: [firstAnswer],
    resume: null,
    createdAt: now,
    updatedAt: now,
  };
  await assertSucceeds(setDoc(memoryRef, memoryData));
  assert.equal((await getDoc(memoryRef)).data().status, "draft");
  await assertFails(getDoc(doc(anonymous, "users", "user-a", "applicationMemories", atsDocumentId)));
  await assertFails(getDoc(doc(userB, "users", "user-a", "applicationMemories", atsDocumentId)));
  await assertFails(setDoc(doc(userB, "users", "user-a", "applicationMemories", atsDocumentId), memoryData));
  const originalCreatedAt = (await getDoc(memoryRef)).data().createdAt;
  await assertSucceeds(updateDoc(memoryRef, { answers: [{ ...firstAnswer, value: "10+" }, secondAnswer], updatedAt: Timestamp.now() }));
  await assertSucceeds(updateDoc(memoryRef, { answers: [secondAnswer], updatedAt: Timestamp.now() }));
  await assertSucceeds(updateDoc(memoryRef, {
    resume: { fileName: "resume.pdf", fileSize: 1234, mimeType: "application/pdf", storageStatus: "reference_only", storagePath: null },
    updatedAt: Timestamp.now(),
  }));
  assert.equal((await getDoc(memoryRef)).data().createdAt.toMillis(), originalCreatedAt.toMillis());
  await assertFails(updateDoc(memoryRef, { atsJobId: "greenhouse:affirm:1", updatedAt: Timestamp.now() }));
  await assertFails(updateDoc(memoryRef, { answers: [{ ...firstAnswer, value: { bad: true } }], updatedAt: Timestamp.now() }));
  await assertFails(updateDoc(memoryRef, { answers: [{ ...firstAnswer, fieldKey: "date_of_birth", question: "Date of birth" }], updatedAt: Timestamp.now() }));
  await assertFails(updateDoc(memoryRef, { answers: [{ ...firstAnswer, value: "x".repeat(4001) }], updatedAt: Timestamp.now() }));
  await assertSucceeds(updateDoc(memoryRef, {
    answers: Array.from({ length: 10 }, (_, index) => ({ ...firstAnswer, fieldKey: `answer_${index}` })),
    updatedAt: Timestamp.now(),
  }));
  await assertFails(updateDoc(memoryRef, { answers: Array.from({ length: 11 }, (_, index) => ({ ...firstAnswer, fieldKey: `answer_${index}` })), updatedAt: Timestamp.now() }));
  await assertFails(updateDoc(memoryRef, { resume: { fileName: "resume.pdf", storageStatus: "uploaded", storagePath: "files/resume.pdf" }, updatedAt: Timestamp.now() }));

  const secondAtsJobId = "greenhouse:affirm:7985862004";
  const secondMemoryRef = doc(userA, "users", "user-a", "applicationMemories", encodeURIComponent(secondAtsJobId));
  await assertSucceeds(setDoc(secondMemoryRef, {
    ...memoryData,
    atsJobId: secondAtsJobId,
    canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862004",
    answers: [],
  }));
  assert.notEqual(memoryRef.path, secondMemoryRef.path);

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
