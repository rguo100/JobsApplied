import assert from "node:assert/strict";
import {
  createDiscoverySession,
  DISCOVERY_SESSION_TTL_MS,
  markSessionLinked,
  resolveAssociation,
} from "../../background/discoverySession";
import { detectGreenhouseJob } from "../greenhouse/greenhouseDetection";
import type { Job } from "../../types/job";

console.log("Running Greenhouse discovery tests...");

const detected = detectGreenhouseJob(
  "https://job-boards.greenhouse.io/Affirm/jobs/7985862003?gh_src=linkedin"
);
assert.ok(detected);
assert.equal(detected.identity.canonicalId, "greenhouse:affirm:7985862003");
assert.equal(
  detected.canonicalUrl,
  "https://job-boards.greenhouse.io/affirm/jobs/7985862003"
);

for (const url of [
  "http://job-boards.greenhouse.io/affirm/jobs/7985862003",
  "https://boards.greenhouse.io/affirm/jobs/7985862003",
  "https://job-boards.greenhouse.io/affirm/jobs/not-a-number",
  "https://job-boards.greenhouse.io/affirm/",
  "https://example.com/affirm/jobs/7985862003",
  "not a url",
]) {
  assert.equal(detectGreenhouseJob(url), null, `Expected unsupported URL: ${url}`);
}

const now = 1_000_000;
const jobA: Job = {
  source: "linkedin",
  externalJobId: "4470021362",
  title: "Software Engineer",
  company: "Affirm",
  location: "Remote",
  url: "https://www.linkedin.com/jobs/view/4470021362/",
};
const jobB: Job = {
  ...jobA,
  externalJobId: "4470029105",
  url: "https://www.linkedin.com/jobs/view/4470029105/",
};
const sessionA = createDiscoverySession("session-a", 10, jobA, now);

const sameTab = resolveAssociation(
  [sessionA],
  10,
  undefined,
  "greenhouse:affirm:7985862003",
  now + 100
);
assert.equal(sameTab.kind, "automatic");
assert.equal(sameTab.session?.sourceJob.externalJobId, jobA.externalJobId);

const newTab = resolveAssociation(
  [sessionA],
  20,
  10,
  "greenhouse:affirm:7985862003",
  now + 100
);
assert.equal(newTab.kind, "automatic");

const unrelatedTab = resolveAssociation(
  [sessionA],
  30,
  99,
  "greenhouse:affirm:7985862003",
  now + 100
);
assert.equal(unrelatedTab.kind, "ambiguous");
assert.equal(unrelatedTab.candidates.length, 1);

const expired = resolveAssociation(
  [sessionA],
  10,
  undefined,
  "greenhouse:affirm:7985862003",
  now + DISCOVERY_SESSION_TTL_MS + 1
);
assert.equal(expired.kind, "unlinked");
assert.equal(expired.candidates.length, 0);

const sessionB = createDiscoverySession("session-b", 10, jobB, now + 1);
const ambiguous = resolveAssociation(
  [sessionA, sessionB],
  20,
  10,
  "greenhouse:affirm:7985862003",
  now + 100
);
assert.equal(ambiguous.kind, "ambiguous");
assert.deepEqual(
  ambiguous.candidates.map((candidate) => candidate.sourceJob.externalJobId).sort(),
  [jobA.externalJobId, jobB.externalJobId].sort()
);

// Both postings remain distinct candidates even though they can share one ATS job.
const linkedA = markSessionLinked(sessionA, 20, "greenhouse:affirm:7985862003");
const linkedB = markSessionLinked(sessionB, 21, "greenhouse:affirm:7985862003");
assert.notEqual(linkedA.sourceJob.externalJobId, linkedB.sourceJob.externalJobId);
assert.equal(linkedA.linkedAtsJobId, linkedB.linkedAtsJobId);

const duplicate = resolveAssociation(
  [linkedA],
  20,
  10,
  "greenhouse:affirm:7985862003",
  now + 100
);
assert.equal(duplicate.kind, "linked");
assert.equal(duplicate.session?.sessionId, linkedA.sessionId);

// A supported host with an unknown page layout is deliberately non-destructive.
assert.equal(
  detectGreenhouseJob("https://job-boards.greenhouse.io/embed/job_app?for=affirm&token=7985862003"),
  null
);

console.log("Greenhouse discovery tests passed.");
