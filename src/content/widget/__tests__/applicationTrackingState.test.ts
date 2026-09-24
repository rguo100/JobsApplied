import { strict as assert } from "node:assert";
import type { Application, ApplicationStatus } from "../../../types/application";
import { deriveApplicationTrackingState } from "../applicationTrackingState";
import { createApplicationStatusUpdate } from "../../../services/applicationStatusUpdate";

const originalAppliedAt = { marker: "original-applied-at" };
const originalCreatedAt = { marker: "original-created-at" };

function application(status: ApplicationStatus): Application {
  return {
    source: "linkedin",
    externalJobId: "4460179601",
    company: "Cisco",
    title: "Software Developer",
    location: "Ottawa, ON",
    url: "https://www.linkedin.com/jobs/view/4460179601/",
    status,
    appliedAt: originalAppliedAt as unknown as Application["appliedAt"],
    createdAt: originalCreatedAt as unknown as Application["createdAt"],
    updatedAt: { marker: `updated-${status}` } as unknown as Application["updatedAt"],
  };
}

for (const status of ["applied", "interview", "offer", "rejected", "saved"] as const) {
  const app = application(status);
  const state = deriveApplicationTrackingState(app);
  assert.equal(state.mode, "applied", `${status} document must remain tracked`);
  assert.equal(state.application, app, `${status} snapshot must be preserved`);
}

const deleted = deriveApplicationTrackingState(null);
assert.equal(deleted.mode, "not_applied");
assert.equal(deleted.application, null);

const recreated = application("interview");
assert.equal(deriveApplicationTrackingState(recreated).mode, "applied");

const transitions: ApplicationStatus[] = [
  "interview",
  "offer",
  "rejected",
  "applied",
];
let current = application("applied");
for (const status of transitions) {
  const updatedAt = { marker: `updated-${status}` } as unknown as Application["updatedAt"];
  const update = createApplicationStatusUpdate(status, updatedAt);
  current = { ...current, ...update };
  assert.equal(current.source, "linkedin");
  assert.equal(current.externalJobId, "4460179601");
  assert.equal(current.createdAt, originalCreatedAt);
  assert.equal(current.appliedAt, originalAppliedAt);
  assert.equal("appliedAt" in update, false);
  assert.equal("createdAt" in update, false);
  assert.equal("source" in update, false);
  assert.equal("externalJobId" in update, false);
}

console.log("Application tracking/status transition tests passed.");
