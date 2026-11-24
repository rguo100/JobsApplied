import {
  APPLICATION_MEMORY_SCHEMA_VERSION,
  ApplicationMemoryChoice,
  ApplicationMemoryDraftInput,
  ApplicationMemoryFieldType,
  MAX_APPLICATION_MEMORY_ANSWERS,
  MAX_APPLICATION_MEMORY_CHOICE_OPTIONS,
  MAX_APPLICATION_MEMORY_LIST_VALUES,
  ResumeReference,
  SavedApplicationAnswer,
} from "../types/applicationMemory";
import { parseAtsJobId } from "../types/ats";

const FIELD_TYPES = new Set<ApplicationMemoryFieldType>([
  "text", "textarea", "email", "tel", "select", "radio",
  "checkbox", "multiselect", "other",
]);
const FIELD_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SENSITIVE_PATTERN = /(?:password|passcode|secret|government|social[ _-]*security|\bssn\b|\bsin\b|date[ _-]*of[ _-]*birth|\bdob\b|demographic|ethnicity|\brace\b|gender|disability|veteran|medical|health|\beeo\b|work[ _-]*authorization|sponsor|salary|compensation)/i;
const MAX_FIELD_KEY_LENGTH = 128;
const MAX_QUESTION_LENGTH = 500;
const MAX_VALUE_LENGTH = 4_000;
const MAX_OPTION_VALUE_LENGTH = 500;
const MAX_CANONICAL_URL_LENGTH = 2_048;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_MIME_TYPE_LENGTH = 128;
const MAX_RESUME_FILE_SIZE = 50 * 1024 * 1024;
const MAX_SERIALIZED_PAYLOAD_BYTES = 100_000;

function requireTrimmedString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw new Error(`${name} is invalid or too long.`);
  return trimmed;
}

function validateChoice(choice: ApplicationMemoryChoice): ApplicationMemoryChoice {
  if (!choice || typeof choice !== "object") throw new Error("Choice metadata is invalid.");
  return {
    value: requireTrimmedString(choice.value, "Choice value", MAX_OPTION_VALUE_LENGTH),
    label: requireTrimmedString(choice.label, "Choice label", MAX_OPTION_VALUE_LENGTH),
  };
}

function normalizeValue(answer: SavedApplicationAnswer): string | boolean | string[] {
  if (typeof answer.value === "boolean") {
    if (answer.fieldType !== "checkbox") throw new Error("Boolean answers require checkbox field type.");
    return answer.value;
  }
  if (Array.isArray(answer.value)) {
    if (!["checkbox", "multiselect"].includes(answer.fieldType)) {
      throw new Error("Array answers require checkbox or multiselect field type.");
    }
    if (answer.value.length > MAX_APPLICATION_MEMORY_LIST_VALUES) throw new Error("Answer has too many selected values.");
    return answer.value.map((value) => requireTrimmedString(value, "Answer value", MAX_OPTION_VALUE_LENGTH));
  }
  if (typeof answer.value !== "string") throw new Error("Unsupported answer value type.");
  if (answer.value.length > MAX_VALUE_LENGTH) throw new Error("Answer value is too long.");
  return answer.value;
}

export function validateAndNormalizeSavedAnswer(answer: SavedApplicationAnswer): SavedApplicationAnswer {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) throw new Error("Saved answer is invalid.");
  const fieldKey = requireTrimmedString(answer.fieldKey, "Field key", MAX_FIELD_KEY_LENGTH).toLowerCase();
  const question = requireTrimmedString(answer.question, "Question", MAX_QUESTION_LENGTH);
  if (!FIELD_KEY_PATTERN.test(fieldKey)) throw new Error("Field key must be a stable normalized identifier.");
  if (!FIELD_TYPES.has(answer.fieldType)) throw new Error("Unsupported application field type.");
  if (SENSITIVE_PATTERN.test(fieldKey) || SENSITIVE_PATTERN.test(question)) {
    throw new Error("Sensitive application fields cannot be stored in application memory.");
  }
  const normalized: SavedApplicationAnswer = {
    fieldKey,
    question,
    fieldType: answer.fieldType,
    value: normalizeValue(answer),
  };
  if (answer.choiceMetadata !== undefined) {
    if (!answer.choiceMetadata || !Array.isArray(answer.choiceMetadata.options)) throw new Error("Choice metadata is invalid.");
    if (answer.choiceMetadata.options.length > MAX_APPLICATION_MEMORY_CHOICE_OPTIONS) throw new Error("Choice metadata has too many options.");
    normalized.choiceMetadata = { options: answer.choiceMetadata.options.map(validateChoice) };
  }
  return normalized;
}

export function validateAndNormalizeAnswers(answers: SavedApplicationAnswer[]): SavedApplicationAnswer[] {
  if (!Array.isArray(answers) || answers.length > MAX_APPLICATION_MEMORY_ANSWERS) {
    throw new Error("Application memory has too many answers.");
  }
  const normalized = answers.map(validateAndNormalizeSavedAnswer);
  if (new Set(normalized.map(({ fieldKey }) => fieldKey)).size !== normalized.length) {
    throw new Error("Application memory contains duplicate field keys.");
  }
  return normalized;
}

export function validateAndNormalizeResumeReference(resume: ResumeReference): ResumeReference {
  if (!resume || typeof resume !== "object" || Array.isArray(resume)) throw new Error("Resume reference is invalid.");
  if (resume.storageStatus !== "reference_only" || resume.storagePath !== null) throw new Error("Unsupported resume storage state.");
  const normalized: ResumeReference = {
    fileName: requireTrimmedString(resume.fileName, "Resume file name", MAX_FILE_NAME_LENGTH),
    storageStatus: "reference_only",
    storagePath: null,
  };
  if (resume.fileSize !== undefined) {
    if (!Number.isInteger(resume.fileSize) || resume.fileSize < 0 || resume.fileSize > MAX_RESUME_FILE_SIZE) throw new Error("Resume file size is invalid.");
    normalized.fileSize = resume.fileSize;
  }
  if (resume.mimeType !== undefined) normalized.mimeType = requireTrimmedString(resume.mimeType, "Resume MIME type", MAX_MIME_TYPE_LENGTH);
  return normalized;
}

export function validateApplicationMemoryInput(input: ApplicationMemoryDraftInput): ApplicationMemoryDraftInput {
  if (!input || typeof input !== "object") throw new Error("Application memory input is required.");
  const identity = parseAtsJobId(input.atsJobId);
  const canonicalUrl = requireTrimmedString(input.canonicalUrl, "Canonical URL", MAX_CANONICAL_URL_LENGTH);
  let url: URL;
  try { url = new URL(canonicalUrl); }
  catch { throw new Error("Canonical URL is invalid."); }
  const expectedPath = `/${identity.boardToken}/jobs/${identity.jobId}`;
  if (url.protocol !== "https:" || url.hostname !== "job-boards.greenhouse.io" || url.pathname.replace(/\/$/, "") !== expectedPath) {
    throw new Error("Canonical URL does not match the ATS job identity.");
  }
  const normalized: ApplicationMemoryDraftInput = { atsJobId: identity.canonicalId, canonicalUrl: `${url.origin}${expectedPath}` };
  if (input.answers !== undefined) normalized.answers = validateAndNormalizeAnswers(input.answers);
  if (input.resume !== undefined) normalized.resume = input.resume === null ? null : validateAndNormalizeResumeReference(input.resume);
  const serialized = JSON.stringify({ schemaVersion: APPLICATION_MEMORY_SCHEMA_VERSION, ...normalized });
  if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_PAYLOAD_BYTES) throw new Error("Application memory payload is too large.");
  return normalized;
}

export function assertSafeRemovalFieldKeys(fieldKeys: string[]): string[] {
  if (!Array.isArray(fieldKeys) || fieldKeys.length > MAX_APPLICATION_MEMORY_ANSWERS) throw new Error("Answer removal list is invalid.");
  return [...new Set(fieldKeys.map((key) => requireTrimmedString(key, "Field key", MAX_FIELD_KEY_LENGTH).toLowerCase()).map((key) => {
    if (!FIELD_KEY_PATTERN.test(key)) throw new Error("Field key must be a stable normalized identifier.");
    return key;
  }))];
}
