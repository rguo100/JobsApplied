import type { Timestamp } from "firebase/firestore";
import type { AtsProvider } from "./ats";

export const APPLICATION_MEMORY_SCHEMA_VERSION = 1 as const;
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

export interface ResumeReference {
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  storageStatus: "reference_only";
  storagePath: null;
}

export interface ApplicationMemory {
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

export interface ApplicationMemoryDraftInput {
  atsJobId: string;
  canonicalUrl: string;
  answers?: SavedApplicationAnswer[];
  resume?: ResumeReference | null;
}

export interface ApplicationMemoryAnswerUpdateOptions {
  removeFieldKeys?: string[];
}
