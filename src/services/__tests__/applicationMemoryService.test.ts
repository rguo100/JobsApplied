import assert from "node:assert/strict";
import type { Timestamp } from "firebase/firestore";
import type { ApplicationMemory, SavedApplicationAnswer } from "../../types/applicationMemory";
import { createApplicationMemoryPayload, mergeApplicationMemoryAnswers, setApplicationMemoryRepositoryTestContext } from "../applicationMemoryService";
import {
  validateAndNormalizeAnswers,
  validateAndNormalizeApplicationMemoryAnswerV2,
  validateAndNormalizeApplicationMemoryV2Parent,
  validateAndNormalizeResumeReference,
  validateApplicationMemoryInput,
} from "../../utils/applicationMemoryValidation";

console.log("Running Application Memory repository tests...");
const atsJobId = "greenhouse:affirm:7985862003";
const canonicalUrl = "https://job-boards.greenhouse.io/affirm/jobs/7985862003";
const first: SavedApplicationAnswer = {
  fieldKey: "years_experience",
  question: "How many years of experience do you have?",
  fieldType: "select",
  value: "5+",
  choiceMetadata: { options: [{ value: "5+", label: "5 or more" }] },
};
const second: SavedApplicationAnswer = {
  fieldKey: "preferred_teams",
  question: "Preferred teams",
  fieldType: "multiselect",
  value: ["platform", "infrastructure"],
};
const timestamp = { marker: "created" } as unknown as Timestamp;
const created = createApplicationMemoryPayload({ atsJobId, canonicalUrl, answers: [first], resume: null }, null, timestamp);
assert.equal(created.schemaVersion, 1);
assert.equal(created.status, "draft");
assert.equal(created.createdAt, timestamp);
assert.deepEqual(created.answers, [first]);
assert.equal(created.resume, null);
assert.equal("confirmed" in created, false);

const existing = created as unknown as ApplicationMemory;
const merged = mergeApplicationMemoryAnswers(existing.answers, [{ ...first, value: "10+" }, second]);
assert.equal(merged.length, 2);
assert.equal(merged.find(({ fieldKey }) => fieldKey === first.fieldKey)?.value, "10+");
assert.deepEqual(merged.find(({ fieldKey }) => fieldKey === second.fieldKey)?.value, second.value);
assert.deepEqual(mergeApplicationMemoryAnswers(merged, [], [first.fieldKey]).map(({ fieldKey }) => fieldKey), [second.fieldKey]);

const updatedPayload = createApplicationMemoryPayload({ atsJobId, canonicalUrl, answers: [second] }, existing, { marker: "updated" });
assert.equal(updatedPayload.createdAt, timestamp);
assert.equal((updatedPayload.answers as SavedApplicationAnswer[]).length, 2);
assert.equal(updatedPayload.resume, null);

const resume = validateAndNormalizeResumeReference({ fileName: " resume.pdf ", fileSize: 1234, mimeType: "application/pdf", storageStatus: "reference_only", storagePath: null });
assert.equal(resume.fileName, "resume.pdf");
assert.equal(resume.storagePath, null);
assert.equal(validateApplicationMemoryInput({ atsJobId, canonicalUrl }).atsJobId, atsJobId);
const v2Parent = validateAndNormalizeApplicationMemoryV2Parent({
  atsJobId,
  atsJobDocumentId: encodeURIComponent(atsJobId),
  canonicalUrl,
  resume: null,
});
assert.equal(v2Parent.atsJobDocumentId, encodeURIComponent(atsJobId));
assert.equal(validateAndNormalizeApplicationMemoryAnswerV2({ atsJobId, ...first }).fieldKey, first.fieldKey);
assert.throws(() => validateAndNormalizeApplicationMemoryV2Parent({ atsJobId, atsJobDocumentId: "wrong", canonicalUrl }));
assert.throws(() => validateApplicationMemoryInput({ atsJobId, canonicalUrl: "https://example.com/job" }));
assert.throws(() => validateAndNormalizeAnswers([{ ...first, fieldKey: "date_of_birth", question: "Date of birth" }]));
assert.throws(() => validateAndNormalizeApplicationMemoryAnswerV2({ atsJobId, ...first, fieldKey: "date_of_birth" }));
assert.throws(() => validateAndNormalizeAnswers([{ ...first, fieldType: "text", value: true }]));
assert.throws(() => validateAndNormalizeAnswers(Array.from({ length: 11 }, (_, index) => ({ ...first, fieldKey: `answer_${index}` }))));
assert.throws(() => validateAndNormalizeAnswers([{ ...first, value: "x".repeat(4001) }]));
assert.throws(() => createApplicationMemoryPayload({ atsJobId: "greenhouse:other:1", canonicalUrl: "https://job-boards.greenhouse.io/other/jobs/1" }, existing, timestamp));
const otherJob = createApplicationMemoryPayload({ atsJobId: "greenhouse:affirm:7985862004", canonicalUrl: "https://job-boards.greenhouse.io/affirm/jobs/7985862004" }, null, timestamp);
assert.notEqual(otherJob.atsJobId, created.atsJobId);
assert.throws(() => setApplicationMemoryRepositoryTestContext({ firestore: {} as never, uid: "test", firestoreEmulatorHost: "127.0.0.1:8088" }));
setApplicationMemoryRepositoryTestContext(null);
console.log("Application Memory repository tests passed.");
