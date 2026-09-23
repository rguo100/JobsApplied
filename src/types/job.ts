import { Application } from "./application";

export interface Job {
  source: "linkedin";
  externalJobId: string;
  title: string;
  company: string;
  location: string;
  url: string;
}

export interface MutationIdentity {
  requestId: string;
  source: string;
  externalJobId: string;
}

export type ExtensionMessage =
  | { type: "GET_CURRENT_JOB" }
  | { type: "CURRENT_JOB_RESPONSE"; job: Job | null }
  | { type: "JOB_UPDATED"; job: Job | null }
  // Content ↔ Background Bridge messages for Day 4 Inline Widget
  | { type: "AUTH_STATE_REQUEST" }
  | { type: "AUTH_STATE_RESPONSE"; isAuthenticated: boolean; uid?: string }
  | { type: "APPLICATION_SUBSCRIBE"; source: string; externalJobId: string }
  | { type: "APPLICATION_UNSUBSCRIBE"; source: string; externalJobId: string }
  | { type: "APPLICATION_DATA"; source: string; externalJobId: string; application: Application | null }
  | { type: "APPLICATION_ERROR"; source: string; externalJobId: string; error: string }
  | ({ type: "MARK_JOB_APPLIED"; job: Job } & MutationIdentity)
  | ({ type: "MARK_JOB_APPLIED_RESPONSE"; success: boolean; error?: string } & MutationIdentity)
  | ({ type: "DELETE_APPLICATION" } & MutationIdentity)
  | ({ type: "DELETE_APPLICATION_RESPONSE"; success: boolean; error?: string } & MutationIdentity);

export function matchesMutationIdentity(
  message: MutationIdentity,
  expected: MutationIdentity
): boolean {
  return (
    message.requestId === expected.requestId &&
    message.source === expected.source &&
    message.externalJobId === expected.externalJobId
  );
}

/**
 * Checks if a company string is a fallback or empty placeholder.
 */
export function isFallbackCompany(company?: string | null): boolean {
  if (!company) return true;
  const trimmed = company.trim();
  if (trimmed.length === 0) return true;
  const lower = trimmed.toLowerCase();
  return lower === "unknown company";
}

/**
 * Checks if a location string is a fallback or empty placeholder.
 */
export function isFallbackLocation(location?: string | null): boolean {
  if (!location) return true;
  const trimmed = location.trim();
  if (trimmed.length === 0) return true;
  const lower = trimmed.toLowerCase();
  return lower === "location not specified" || lower === "unknown location";
}

/**
 * Checks if a title string is a fallback or empty placeholder.
 */
export function isFallbackTitle(title?: string | null): boolean {
  if (!title) return true;
  const trimmed = title.trim();
  if (trimmed.length === 0) return true;
  const lower = trimmed.toLowerCase();
  return lower === "unknown title" || lower === "job title";
}

/**
 * Checks whether an incoming job extraction contains higher-quality (non-fallback)
 * metadata than the current job.
 */
export function hasBetterJobMetadata(current: Job, incoming: Job): boolean {
  if (isFallbackCompany(current.company) && !isFallbackCompany(incoming.company)) {
    return true;
  }
  if (isFallbackLocation(current.location) && !isFallbackLocation(incoming.location)) {
    return true;
  }
  if (isFallbackTitle(current.title) && !isFallbackTitle(incoming.title)) {
    return true;
  }
  return false;
}

/**
 * Merges two Job objects for the same logical job, replacing fallback fields
 * in `current` with high-quality extracted values from `incoming`.
 */
export function mergeJobMetadata(current: Job, incoming: Job): Job {
  return {
    ...current,
    title: !isFallbackTitle(incoming.title) ? incoming.title : current.title,
    company: !isFallbackCompany(incoming.company) ? incoming.company : current.company,
    location: !isFallbackLocation(incoming.location) ? incoming.location : current.location,
    url: incoming.url || current.url,
  };
}

