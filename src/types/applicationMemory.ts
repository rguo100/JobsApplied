import type { Timestamp } from "firebase/firestore";
import type { AtsProvider } from "./ats";

export const APPLICATION_MEMORY_SCHEMA_VERSION = 1 as const;
export const APPLICATION_MEMORY_V2_SCHEMA_VERSION = 2 as const;
export const APPLICATION_MEMORY_ANSWER_V2_SCHEMA_VERSION = 1 as const;
export const MAX_APPLICATION_MEMORY_ANSWERS = 10;
export const MAX_APPLICATION_MEMORY_LIST_VALUES = 10;
export const MAX_APPLICATION_MEMORY_CHOICE_OPTIONS = 10;

export type ApplicationMemoryFieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "select"
  | "radio"
  | "checkbox"
  | "multiselect"
  | "other";

export interface ApplicationMemoryChoice {
  value: string;
  label: string;
}

export interface ApplicationMemoryChoiceMetadata {
  options: ApplicationMemoryChoice[];
}

export interface SavedApplicationAnswer {
  fieldKey: string;
  question: string;
  fieldType: ApplicationMemoryFieldType;
  value: string | boolean | string[];
  choiceMetadata?: ApplicationMemoryChoiceMetadata;
}

export type ApplicationMemoryAnswerValue = SavedApplicationAnswer["value"];

export interface ResumeReference {
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  storageStatus: "reference_only";
  storagePath: null;
}

/** Legacy V1 parent. V1 stores answers in the parent document and is read-only in V2 rules. */
export interface ApplicationMemoryV1 {
  schemaVersion: typeof APPLICATION_MEMORY_SCHEMA_VERSION;
  atsJobId: string;
  provider: AtsProvider;
  canonicalUrl: string;
  status: "draft";
  answers: SavedApplicationAnswer[];
  resume: ResumeReference | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Compatibility alias retained until Task 6.0C moves repository reads to a discriminated model. */
export type ApplicationMemory = ApplicationMemoryV1;

/** V2 parent: answers are independently stored in its answers subcollection. */
export interface ApplicationMemoryV2 {
  schemaVersion: typeof APPLICATION_MEMORY_V2_SCHEMA_VERSION;
  atsJobId: string;
  /** The encoded ATS document ID; must equal the parent document path segment. */
  atsJobDocumentId: string;
  provider: AtsProvider;
  boardToken: string;
  jobId: string;
  canonicalUrl: string;
  status: "draft";
  resume: ResumeReference | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ApplicationMemoryAnswerV2 {
  schemaVersion: typeof APPLICATION_MEMORY_ANSWER_V2_SCHEMA_VERSION;
  atsJobId: string;
  fieldKey: string;
  question: string;
  fieldType: ApplicationMemoryFieldType;
  value: ApplicationMemoryAnswerValue;
  choiceMetadata?: ApplicationMemoryChoiceMetadata;
  /** Optimistic-concurrency version; creation starts at one. */
  revision: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ApplicationMemoryDocument = ApplicationMemoryV1 | ApplicationMemoryV2;

export interface ApplicationMemoryV2ParentInput {
  atsJobId: string;
  atsJobDocumentId: string;
  canonicalUrl: string;
  resume?: ResumeReference | null;
}

export interface ApplicationMemoryAnswerV2Input {
  atsJobId: string;
  fieldKey: string;
  question: string;
  fieldType: ApplicationMemoryFieldType;
  value: ApplicationMemoryAnswerValue;
  choiceMetadata?: ApplicationMemoryChoiceMetadata;
}

export interface ApplicationMemoryDraftInput {
  atsJobId: string;
  canonicalUrl: string;
  answers?: SavedApplicationAnswer[];
  resume?: ResumeReference | null;
}

export interface ApplicationMemoryAnswerUpdateOptions {
  removeFieldKeys?: string[];
}
