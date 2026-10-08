import assert from "node:assert/strict";
import type { Timestamp } from "firebase/firestore";
import type { AtsJob } from "../../types/ats";
import { createAtsJobUpsertPayload } from "../atsJobService";
import { createApplicantProfilePayload } from "../applicantProfileService";
import { assertSubmissionTransition } from "../submissionAttemptService";

const createdAt = { marker: "created" } as unknown as Timestamp;
const updatedAt = { marker: "updated" };

console.log("Running V1.1 repository model tests...");

const existing: AtsJob = {
  atsJobId: "greenhouse:affirm:7985862003",
  provider: "greenhouse",
  boardToken: "affirm",
  jobId: "7985862003",
  canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862003",
  company: "Affirm",
  title: "Software Engineer",
  linkedInPostingIds: ["4470021362"],
  createdAt,
  updatedAt: createdAt,
};

const merged = createAtsJobUpsertPayload(
  {
    atsJobId: existing.atsJobId,
    canonicalUrl: " ",
    company: "",
    title: "Senior Software Engineer",
    linkedInPostingIds: ["4470021362", "4470029105", "4470029105"],
  },
  existing,
  updatedAt
);
assert.equal(merged.canonicalUrl, existing.canonicalUrl);
assert.equal(merged.company, existing.company);
assert.equal(merged.title, "Senior Software Engineer");
assert.deepEqual(merged.linkedInPostingIds, ["4470021362", "4470029105"]);
assert.equal(merged.createdAt, createdAt);
assert.throws(() =>
  createAtsJobUpsertPayload(
    { atsJobId: "greenhouse:affirm:not-numeric" },
    null,
    updatedAt
  )
);

for (const status of ["pending", "failed", "uncertain", "confirmed"] as const) {
  assert.doesNotThrow(() => assertSubmissionTransition(status, status));
}
assert.doesNotThrow(() => assertSubmissionTransition("pending", "confirmed"));
assert.doesNotThrow(() => assertSubmissionTransition("uncertain", "confirmed"));
assert.doesNotThrow(() => assertSubmissionTransition("failed", "confirmed"));
assert.throws(() => assertSubmissionTransition("confirmed", "pending"));
assert.throws(() => assertSubmissionTransition("confirmed", "failed"));

const profilePayload = createApplicantProfilePayload(
  {
    firstName: " Ada ",
    lastName: " Lovelace ",
    email: " ada@example.com ",
    phone: " ",
    linkedinUrl: " https://www.linkedin.com/in/ada ",
  },
  false,
  updatedAt
);
assert.equal(profilePayload.firstName, "Ada");
assert.equal(profilePayload.email, "ada@example.com");
assert.equal("phone" in profilePayload, false);
assert.equal(profilePayload.linkedinUrl, "https://www.linkedin.com/in/ada");
assert.equal("createdAt" in profilePayload, true);
assert.equal("resume" in profilePayload, false);
assert.equal("salary" in profilePayload, false);
assert.throws(() =>
  createApplicantProfilePayload(
    { firstName: "", lastName: "Lovelace", email: "ada@example.com" },
    false,
    updatedAt
  )
);

console.log("V1.1 repository model tests passed.");
