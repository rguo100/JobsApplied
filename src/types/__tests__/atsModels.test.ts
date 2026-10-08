import assert from "node:assert/strict";
import type { Timestamp } from "firebase/firestore";
import {
  createGreenhouseAtsIdentity,
  getAtsJobDocumentId,
  getAtsJobIdFromDocumentId,
  parseAtsJobId,
} from "../ats";
import type { Application } from "../application";
import { getApplicationDocId } from "../application";
import type { ApplicationQueueItem } from "../queue";
import type { SubmissionAttempt } from "../submission";

const timestamp = { marker: "timestamp" } as unknown as Timestamp;

console.log("Running ATS identity and V1.1 model tests...");

const identity = createGreenhouseAtsIdentity("affirm", "7985862003");
assert.equal(identity.canonicalId, "greenhouse:affirm:7985862003");
assert.equal(identity.provider, "greenhouse");
assert.equal(identity.boardToken, "affirm");
assert.equal(identity.jobId, "7985862003");

const normalized = createGreenhouseAtsIdentity("  AfFiRm  ", " 7985862003 ");
assert.equal(normalized.canonicalId, identity.canonicalId);

for (const [boardToken, jobId] of [
  ["", "7985862003"],
  ["bad token", "7985862003"],
  ["affirm", ""],
  ["affirm", "job-7985862003"],
] as const) {
  assert.throws(() => createGreenhouseAtsIdentity(boardToken, jobId));
}
assert.throws(() => parseAtsJobId("lever:affirm:7985862003"));
assert.throws(() => parseAtsJobId("https://boards.greenhouse.io/affirm/jobs/7985862003"));

const parsed = parseAtsJobId(identity.canonicalId);
assert.deepEqual(parsed, identity);
assert.equal(getAtsJobIdFromDocumentId(getAtsJobDocumentId(identity.canonicalId)), identity.canonicalId);

const linkedInPostingA = "4470021362";
const linkedInPostingB = "4470029105";
assert.equal(getApplicationDocId("linkedin", linkedInPostingA), "linkedin_4470021362");
assert.equal(getApplicationDocId("linkedin", linkedInPostingB), "linkedin_4470029105");
assert.notEqual(
  getApplicationDocId("linkedin", linkedInPostingA),
  getApplicationDocId("linkedin", linkedInPostingB)
);

const oldApplication: Application = {
  source: "linkedin",
  externalJobId: linkedInPostingA,
  company: "Affirm",
  title: "Software Engineer",
  location: "Remote",
  url: `https://www.linkedin.com/jobs/view/${linkedInPostingA}/`,
  status: "saved",
  appliedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
assert.equal(oldApplication.atsJobId, undefined);

const postingA: Application = { ...oldApplication, atsJobId: identity.canonicalId, atsProvider: "greenhouse" };
const postingB: Application = {
  ...oldApplication,
  externalJobId: linkedInPostingB,
  url: `https://www.linkedin.com/jobs/view/${linkedInPostingB}/`,
  atsJobId: identity.canonicalId,
  atsProvider: "greenhouse",
};
assert.equal(postingA.atsJobId, postingB.atsJobId);
assert.notEqual(postingA.externalJobId, postingB.externalJobId);

const attemptA: SubmissionAttempt = {
  attemptId: "attempt-1",
  atsJobId: identity.canonicalId,
  linkedInPostingIds: [linkedInPostingA, linkedInPostingB],
  status: "uncertain",
  userConfirmedAt: timestamp,
  submitClickedAt: timestamp,
  verification: null,
  failureCode: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const attemptB: SubmissionAttempt = {
  attemptId: "attempt-2",
  atsJobId: identity.canonicalId,
  linkedInPostingIds: [linkedInPostingA, linkedInPostingB],
  status: "confirmed",
  userConfirmedAt: timestamp,
  // Native Greenhouse submission was independently verified even though the
  // extension did not observe the user's click.
  submitClickedAt: null,
  verification: {
    method: "success_dom",
    evidenceCode: "greenhouse_thank_you",
    verifiedAt: timestamp,
  },
  failureCode: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
assert.equal(attemptA.atsJobId, attemptB.atsJobId);
assert.notEqual(attemptA.attemptId, attemptB.attemptId);
assert.equal(attemptA.verification, null);
assert.ok(attemptB.verification);
assert.equal(attemptB.submitClickedAt, null);

const initialQueueItem: ApplicationQueueItem = {
  itemId: "queue-item-1",
  atsJobId: identity.canonicalId,
  linkedInPostingIds: [linkedInPostingA, linkedInPostingB],
  submissionAttemptId: attemptA.attemptId,
  order: 0,
  status: "queued",
  intentionalRepeat: false,
  repeatOfItemId: null,
  repeatConfirmedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const repeatQueueItem: ApplicationQueueItem = {
  itemId: "queue-item-2",
  atsJobId: identity.canonicalId,
  linkedInPostingIds: [linkedInPostingA, linkedInPostingB],
  submissionAttemptId: attemptB.attemptId,
  order: 1,
  status: "queued",
  intentionalRepeat: true,
  // The earlier attempt may belong to another queue or have happened outside
  // queue execution, so atsJobId is the primary historical association.
  repeatOfItemId: null,
  repeatConfirmedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
};
assert.equal(initialQueueItem.atsJobId, repeatQueueItem.atsJobId);
assert.notEqual(initialQueueItem.itemId, repeatQueueItem.itemId);
assert.notEqual(initialQueueItem.submissionAttemptId, repeatQueueItem.submissionAttemptId);
assert.equal(repeatQueueItem.intentionalRepeat, true);
assert.ok(repeatQueueItem.repeatConfirmedAt);
assert.equal(repeatQueueItem.repeatOfItemId, null);

console.log("ATS identity and V1.1 model tests passed.");
