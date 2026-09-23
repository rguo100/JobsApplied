import { Job } from "../types/job";

const DETAIL_PANE_SELECTORS = [
  ".jobs-details__main-content",
  ".job-view-layout",
  ".scaffold-layout__detail",
  ".jobs-search__job-details--container",
  ".jobs-search__job-details",
  ".job-details-jobs-unified-top-card",
  "[data-view-name='job-details']",
  "#job-details",
  ".jobs-search-results-list__detail-pane",
  ".jobs-search-two-pane__detail",
  "main",
] as const;

const LOCATION_DIRECT_SELECTORS = [
  "[data-anonymize='job-location']",
  ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
  ".job-details-jobs-unified-top-card__primary-description span.tvm__text",
  ".jobs-unified-top-card__subtitle-secondary-grouping span",
  ".jobs-unified-top-card__subtitle-secondary-grouping",
  ".jobs-unified-top-card__bullet + span",
  ".topcard__flavor--bullet",
  ".top-card-layout__first-subline .topcard__flavor:not(a)",
  ".job-details-jobs-unified-top-card__tertiary-description",
  "[class*='job-details'] [class*='location']",
  "[class*='top-card'] [class*='location']",
] as const;

const LOCATION_CONTAINER_SELECTORS = [
  ".job-details-jobs-unified-top-card__primary-description-container",
  ".job-details-jobs-unified-top-card__primary-description",
  ".jobs-unified-top-card__primary-description-container",
  ".jobs-unified-top-card__primary-description",
  ".jobs-details__main-content .job-details-jobs-unified-top-card__primary-description",
  ".job-details-jobs-unified-top-card",
  ".top-card-layout__first-subline",
] as const;

const TITLE_SELECTORS = [
  "h1.job-details-jobs-unified-top-card__job-title",
  "h1.jobs-unified-top-card__job-title",
  ".job-details-jobs-unified-top-card__job-title",
  ".jobs-details__main-content h1",
  ".job-view-layout h1",
  "h2.topcard__title",
  "h1.top-card-layout__title",
  "h1[tabindex='-1']",
  "h1",
] as const;

/**
 * Normalizes text by removing redundant whitespace and trimming.
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[·•\-\s|]+|[·•\-\s|]+$/g, "")
    .trim();
}

/**
 * Finds the active job detail pane on LinkedIn SPA to scope selectors
 * and prevent picking elements from other job cards in the search-results list.
 */
export function getActiveDetailPane(doc: Document = document): Element | null {
  for (const selector of DETAIL_PANE_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el) return el;
  }

  return null;
}

/** True only when getActiveDetailPane had to use its final, page-wide main fallback. */
export function isBroadMainDetailPane(element: Element): boolean {
  return (
    element.tagName.toLowerCase() === "main" &&
    !DETAIL_PANE_SELECTORS.slice(0, -1).some((selector) => element.matches(selector))
  );
}

/**
 * Extracts LinkedIn Job ID from the current URL or DOM context.
 */
export function extractLinkedInJobId(currentUrl: string, doc: Document = document): string | null {
  try {
    const parsedUrl = new URL(currentUrl);

    // 1. Check query parameter: currentJobId=1234567890 (common on /jobs/search-results/ and collections)
    const queryJobId = parsedUrl.searchParams.get("currentJobId");
    if (queryJobId && /^\d+$/.test(queryJobId.trim())) {
      return queryJobId.trim();
    }

    // 2. Check path pattern: /jobs/view/1234567890/
    const pathMatch = parsedUrl.pathname.match(/\/jobs\/view\/(\d+)/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    // 3. Fallback: Search in DOM active card or selected element
    const activeItem = doc.querySelector(
      ".jobs-search-results-list__list-item--active [data-job-id], [data-job-id].jobs-search-results-list__list-item--active, .job-card-container--clickable[data-job-id]"
    );
    if (activeItem) {
      const dataJobId = activeItem.getAttribute("data-job-id") || activeItem.getAttribute("data-entity-urn");
      if (dataJobId) {
        const idMatch = dataJobId.match(/(\d{6,})/);
        if (idMatch && idMatch[1]) {
          return idMatch[1];
        }
      }
    }
  } catch {
    // URL parsing failed
  }
  return null;
}

/**
 * Extracts Job Title from standard LinkedIn layouts.
 */
export function extractTitle(doc: Document = document, detailPane: Element | null = null): string {
  const scope = detailPane || doc;

  for (const selector of TITLE_SELECTORS) {
    const el = scope.querySelector(selector);
    const text = normalizeText(el?.textContent);
    if (
      text &&
      text.length > 1 &&
      !text.toLowerCase().includes("linkedin") &&
      !text.toLowerCase().includes("search results")
    ) {
      return text;
    }
  }

  // Fallback to document title
  const pageTitle = doc.title;
  if (pageTitle && pageTitle.includes("| LinkedIn")) {
    const clean = normalizeText(pageTitle.split("|")[0]);
    if (clean.length > 0) return clean;
  }

  return "Unknown Title";
}

/**
 * Extracts Company Name scoped to the active job detail pane.
 */
export function extractCompany(doc: Document = document, detailPane: Element | null = null): string {
  const scope = detailPane || doc;

  const selectors = [
    // 1. Data attributes and specific tracking anchors in detail pane
    "[data-anonymize='company-name']",
    "a[data-tracking-control-name*='company']",
    "a[data-tracking-control-name*='org-name']",

    // 2. Modern LinkedIn Unified Top Card company name classes
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    ".jobs-unified-top-card__company-name",

    // 3. Primary description anchors (first link is usually the company link)
    ".job-details-jobs-unified-top-card__primary-description a.app-aware-link",
    ".job-details-jobs-unified-top-card__primary-description a",
    ".jobs-unified-top-card__subtitle-primary-grouping a",
    ".jobs-unified-top-card__primary-description a",

    // 4. Any company URL link inside detail pane top area
    ".job-details-jobs-unified-top-card a[href*='/company/']",
    ".jobs-details__main-content a[href*='/company/']",
    "a[href*='/company/']",

    // 5. Classic top-card selectors
    "a.topcard__org-name-link",
    ".top-card-layout__first-subline a",
    ".topcard__flavor--black-link",
  ];

  for (const selector of selectors) {
    const elements = scope.querySelectorAll(selector);
    for (const el of elements) {
      const text = normalizeText(el.textContent);
      if (
        text &&
        text.length > 0 &&
        !text.toLowerCase().includes("see all") &&
        !text.toLowerCase().includes("linkedin")
      ) {
        return text;
      }
    }
  }

  // Fallback: Parse company from the primary description line if present
  const primaryDesc = scope.querySelector(
    ".job-details-jobs-unified-top-card__primary-description, .jobs-unified-top-card__primary-description"
  );
  if (primaryDesc) {
    const rawText = primaryDesc.textContent || "";
    const parts = rawText.split(/[·•|]/).map(normalizeText).filter(Boolean);
    if (parts.length > 0 && parts[0].length > 0) {
      return parts[0];
    }
  }

  return "Unknown Company";
}

/**
 * Filter to verify if a text fragment represents non-location metadata.
 */
function isMetadataNoise(text: string): boolean {
  if (!text || text.length < 2) return true;
  const lower = text.toLowerCase().trim();

  // Exact matches for noise words
  const exactNoise = [
    "reposted",
    "posted",
    "promoted",
    "viewed",
    "actively recruiting",
    "easy apply",
    "full-time",
    "part-time",
    "contract",
    "temporary",
    "internship",
    "other",
    "see all",
    "see recent activity",
  ];
  if (exactNoise.includes(lower)) return true;

  // Pattern matches for LinkedIn metadata tokens
  const noisePatterns = [
    /\b\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\b/i,
    /\b(?:reposted|posted)\s+\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\b/i,
    /\b\d+\s+applicants?\b/i,
    /\bover\s+\d+\s+applicants?\b/i,
    /\bbe\s+among\s+the\s+first\b/i,
    /\bactively\s+recruiting\b/i,
    /\beasy\s+apply\b/i,
    /\bconnections?\s+work\s+here\b/i,
    /\balumni\s+work\s+here\b/i,
    /\bschool\s+alumni\b/i,
    /\bmatches\s+your\s+preferences\b/i,
  ];

  return noisePatterns.some((pattern) => pattern.test(lower));
}

/**
 * Validates whether a given cleaned string looks like a legitimate location.
 */
function isValidLocationToken(text: string, companyName: string = ""): boolean {
  if (!text || text.length < 2) return false;
  const lower = text.toLowerCase().trim();

  // Cannot match company name
  if (companyName && lower === companyName.toLowerCase().trim()) {
    return false;
  }

  // Cannot be pure metadata noise
  if (isMetadataNoise(lower)) {
    return false;
  }

  // Reject generic action labels
  if (["see all", "apply", "save", "share", "follow", "viewed"].includes(lower)) {
    return false;
  }

  return true;
}

/**
 * Parses and extracts pure location from a metadata line or combined container string.
 * e.g.:
 * "Montreal, QC · 1 week ago · 23 applicants" -> "Montreal, QC"
 * "Cisco · Montreal, QC · 1 week ago · 23 applicants" -> "Montreal, QC"
 * "Victoria, BC (Remote)" -> "Victoria, BC (Remote)"
 * "Toronto, ON · Remote" -> "Toronto, ON (Remote)"
 */
export function extractLocationFromMetadataLine(rawText: string, companyName: string = ""): string | null {
  if (!rawText) return null;

  // Split on common LinkedIn delimiters: middot, bullet, pipe, newline
  const parts = rawText
    .split(/[·•|\n\r\t]/)
    .map(normalizeText)
    .filter((p) => p.length > 0);

  const candidateTokens: string[] = [];

  for (const part of parts) {
    // If part contains mixed metadata like "Montreal, QC 1 week ago", strip trailing age/applicants
    let cleaned = part
      .replace(/(?:reposted\s+)?\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago.*$/i, "")
      .replace(/(?:over\s+)?\d+\s+applicants?.*$/i, "")
      .replace(/actively recruiting.*$/i, "")
      .trim();

    cleaned = normalizeText(cleaned);

    if (isValidLocationToken(cleaned, companyName)) {
      candidateTokens.push(cleaned);
    }
  }

  if (candidateTokens.length === 0) {
    return null;
  }

  // Check if we have both a geographic location and a workplace type (e.g. "Toronto, ON" and "Remote")
  if (candidateTokens.length >= 2) {
    const primary = candidateTokens[0];
    const secondary = candidateTokens[1];
    const isWorkplaceType = /^(?:remote|hybrid|on-site)$/i.test(secondary);

    if (isWorkplaceType) {
      // Format as "City, Province (Remote)"
      return `${primary} (${secondary.charAt(0).toUpperCase() + secondary.slice(1).toLowerCase()})`;
    }
    return primary;
  }

  return candidateTokens[0];
}

/**
 * Extracts Job Location scoped to the active job detail pane.
 */
export function extractLocation(
  doc: Document = document,
  detailPane: Element | null = null,
  companyName: string = "",
  activeJobId: string = ""
): string {
  const scope = detailPane || doc;

  // 1. Direct and specific location selectors
  for (const selector of LOCATION_DIRECT_SELECTORS) {
    const elements = scope.querySelectorAll(selector);
    for (const el of elements) {
      const rawText = el.textContent || "";
      const parsed = extractLocationFromMetadataLine(rawText, companyName);
      if (parsed) {
        return parsed;
      }
    }
  }

  // 2. Primary description containers (often contain company, location, date, applicants)
  for (const selector of LOCATION_CONTAINER_SELECTORS) {
    const container = scope.querySelector(selector);
    if (container) {
      // First try any child spans
      const spans = container.querySelectorAll("span");
      for (const span of spans) {
        const spanText = span.textContent || "";
        const parsed = extractLocationFromMetadataLine(spanText, companyName);
        if (parsed) {
          return parsed;
        }
      }

      // Then try full container text
      const containerText = container.textContent || "";
      const parsed = extractLocationFromMetadataLine(containerText, companyName);
      if (parsed) {
        return parsed;
      }
    }
  }

  // 3. Generated-class LinkedIn variant: anchor traversal to the ACTIVE job's
  // canonical link, then inspect <p> siblings only within its nearest header.
  if (/^\d+$/.test(activeJobId)) {
    const activeJobLink = scope.querySelector(
      `a[href*="/jobs/view/${activeJobId}/"]`
    );
    const metadataMarker = /(?:\breposted\b|\b\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago\b|\bapplicants?\b|\bpeople\s+clicked\s+apply\b)/i;

    let headerCandidate = activeJobLink?.parentElement || null;
    while (headerCandidate && headerCandidate !== scope) {
      const metadataParagraphs = Array.from(headerCandidate.querySelectorAll("p"))
        .filter((paragraph) => !paragraph.contains(activeJobLink!))
        .map((paragraph) => normalizeText(paragraph.textContent))
        .filter((text) => metadataMarker.test(text))
        .sort((a, b) => a.length - b.length);

      if (metadataParagraphs.length > 0) {
        const parsed = extractLocationFromMetadataLine(metadataParagraphs[0], companyName);
        if (parsed) return parsed;
        // The nearest active-job header had a metadata paragraph. Do not
        // broaden to an outer container that could include result-list cards.
        break;
      }

      headerCandidate = headerCandidate.parentElement;
    }
  }

  return "Location not specified";
}

/**
 * Calculates Canonical or clean URL for the LinkedIn job.
 */
export function buildCanonicalUrl(jobId: string | null, currentUrl: string): string {
  if (jobId) {
    return `https://www.linkedin.com/jobs/view/${jobId}/`;
  }
  return currentUrl.split("?")[0];
}

/**
 * Main extractor function that checks if page is a LinkedIn Job page and extracts details.
 */
export function extractLinkedInJob(
  doc: Document = document,
  currentUrl: string = window.location.href
): Job | null {
  const isLinkedInHost = currentUrl.includes("linkedin.com");
  const isJobPath = currentUrl.includes("/jobs/") || currentUrl.includes("/jobs?") || currentUrl.endsWith("/jobs");

  if (!isLinkedInHost || !isJobPath) {
    return null;
  }

  const jobId = extractLinkedInJobId(currentUrl, doc);

  // If no job ID can be resolved, it is likely not an active job view
  if (!jobId) {
    return null;
  }

  // Scope DOM parsing to the active right-hand detail pane
  const detailPane = getActiveDetailPane(doc);

  const title = extractTitle(doc, detailPane);
  const company = extractCompany(doc, detailPane);
  const location = extractLocation(doc, detailPane, company, jobId);
  const canonicalUrl = buildCanonicalUrl(jobId, currentUrl);

  return {
    source: "linkedin",
    externalJobId: jobId,
    title,
    company,
    location,
    url: canonicalUrl,
  };
}
