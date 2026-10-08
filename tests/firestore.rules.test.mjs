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
