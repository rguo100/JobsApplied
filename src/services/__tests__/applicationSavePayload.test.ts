import { strict as assert } from "node:assert";
import type { Application, ApplicationStatus } from "../../types/application";
import { createApplicationSavePayload } from "../applicationSavePayload";
import { createApplicationStatusUpdate } from "../applicationStatusUpdate";

const originalAppliedAt = { marker: "original-applied-at" } as unknown as Application["appliedAt"];
const originalCreatedAt = { marker: "original-created-at" } as unknown as Application["createdAt"];

function application(status: ApplicationStatus, appliedAt: Application["appliedAt"]): Application {
  return {
    source: "linkedin",
    externalJobId: "4460179601",
    company: "Cisco",
    title: "Software Developer",
    location: "Ottawa, ON",
    url: "https://www.linkedin.com/jobs/view/4460179601/",
    status,
    appliedAt,
    createdAt: originalCreatedAt,
    updatedAt: { marker: "old-update" } as unknown as Application["updatedAt"],
  };
}

let timestampSequence = 0;
const serverTimestamp = () => ({ marker: `server-${++timestampSequence}` });

const newApplied = createApplicationSavePayload(
  application("applied", null),
  null,
  serverTimestamp
);
assert.notEqual(newApplied.appliedAt, null);
assert.ok("createdAt" in newApplied);

for (const status of ["interview", "offer", "rejected", "saved"] as const) {
  const existing = application(status, originalAppliedAt);
  const payload = createApplicationSavePayload(application(status, null), existing, serverTimestamp);
  assert.equal("appliedAt" in payload, false, `${status} save must not overwrite appliedAt`);
  assert.equal("createdAt" in payload, false, `${status} save must preserve createdAt`);
}

const existingWithoutDate = application("interview", null);
const nonAppliedSave = createApplicationSavePayload(
  application("offer", null),
  existingWithoutDate,
  serverTimestamp
);
assert.equal("appliedAt" in nonAppliedSave, false);

const firstAppliedSave = createApplicationSavePayload(
  application("applied", null),
  existingWithoutDate,
  serverTimestamp
);
assert.notEqual(firstAppliedSave.appliedAt, null);

let roundTrip = application("applied", originalAppliedAt);
for (const status of ["interview", "offer", "rejected", "applied"] as const) {
  roundTrip = {
    ...roundTrip,
    ...createApplicationStatusUpdate(
      status,
      serverTimestamp() as unknown as Application["updatedAt"]
    ),
  };
}
assert.equal(roundTrip.appliedAt, originalAppliedAt);
assert.equal(roundTrip.createdAt, originalCreatedAt);

const saveAfterRoundTrip = createApplicationSavePayload(
  application("applied", null),
  roundTrip,
  serverTimestamp
);
assert.equal("appliedAt" in saveAfterRoundTrip, false);

console.log("Application save payload appliedAt tests passed.");
