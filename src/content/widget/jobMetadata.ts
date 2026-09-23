import { Job } from "../../types/job";

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
 * metadata than the current job. Safe against null/undefined fields.
 */
export function hasBetterJobMetadata(
  current: Job | null | undefined,
  incoming: Job | null | undefined
): boolean {
  if (!current || !incoming) return false;
  if (current.source !== incoming.source || current.externalJobId !== incoming.externalJobId) {
    return false;
  }
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
 * Preserves source, externalJobId, and identity strictly.
 */
export function mergeJobMetadata(current: Job, incoming: Job): Job {
  if (!current) return incoming;
  if (!incoming) return current;

  return {
    source: current.source,
    externalJobId: current.externalJobId,
    title: !isFallbackTitle(incoming.title) ? incoming.title : current.title,
    company: !isFallbackCompany(incoming.company) ? incoming.company : current.company,
    location: !isFallbackLocation(incoming.location) ? incoming.location : current.location,
    url: incoming.url || current.url,
  };
}
