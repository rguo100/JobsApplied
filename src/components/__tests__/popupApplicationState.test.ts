import { strict as assert } from "node:assert";
import type { Application, ApplicationStatus } from "../../types/application";
import { isPopupApplicationTracked } from "../popupApplicationState";
import { createApplicationStatusUpdate } from "../../services/applicationStatusUpdate";

const originalAppliedAt = { marker: "original-applied-at" } as unknown as Application["appliedAt"];
const originalCreatedAt = { marker: "original-created-at" } as unknown as Application["createdAt"];

function application(status: ApplicationStatus): Application {
  return {
    source: "linkedin",
    externalJobId: "4460179601",
    company: "Cisco",
    title: "Software Developer",
    location: "Ottawa, ON",
    url: "https://www.linkedin.com/jobs/view/4460179601/",
    status,
    appliedAt: originalAppliedAt,
    createdAt: originalCreatedAt,
    updatedAt: { marker: status } as unknown as Application["updatedAt"],
  };
}

assert.equal(isPopupApplicationTracked(null), false, "missing document must be Not tracked");

for (const status of ["applied", "interview", "offer", "rejected", "saved"] as const) {
  assert.equal(
    isPopupApplicationTracked(application(status)),
    true,
    `existing ${status} document must remain Tracked`
  );
}

let snapshot: Application | null = application("applied");
assert.equal(isPopupApplicationTracked(snapshot), true);
snapshot = null;
assert.equal(isPopupApplicationTracked(snapshot), false, "deletion must become Not tracked");
snapshot = application("interview");
assert.equal(
  isPopupApplicationTracked(snapshot),
  true,
  "recreation with a non-applied status must become Tracked"
);

let roundTrip = application("applied");
for (const status of ["interview", "offer", "rejected", "applied"] as const) {
  roundTrip = {
    ...roundTrip,
    ...createApplicationStatusUpdate(
      status,
      { marker: `updated-${status}` } as unknown as Application["updatedAt"]
    ),
  };
}
assert.equal(roundTrip.appliedAt, originalAppliedAt, "status round trip must preserve appliedAt");
assert.equal(roundTrip.createdAt, originalCreatedAt, "status round trip must preserve createdAt");

console.log("Popup application tracking tests passed.");
